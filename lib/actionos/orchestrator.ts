import { ActionStateMachine } from "./state-machine";
import { createNAtlasProvider } from "@/lib/ai/n-atlas";
import { ActionOSPlanner } from "./planner";
import { ActionOSExecutor } from "./executor";
import { ActionOSVerifier } from "./verifier";
import { ActionOSGuardrails } from "./guardrails";
import { getRepositoryContainer, type TenantContext } from "@/lib/repositories";
import { toolRegistry } from "./tool-registry";
import { computeEventHash, signEventHash, GENESIS_LEDGER_HASH } from "./crypto-ledger";
import { webhookDispatcher } from "./webhook-dispatcher";
import type {
  ActionSession,
  Customer,
  Policy,
  MemberRole,
} from "@/types/database";
import type {
  ActionLedgerEvent,
  AuthorizationDetails,
  AuthenticatedExecutionContext,
  WorkflowExecutionContext,
  UnderwriterQuote,
} from "@/types/actionos";
import { isDemoMode } from "@/lib/runtime/mode";
import { formatNaira, formatDate } from "@/lib/utils";
import { createWorkflowExecutionContext } from "@/lib/runtime/execution-context";

export interface StartWorkflowInput {
  inputText: string;
  inputAudioUrl?: string;
  channel: "web" | "voice" | "whatsapp" | "telegram" | "api";
  language?: string;
  executionContext: AuthenticatedExecutionContext | WorkflowExecutionContext;
}

export interface WorkflowStepResult {
  sessionId: string;
  status: ActionSession["status"];
  intent: string;
  confidence: number;
  message: string;
  authorizationRequired: boolean;
  authorizationDetails: AuthorizationDetails | null;
  amount?: number;
  currency?: string;
  events: ActionLedgerEvent[];
}

export class ActionOSOrchestrator {
  private nAtlas = createNAtlasProvider();
  private planner = new ActionOSPlanner();
  private executor = new ActionOSExecutor();
  private verifier = new ActionOSVerifier();
  private guardrails = new ActionOSGuardrails();

  /**
   * Cryptographically append an event to the Action Ledger using SHA-256 hash chaining
   * Consequential and critical events are synchronously persisted and confirmed.
   */
  private async appendLedgerEvent(
    events: ActionLedgerEvent[],
    ev: Omit<ActionLedgerEvent, "previousHash" | "hash" | "signature">
  ): Promise<ActionLedgerEvent> {
    const previousHash =
      events.length > 0 && events[events.length - 1].hash
        ? events[events.length - 1].hash!
        : GENESIS_LEDGER_HASH;

    const hash = computeEventHash(ev, previousHash);
    const signature = signEventHash(hash);

    const eventClass =
      ev.eventClass ||
      (ev.action.includes("payment") ||
      ev.action.includes("renewal") ||
      ev.action.includes("refund") ||
      ev.isCompensating
        ? "critical"
        : ev.action.includes("authorization") || ev.action.includes("certificate")
        ? "consequential"
        : "informational");

    const completeEvent: ActionLedgerEvent = {
      ...ev,
      sequenceNumber: events.length + 1,
      previousHash,
      hash,
      signature,
      signingKeyVersion: "v1-2026",
      eventClass,
    };

    events.push(completeEvent);

    // Synchronously confirm critical and consequential events to prevent un-audited state mutation
    const repos = getRepositoryContainer();
    if (eventClass === "critical" || eventClass === "consequential") {
      await repos.ledger.appendEvent(completeEvent);
    } else {
      repos.ledger.appendEvent(completeEvent).catch((err) => {
        console.warn(`[ActionLedger] Telemetry delayed: ${err.message}`);
      });
    }

    return completeEvent;
  }

  /**
   * Start a new natural language or voice workflow session.
   * Executes pre-authorization steps (Identity -> Policy -> Eligibility -> Quote)
   * and yields at the authorization gate if high-risk actions are required.
   */
  async startWorkflow(input: StartWorkflowInput): Promise<WorkflowStepResult> {
    const repos = getRepositoryContainer();
    const sessionId = `act_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const isDemo = isDemoMode();

    // Strict authentication enforcement: zero implicit fallback
    const auth: AuthenticatedExecutionContext =
      input.executionContext && "auth" in input.executionContext
        ? input.executionContext.auth
        : (input.executionContext as AuthenticatedExecutionContext);
    if (!auth) {
      throw new Error(
        "Security enforcement violation: executionContext is required to execute an ActionOS workflow."
      );
    }

    if (!isDemo && auth.isDemo) {
      throw new Error(
        "Security enforcement violation: Demo execution context cannot be used in production runtime mode."
      );
    }

    if (!auth.organizationId) {
      throw new Error("Tenant boundary violation: organizationId is required in executionContext.");
    }

    if (!auth.role) {
      throw new Error("Role enforcement violation: role is required in executionContext.");
    }

    if (!auth.customerId && auth.role === "customer") {
      throw new Error("Identity enforcement violation: customerId is required for customer role.");
    }

    const orgId = auth.organizationId;
    const customerId = auth.customerId;

    const sm = new ActionStateMachine("received");
    const events: ActionLedgerEvent[] = [];

    // Session record persisted via repository
    const session = await repos.sessions.create({
      id: sessionId,
      customer_id: customerId,
      organization_id: orgId,
      channel: input.channel,
      language: input.language || "en-NG",
      input_text: input.inputText,
      input_audio_url: input.inputAudioUrl || null,
      intent: null,
      status: "received",
      metadata: { aiProvider: this.nAtlas.name },
    });

    // Outbound webhook dispatch
    webhookDispatcher.broadcast("action.started", {
      sessionId,
      channel: input.channel,
      inputText: input.inputText,
    });

    // 1. Move to UNDERSTANDING
    sm.transition("understanding", "Parsing natural language input with N-ATLAS");
    session.status = "understanding";
    await repos.sessions.updateStatus(sessionId, "understanding");

    await this.appendLedgerEvent(events, {
      id: `ev_${Date.now()}_rec`,
      sessionId,
      timestamp: new Date().toISOString(),
      action: "intent_detection",
      description: `Input received via ${input.channel}: "${input.inputText}"`,
      status: "verified",
      actor: "User",
    });

    const understanding = await this.nAtlas.understand({
      text: input.inputText,
      audioUrl: input.inputAudioUrl,
      language: input.language || "en-NG",
    });

    session.intent = understanding.intent;

    await this.appendLedgerEvent(events, {
      id: `ev_${Date.now()}_natlas`,
      sessionId,
      timestamp: new Date().toISOString(),
      action: "n_atlas_intent_extraction",
      description: `N-ATLAS Intent: '${understanding.intent}' (${Math.round(understanding.confidence * 100)}% confidence). ${understanding.normalizedText}`,
      status: "verified",
      actor: "N-ATLAS AI",
      metadata: { entities: understanding.entities },
    });

    // 2. Move to PLANNING
    sm.transition("planning", "Generating structured deterministic action plan");
    session.status = "planning";
    await repos.sessions.updateStatus(sessionId, "planning");

    const { plan, steps } = this.planner.createPlan({
      sessionId,
      understanding,
      customerId,
      organizationId: orgId,
    });

    await repos.plans.create(plan);
    await repos.steps.createMany(steps);

    await this.appendLedgerEvent(events, {
      id: `ev_${Date.now()}_plan`,
      sessionId,
      timestamp: new Date().toISOString(),
      action: "action_planning",
      description: `Action plan created: ${steps.length} ordered steps (Risk: ${plan.risk_level.toUpperCase()})`,
      status: "verified",
      actor: "ActionOS Engine",
    });

    // 3. Move to VALIDATING
    sm.transition("validating", "Executing pre-authorization validation steps");
    session.status = "validating";
    await repos.sessions.updateStatus(sessionId, "validating");

    const execContext = createWorkflowExecutionContext(auth, {
      sessionId,
      planId: plan.id,
      channel: input.channel,
      language: input.language,
      isSimulated: isDemo,
    });

    let activeCustomer: Customer | undefined;
    let activePolicy: Policy | undefined;
    let quoteAmount: number | undefined;
    let availableQuotes: UnderwriterQuote[] = [];
    let requiresAuth = false;
    let authDetails: AuthorizationDetails | null = null;
    let responseMessage = "";

    // Execute steps sequentially until we hit a step requiring confirmation
    for (const step of steps) {
      if (step.requires_confirmation) {
        requiresAuth = true;
        break; // Pause before high-risk execution (Payment / Renewal)
      }

      // Context overrides for dynamic inputs
      const stepOverride: Record<string, unknown> = {};
      if (step.tool_name === "get_policy" && activeCustomer) {
        stepOverride.customerId = activeCustomer.id;
      }
      if (step.tool_name === "check_renewal_eligibility" && activePolicy) {
        stepOverride.policy = activePolicy;
        stepOverride.policyId = activePolicy.id;
      }
      if (step.tool_name === "get_quote" && activePolicy) {
        stepOverride.policy = activePolicy;
        stepOverride.policyId = activePolicy.id;
      }

      const { result, ledgerEvent } = await this.executor.executeStep(
        step,
        execContext,
        stepOverride
      );

      // Append with cryptographic hash chain
      await this.appendLedgerEvent(events, ledgerEvent);

      if (!result.success) {
        // Escalate or Fail
        sm.transition("escalated", result.error?.message);
        session.status = "escalated";
        await repos.sessions.updateStatus(sessionId, "escalated");
        return {
          sessionId,
          status: "escalated",
          intent: understanding.intent,
          confidence: understanding.confidence,
          message: `ActionOS paused: ${result.error?.message}. A support manager has been notified.`,
          authorizationRequired: false,
          authorizationDetails: null,
          events,
        };
      }

      // Store context artifacts
      if (step.tool_name === "get_customer") {
        activeCustomer = result.data as unknown as Customer;
      } else if (step.tool_name === "get_policy") {
        activePolicy = result.data as unknown as Policy;
      } else if (step.tool_name === "get_quote") {
        const quoteRes = result.data as {
          quoteAmount: number;
          quotes: UnderwriterQuote[];
          selectedUnderwriter: string;
        };
        quoteAmount = quoteRes.quoteAmount;
        availableQuotes = quoteRes.quotes;
      }
    }

    // 4. Yield at AUTHORIZATION GATE if confirmation is required
    if (requiresAuth && activePolicy) {
      if (quoteAmount === undefined || quoteAmount <= 0) {
        sm.transition("failed", "Missing valid quote for authorization gate");
        session.status = "failed";
        await repos.sessions.updateStatus(sessionId, "failed");
        return {
          sessionId,
          status: "failed",
          intent: understanding.intent,
          confidence: understanding.confidence,
          message: "ActionOS halted: Missing valid quote amount. Authorization requires a verified, unexpired quote.",
          authorizationRequired: false,
          authorizationDetails: null,
          events,
        };
      }

      sm.transition("awaiting_authorization", "Halting workflow at Cryptographic Authorization Gate");
      session.status = "awaiting_authorization";

      const vehicleMeta = (activePolicy.metadata || {}) as Record<string, unknown>;
      const nextYearDate = new Date(activePolicy.expiry_date);
      nextYearDate.setFullYear(nextYearDate.getFullYear() + 1);

      const providerName =
        (vehicleMeta.underwriter as string) ||
        (vehicleMeta.provider_name as string) ||
        (vehicleMeta.provider as string) ||
        (vehicleMeta.insurance_company as string) ||
        (availableQuotes.length > 0 ? availableQuotes[0].underwriter : undefined);

      if (!providerName) {
        sm.transition("failed", "Missing underwriter/provider identity for renewal policy");
        session.status = "failed";
        await repos.sessions.updateStatus(sessionId, "failed");
        return {
          sessionId,
          status: "failed",
          intent: understanding.intent,
          confidence: understanding.confidence,
          message: "ActionOS halted: Missing insurer/provider identity. Authorization requires a verified underwriter.",
          authorizationRequired: false,
          authorizationDetails: null,
          events,
        };
      }

      const assetIdentifier =
        (vehicleMeta.vehicle_reg as string) ||
        (vehicleMeta.vehicle_plate as string) ||
        (vehicleMeta.plate_number as string) ||
        (vehicleMeta.chassis_number as string) ||
        activePolicy.policy_number;

      const assetName =
        (vehicleMeta.vehicle_name as string) ||
        (vehicleMeta.make_model as string) ||
        (vehicleMeta.asset_name as string) ||
        (activePolicy.policy_number ? `Asset for ${activePolicy.policy_number}` : "Insured Asset");

      const matchedQuote = availableQuotes.find((q) => q.amount === quoteAmount) || availableQuotes.find((q) => q.isRecommended) || availableQuotes[0];
      if (!matchedQuote || !matchedQuote.id) {
        sm.transition("failed", "Missing verified quote record from issued quotes");
        session.status = "failed";
        await repos.sessions.updateStatus(sessionId, "failed");
        return {
          sessionId,
          status: "failed",
          intent: understanding.intent,
          confidence: understanding.confidence,
          message: "ActionOS halted: Missing valid quote record. Authorization requires an issued underwriter quote.",
          authorizationRequired: false,
          authorizationDetails: null,
          events,
        };
      }

      const quoteId = matchedQuote.id;

      authDetails = {
        quoteId,
        sessionId,
        customerName: activeCustomer?.full_name || "Customer",
        providerName,
        amount: quoteAmount,
        currency: activePolicy.currency || "NGN",
        policyNumber: activePolicy.policy_number,
        policyId: activePolicy.id,
        assetIdentifier,
        assetName,
        currentExpiry: activePolicy.expiry_date,
        newExpiry: nextYearDate.toISOString().split("T")[0],
        requiresExplicitConsent: true,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 mins quote lock
        quotes: availableQuotes,
      };

      session.metadata = {
        ...session.metadata,
        authorizationDetails: authDetails,
        persistedQuote: {
          quoteId: matchedQuote.id,
          policyId: activePolicy.id,
          policyNumber: activePolicy.policy_number,
          customerId: activeCustomer?.id,
          amount: matchedQuote.amount,
          currency: matchedQuote.currency,
          providerName: matchedQuote.underwriter,
          expiresAt: authDetails.expiresAt,
        },
        quoteAmount,
      };

      await repos.sessions.updateStatus(sessionId, "awaiting_authorization");
      await repos.sessions.updateMetadata(sessionId, session.metadata);

      await this.appendLedgerEvent(events, {
        id: `ev_${Date.now()}_auth_gate`,
        sessionId,
        timestamp: new Date().toISOString(),
        action: "authorization_requested",
        description: `Authorization requested for ₦${quoteAmount.toLocaleString()} to renew ${activePolicy.policy_number}`,
        status: "pending",
        actor: "Policy Guardrail",
        metadata: {
          amount: quoteAmount,
          currency: "NGN",
          quotesCount: availableQuotes.length,
          policy: activePolicy.policy_number,
          expiry: activePolicy.expiry_date,
        },
      });

      webhookDispatcher.broadcast("authorization.required", {
        sessionId,
        amount: quoteAmount,
        policyNumber: activePolicy.policy_number,
      });

      responseMessage = `Found your policy ${activePolicy.policy_number} for ${authDetails!.assetName}. It expires on ${formatDate(activePolicy.expiry_date)}. Renewal quote is ${formatNaira(quoteAmount)}. Do you authorize payment and renewal?`;

      return {
        sessionId,
        status: "awaiting_authorization",
        intent: understanding.intent,
        confidence: understanding.confidence,
        message: responseMessage,
        authorizationRequired: true,
        authorizationDetails: authDetails,
        amount: quoteAmount,
        currency: "NGN",
        events,
      };
    }

    // Default completion if no steps required authorization
    sm.transition("completed", "Workflow completed without external confirmation");
    session.status = "completed";
    await repos.sessions.updateStatus(sessionId, "completed", new Date().toISOString());

    return {
      sessionId,
      status: "completed",
      intent: understanding.intent,
      confidence: understanding.confidence,
      message: "Action completed successfully.",
      authorizationRequired: false,
      authorizationDetails: null,
      events,
    };
  }

  /**
   * Resume and complete workflow after user confirms or declines authorization.
   * Includes distributed Saga transaction rollback with compensating actions.
   */
  async authorizeAndExecute(
    sessionId: string,
    authorized: boolean,
    authContext: AuthenticatedExecutionContext | WorkflowExecutionContext,
    options?: {
      selectedUnderwriter?: string;
      customAmount?: number;
      simulateSagaFailure?: boolean;
      authMethod?: "pin" | "biometric_webauthn" | "passkey" | "whatsapp_otp";
    }
  ): Promise<WorkflowStepResult> {
    const isDemo = isDemoMode();
    const auth: AuthenticatedExecutionContext =
      authContext && "auth" in authContext ? authContext.auth : (authContext as AuthenticatedExecutionContext);
    if (!auth) {
      throw new Error("Security enforcement violation: authContext is required to authorize and execute an ActionOS workflow.");
    }

    if (!isDemo && auth.isDemo) {
      throw new Error("Security enforcement violation: Demo execution context cannot be used in production runtime mode.");
    }

    if (!auth.organizationId) {
      throw new Error("Tenant boundary violation: organizationId is required in executionContext.");
    }

    if (!auth.role) {
      throw new Error("Role enforcement violation: role is required in executionContext.");
    }

    const role: MemberRole = auth.role;
    const callerOrgId = auth.organizationId;
    const callerCustomerId = auth.customerId;

    const tenantContext: TenantContext = {
      organizationId: callerOrgId,
      customerId: callerCustomerId,
      role,
    };

    const repos = getRepositoryContainer();
    const session = await repos.sessions.findById(sessionId, tenantContext);
    const plan = await repos.plans.findBySessionId(sessionId, tenantContext);
    const steps = plan ? await repos.steps.findByPlanId(plan.id, tenantContext) : [];
    const events = (await repos.ledger.getEventsBySessionId(sessionId, tenantContext)) || [];

    if (!session || !plan) {
      throw new Error(`Session '${sessionId}' not found.`);
    }

    if (callerOrgId && session.organization_id !== callerOrgId) {
      throw new Error("Tenant boundary violation: cannot authorize action belonging to another organization.");
    }

    const targetCustomerId = session.customer_id || callerCustomerId;
    if (!targetCustomerId && role === "customer") {
      throw new Error("Identity enforcement violation: customerId is required to execute workflow.");
    }

    const sm = new ActionStateMachine(session.status);

    if (!authorized) {
      sm.transition("cancelled", "User rejected authorization");
      session.status = "cancelled";
      await repos.sessions.updateStatus(sessionId, "cancelled");

      await this.appendLedgerEvent(events, {
        id: `ev_${Date.now()}_cancelled`,
        sessionId,
        timestamp: new Date().toISOString(),
        action: "authorization_rejected",
        description: "Customer declined payment authorization. Renewal workflow cancelled safely.",
        status: "completed",
        actor: "User",
      });

      return {
        sessionId,
        status: "cancelled",
        intent: plan.intent,
        confidence: plan.confidence,
        message: "Renewal cancelled. No charge was made.",
        authorizationRequired: false,
        authorizationDetails: null,
        events,
      };
    }

    // 1. Guardrail Check on Authorization
    const authDetails = session.metadata?.authorizationDetails as AuthorizationDetails | undefined;
    const persistedQuote = session.metadata?.persistedQuote as {
      quoteId: string;
      policyId?: string;
      policyNumber: string;
      customerId?: string;
      amount: number;
      currency: string;
      providerName: string;
      expiresAt: string;
    } | undefined;

    if (!authDetails || !authDetails.quoteId || typeof authDetails.amount !== "number" || authDetails.amount <= 0 || !persistedQuote) {
      sm.transition("failed", "Missing required persisted quote details for authorization");
      session.status = "failed";
      await repos.sessions.updateStatus(sessionId, "failed");
      return {
        sessionId,
        status: "failed",
        intent: plan.intent,
        confidence: plan.confidence,
        message: "Guardrail Failure: Authorization must bind to a verified, persisted quote record.",
        authorizationRequired: false,
        authorizationDetails: null,
        events,
      };
    }

    if (authDetails.quoteId !== persistedQuote.quoteId) {
      sm.transition("failed", "Quote record integrity mismatch between authorization and persisted record");
      session.status = "failed";
      await repos.sessions.updateStatus(sessionId, "failed");
      return {
        sessionId,
        status: "failed",
        intent: plan.intent,
        confidence: plan.confidence,
        message: "Guardrail Failure: Quote integrity violation. Authorization quote does not match persisted record.",
        authorizationRequired: false,
        authorizationDetails: null,
        events,
      };
    }

    // Verify quote expiration
    if (authDetails.expiresAt && new Date(authDetails.expiresAt).getTime() < Date.now()) {
      sm.transition("failed", "Quote has expired");
      session.status = "failed";
      await repos.sessions.updateStatus(sessionId, "failed");
      return {
        sessionId,
        status: "failed",
        intent: plan.intent,
        confidence: plan.confidence,
        message: "Guardrail Failure: Quote has expired. A fresh renewal quote must be requested.",
        authorizationRequired: false,
        authorizationDetails: null,
        events,
      };
    }

    // Check if user selected an alternative underwriter quote from the marketplace
    const selectedQuote = authDetails.quotes?.find(
      (q) =>
        (options?.selectedUnderwriter && q.underwriter.toLowerCase() === options.selectedUnderwriter.toLowerCase()) ||
        (options?.customAmount && q.amount === options.customAmount)
    );

    let quoteAmount: number;
    if (selectedQuote) {
      quoteAmount = selectedQuote.amount;
    } else if (options?.customAmount) {
      const validCustom = authDetails.quotes?.find((q) => q.amount === options.customAmount);
      if (!validCustom && options.customAmount !== authDetails.amount) {
        sm.transition("failed", "Requested custom amount does not match any verified quote");
        session.status = "failed";
        await repos.sessions.updateStatus(sessionId, "failed");
        return {
          sessionId,
          status: "failed",
          intent: plan.intent,
          confidence: plan.confidence,
          message: "Guardrail Failure: Custom amount does not match any approved underwriter quote.",
          authorizationRequired: false,
          authorizationDetails: null,
          events,
        };
      }
      quoteAmount = options.customAmount;
    } else {
      quoteAmount = authDetails.amount;
    }

    const expectedAuthAmount = selectedQuote ? selectedQuote.amount : authDetails.amount;

    const guardCheck = this.guardrails.validateAuthorization(true, quoteAmount, expectedAuthAmount);
    if (!guardCheck.passed) {
      sm.transition("failed", guardCheck.reason);
      session.status = "failed";
      await repos.sessions.updateStatus(sessionId, "failed");
      return {
        sessionId,
        status: "failed",
        intent: plan.intent,
        confidence: plan.confidence,
        message: `Guardrail Failure: ${guardCheck.reason}`,
        authorizationRequired: false,
        authorizationDetails: null,
        events,
      };
    }

    // 2. Move to EXECUTING
    sm.transition("executing", "Customer authorization confirmed; executing secure payment and renewal");
    session.status = "executing";
    await repos.sessions.updateStatus(sessionId, "executing");

    const authDesc = options?.authMethod === "biometric_webauthn"
      ? `WebAuthn Biometric Passkey authorization confirmed for ${formatNaira(quoteAmount)}.`
      : `Explicit authorization confirmed for ${formatNaira(quoteAmount)}. Proceeding with execution.`;

    await this.appendLedgerEvent(events, {
      id: `ev_${Date.now()}_auth_ok`,
      sessionId,
      timestamp: new Date().toISOString(),
      action: "authorization_confirmed",
      description: authDesc,
      status: "verified",
      actor: "User",
      metadata: { authMethod: options?.authMethod || "pin", selectedUnderwriter: options?.selectedUnderwriter },
    });

    const execContext = createWorkflowExecutionContext(auth, {
      sessionId,
      planId: plan.id,
      channel: session.channel,
      language: session.language,
      isSimulated: isDemo,
    });

    const policyNumber = authDetails?.policyNumber;
    if (!policyNumber) {
      throw new Error("Execution violation: policyNumber is required in authorizationDetails.");
    }
    const currentExpiry = authDetails?.currentExpiry;
    const targetNewExpiry = authDetails?.newExpiry;
    if (!targetNewExpiry) {
      throw new Error("Execution violation: newExpiry is required in authorizationDetails.");
    }

    let paymentReference = "";
    let renewalOutput: { newExpiry?: string; policyNumber?: string } = {};
    const executedMutations: Array<{ tool: string; input: Record<string, unknown> }> = [];

    // Execute remaining steps (steps 5 through 10)
    for (const step of steps) {
      if (step.status === "completed") continue; // skip already run steps

      // Simulate fault injection for Saga testing if requested
      if (options?.simulateSagaFailure && step.tool_name === "generate_certificate") {
        // Force failure at certificate generation to trigger automated refund
        step.status = "failed";
        step.error = "Simulated network failure on NAICOM document dispatch";

        // TRIGGER SAGA COMPENSATING TRANSACTIONS
        const refundTool = toolRegistry.get("refund_payment");
        if (refundTool && paymentReference) {
          const refundRes = await refundTool.execute(
            {
              reference: paymentReference,
              amount: quoteAmount,
              currency: "NGN",
              reason: "Saga Compensation: Document generation failed after payment settlement",
            },
            execContext
          );

          await this.appendLedgerEvent(events, {
            id: `ev_${Date.now()}_saga_rollback`,
            sessionId,
            timestamp: new Date().toISOString(),
            action: "saga_compensating_refund",
            description: `Saga Rollback: Automatic reversal of ${formatNaira(quoteAmount)} executed (Ref: ${refundRes.data?.refundReference})`,
            status: "verified",
            actor: "Saga Compensator",
            isCompensating: true,
            metadata: refundRes.data,
          });

          webhookDispatcher.broadcast("saga.compensated", {
            sessionId,
            reason: "Simulated NAICOM certificate failure",
            refundReference: refundRes.data?.refundReference,
            amount: quoteAmount,
          });
        }

        sm.transition("escalated", "Saga rollback completed: Customer charged was reversed");
        session.status = "escalated";
        await repos.sessions.updateStatus(sessionId, "escalated");

        return {
          sessionId,
          status: "escalated",
          intent: plan.intent,
          confidence: plan.confidence,
          message: `Saga Rollback Triggered: Certificate generation failed, but your payment of ${formatNaira(quoteAmount)} was automatically refunded.`,
          authorizationRequired: false,
          authorizationDetails: null,
          events,
        };
      }

      const stepOverride: Record<string, unknown> = {};

      if (step.tool_name === "request_payment") {
        stepOverride.customerId = targetCustomerId;
        stepOverride.amount = quoteAmount;
        stepOverride.currency = "NGN";
        stepOverride.policyNumber = policyNumber;
      } else if (step.tool_name === "verify_payment") {
        stepOverride.reference = paymentReference;
        stepOverride.expectedAmount = quoteAmount;
      } else if (step.tool_name === "renew_policy") {
        stepOverride.policyNumber = policyNumber;
        stepOverride.paymentReference = paymentReference;
      } else if (step.tool_name === "generate_certificate") {
        stepOverride.customerId = targetCustomerId;
        stepOverride.policyNumber = policyNumber;
        if (currentExpiry) {
          stepOverride.previousExpiry = currentExpiry;
        }
        stepOverride.newExpiry = renewalOutput.newExpiry || targetNewExpiry;
        stepOverride.amount = quoteAmount;
      } else if (step.tool_name === "send_notification") {
        stepOverride.customerId = targetCustomerId;
        stepOverride.policyNumber = policyNumber;
        stepOverride.newExpiry = renewalOutput.newExpiry || targetNewExpiry;
        stepOverride.amount = quoteAmount;
      } else if (step.tool_name === "schedule_reminder") {
        stepOverride.customerId = targetCustomerId;
        stepOverride.policyNumber = policyNumber;
        stepOverride.newExpiry = renewalOutput.newExpiry || targetNewExpiry;
      }

      const { result, ledgerEvent } = await this.executor.executeStep(
        step,
        execContext,
        stepOverride
      );

      await this.appendLedgerEvent(events, ledgerEvent);

      if (!result.success) {
        // Rollback via Saga if payment occurred
        if (paymentReference) {
          const refundTool = toolRegistry.get("refund_payment");
          if (refundTool) {
            const refundRes = await refundTool.execute(
              {
                reference: paymentReference,
                amount: quoteAmount,
                currency: "NGN",
                reason: `Saga Compensation: Execution halted at ${step.tool_name}`,
              },
              execContext
            );

            await this.appendLedgerEvent(events, {
              id: `ev_${Date.now()}_saga_rollback`,
              sessionId,
              timestamp: new Date().toISOString(),
              action: "saga_compensating_refund",
              description: `Saga Rollback: Automatic reversal of ${formatNaira(quoteAmount)} executed (Ref: ${refundRes.data?.refundReference})`,
              status: "verified",
              actor: "Saga Compensator",
              isCompensating: true,
              metadata: refundRes.data,
            });
          }
        }

        sm.transition("failed", result.error?.message);
        session.status = "failed";
        await repos.sessions.updateStatus(sessionId, "failed");
        return {
          sessionId,
          status: "failed",
          intent: plan.intent,
          confidence: plan.confidence,
          message: `Execution halted at step '${step.tool_name}': ${result.error?.message}`,
          authorizationRequired: false,
          authorizationDetails: null,
          events,
        };
      }

      executedMutations.push({ tool: step.tool_name, input: stepOverride });

      if (step.tool_name === "request_payment") {
        paymentReference = (result.data?.reference as string) || "";
      } else if (step.tool_name === "renew_policy") {
        renewalOutput = result.data as { newExpiry: string; policyNumber: string };
      }
    }

    // 3. Move to VERIFYING (Independent Verification)
    sm.transition("verifying", "Independently verifying policy state rolled forward");
    session.status = "verifying";
    await repos.sessions.updateStatus(sessionId, "verifying");

    const effectiveNewExpiry = renewalOutput.newExpiry || targetNewExpiry;
    const expectedYear = new Date(effectiveNewExpiry).getFullYear();

    const verifyRenewalResult = await this.verifier.verifyRenewal(
      policyNumber,
      expectedYear
    );

    await this.appendLedgerEvent(events, {
      id: `ev_${Date.now()}_ver`,
      sessionId,
      timestamp: new Date().toISOString(),
      action: "independent_verification",
      description: verifyRenewalResult.passed
        ? `Database roll-forward verified: Expiry successfully updated to ${effectiveNewExpiry}.`
        : `Verification check failed: ${verifyRenewalResult.reason}`,
      status: verifyRenewalResult.passed ? "verified" : "failed",
      actor: "Policy Guardrail",
    });

    if (!verifyRenewalResult.passed) {
      sm.transition("failed", verifyRenewalResult.reason);
      session.status = "failed";
      await repos.sessions.updateStatus(sessionId, "failed");
      return {
        sessionId,
        status: "failed",
        intent: plan.intent,
        confidence: plan.confidence,
        message: `Independent verification failed: ${verifyRenewalResult.reason}`,
        authorizationRequired: false,
        authorizationDetails: null,
        events,
      };
    }

    // 4. Move to COMPLETED
    sm.transition("completed", "Workflow finished with certified policy renewal and NAICOM certificate");
    session.status = "completed";
    session.completed_at = new Date().toISOString();
    await repos.sessions.updateStatus(sessionId, "completed", session.completed_at);

    webhookDispatcher.broadcast("policy.renewed", {
      sessionId,
      policyNumber,
      amount: quoteAmount,
      expiryDate: effectiveNewExpiry,
    });

    const assetDesc = authDetails.assetName
      ? `${authDetails.assetName}${authDetails.assetIdentifier ? ` (${authDetails.assetIdentifier})` : ""}`
      : policyNumber;

    return {
      sessionId,
      status: "completed",
      intent: plan.intent,
      confidence: plan.confidence,
      message: `Success! Your insurance for ${assetDesc} has been renewed to ${formatDate(effectiveNewExpiry)}. Your certified certificate is ready.`,
      authorizationRequired: false,
      authorizationDetails: null,
      events,
    };
  }
}

export const orchestrator = new ActionOSOrchestrator();
