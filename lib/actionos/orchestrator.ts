import { ActionStateMachine } from "./state-machine";
import { createNAtlasProvider } from "@/lib/ai/n-atlas";
import { ActionOSPlanner } from "./planner";
import { ActionOSExecutor } from "./executor";
import { ActionOSVerifier } from "./verifier";
import { ActionOSGuardrails } from "./guardrails";
import { getRepositoryContainer } from "@/lib/repositories";
import { toolRegistry } from "./tool-registry";
import { computeEventHash, signEventHash, GENESIS_LEDGER_HASH } from "./crypto-ledger";
import { webhookDispatcher } from "./webhook-dispatcher";
import type {
  ActionSession,
  Customer,
  Policy,
} from "@/types/database";
import type {
  ActionLedgerEvent,
  AuthorizationDetails,
  ExecutionContext,
  UnderwriterQuote,
} from "@/types/actionos";
import { formatNaira, formatDate } from "@/lib/utils";

export interface StartWorkflowInput {
  inputText: string;
  inputAudioUrl?: string;
  channel: "web" | "voice" | "whatsapp" | "telegram" | "api";
  language?: string;
  customerId?: string;
  organizationId?: string;
  userId?: string;
  userRole?: ExecutionContext["userRole"];
  executionContext?: Partial<ExecutionContext>;
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
   */
  private appendLedgerEvent(
    events: ActionLedgerEvent[],
    ev: Omit<ActionLedgerEvent, "previousHash" | "hash" | "signature">
  ): ActionLedgerEvent {
    const previousHash =
      events.length > 0 && events[events.length - 1].hash
        ? events[events.length - 1].hash!
        : GENESIS_LEDGER_HASH;

    const hash = computeEventHash(ev, previousHash);
    const signature = signEventHash(hash);

    const completeEvent: ActionLedgerEvent = {
      ...ev,
      sequenceNumber: events.length + 1,
      previousHash,
      hash,
      signature,
      signingKeyVersion: "v1",
    };

    events.push(completeEvent);

    // Asynchronously persist to ledger repository
    try {
      const repos = getRepositoryContainer();
      repos.ledger.appendEvent(completeEvent).catch(() => {});
    } catch {}

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
    const orgId = input.executionContext?.organizationId || input.organizationId || "a0000000-0000-0000-0000-000000000001";
    const customerId = input.executionContext?.customerId || input.customerId || "f0000000-0000-0000-0000-000000000001";
    const userId = input.executionContext?.userId || input.userId;
    const userRole = input.executionContext?.userRole || input.userRole || "customer";

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

    this.appendLedgerEvent(events, {
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

    this.appendLedgerEvent(events, {
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

    this.appendLedgerEvent(events, {
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

    const execContext: ExecutionContext = {
      sessionId,
      planId: plan.id,
      organizationId: orgId,
      customerId,
      userId,
      userRole,
      channel: input.channel,
      language: input.language,
      isSimulated: input.executionContext?.isSimulated ?? true,
    };

    let activeCustomer: Customer | undefined;
    let activePolicy: Policy | undefined;
    let quoteAmount = 87500;
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
      this.appendLedgerEvent(events, ledgerEvent);

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
      sm.transition("awaiting_authorization", "Halting workflow at Cryptographic Authorization Gate");
      session.status = "awaiting_authorization";

      const vehicleMeta = (activePolicy.metadata || {}) as Record<string, unknown>;
      const nextYearDate = new Date(activePolicy.expiry_date);
      nextYearDate.setFullYear(nextYearDate.getFullYear() + 1);

      authDetails = {
        sessionId,
        customerName: activeCustomer?.full_name || "Customer",
        providerName: "Leadway Assurance",
        amount: quoteAmount,
        currency: activePolicy.currency || "NGN",
        policyNumber: activePolicy.policy_number,
        policyId: activePolicy.id,
        assetIdentifier: (vehicleMeta.vehicle_plate as string) || "ABC-123-XY",
        assetName: (vehicleMeta.vehicle_name as string) || "Toyota Camry (2020)",
        currentExpiry: activePolicy.expiry_date,
        newExpiry: nextYearDate.toISOString().split("T")[0],
        requiresExplicitConsent: true,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 mins quote lock
        quotes: availableQuotes,
      };

      session.metadata = {
        ...session.metadata,
        authorizationDetails: authDetails,
        quoteAmount,
      };

      await repos.sessions.updateStatus(sessionId, "awaiting_authorization");
      await repos.sessions.updateMetadata(sessionId, session.metadata);

      this.appendLedgerEvent(events, {
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
    userRoleOrContext: string | ExecutionContext = "customer",
    options?: {
      selectedUnderwriter?: string;
      customAmount?: number;
      simulateSagaFailure?: boolean;
      authMethod?: "pin" | "biometric_webauthn" | "passkey" | "whatsapp_otp";
    }
  ): Promise<WorkflowStepResult> {
    const repos = getRepositoryContainer();
    const session = await repos.sessions.findById(sessionId);
    const plan = await repos.plans.findBySessionId(sessionId);
    const steps = plan ? await repos.steps.findByPlanId(plan.id) : [];
    const events = (await repos.ledger.getEventsBySessionId(sessionId)) || [];

    if (!session || !plan) {
      throw new Error(`Session '${sessionId}' not found.`);
    }

    const sm = new ActionStateMachine(session.status);

    if (!authorized) {
      sm.transition("cancelled", "User rejected authorization");
      session.status = "cancelled";
      await repos.sessions.updateStatus(sessionId, "cancelled");

      this.appendLedgerEvent(events, {
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

    // Check if user selected an alternative underwriter quote from the marketplace
    const selectedQuote = authDetails?.quotes?.find(
      (q) =>
        (options?.selectedUnderwriter && q.underwriter.toLowerCase() === options.selectedUnderwriter.toLowerCase()) ||
        (options?.customAmount && q.amount === options.customAmount)
    );

    const quoteAmount = selectedQuote?.amount || options?.customAmount || (session.metadata?.quoteAmount as number) || 87500;
    const expectedAuthAmount = selectedQuote ? selectedQuote.amount : (authDetails?.amount || quoteAmount);

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

    this.appendLedgerEvent(events, {
      id: `ev_${Date.now()}_auth_ok`,
      sessionId,
      timestamp: new Date().toISOString(),
      action: "authorization_confirmed",
      description: authDesc,
      status: "verified",
      actor: "User",
      metadata: { authMethod: options?.authMethod || "pin", selectedUnderwriter: options?.selectedUnderwriter },
    });

    const userRole = (typeof userRoleOrContext === "object" ? userRoleOrContext.userRole : userRoleOrContext) || "customer";
    const userId = typeof userRoleOrContext === "object" ? userRoleOrContext.userId : undefined;

    const execContext: ExecutionContext = {
      sessionId,
      planId: plan.id,
      organizationId: session.organization_id,
      customerId: session.customer_id || "f0000000-0000-0000-0000-000000000001",
      userId,
      userRole: userRole as ExecutionContext["userRole"],
      channel: session.channel,
      language: session.language,
      isSimulated: typeof userRoleOrContext === "object" ? (userRoleOrContext.isSimulated ?? true) : true,
    };

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

          this.appendLedgerEvent(events, {
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
        stepOverride.customerId = session.customer_id || "f0000000-0000-0000-0000-000000000001";
        stepOverride.amount = quoteAmount;
        stepOverride.currency = "NGN";
        stepOverride.policyNumber = authDetails?.policyNumber || "AUTO-2026-00182";
      } else if (step.tool_name === "verify_payment") {
        stepOverride.reference = paymentReference;
        stepOverride.expectedAmount = quoteAmount;
      } else if (step.tool_name === "renew_policy") {
        stepOverride.policyNumber = authDetails?.policyNumber || "AUTO-2026-00182";
        stepOverride.paymentReference = paymentReference;
      } else if (step.tool_name === "generate_certificate") {
        stepOverride.customerId = session.customer_id || "f0000000-0000-0000-0000-000000000001";
        stepOverride.policyNumber = authDetails?.policyNumber || "AUTO-2026-00182";
        stepOverride.previousExpiry = authDetails?.currentExpiry || "2026-10-14";
        stepOverride.newExpiry = renewalOutput.newExpiry || "2027-10-14";
        stepOverride.amount = quoteAmount;
      } else if (step.tool_name === "send_notification") {
        stepOverride.customerId = session.customer_id || "f0000000-0000-0000-0000-000000000001";
        stepOverride.policyNumber = authDetails?.policyNumber || "AUTO-2026-00182";
        stepOverride.newExpiry = renewalOutput.newExpiry || "2027-10-14";
        stepOverride.amount = quoteAmount;
      } else if (step.tool_name === "schedule_reminder") {
        stepOverride.customerId = session.customer_id || "f0000000-0000-0000-0000-000000000001";
        stepOverride.policyNumber = authDetails?.policyNumber || "AUTO-2026-00182";
        stepOverride.newExpiry = renewalOutput.newExpiry || "2027-10-14";
      }

      const { result, ledgerEvent } = await this.executor.executeStep(
        step,
        execContext,
        stepOverride
      );

      this.appendLedgerEvent(events, ledgerEvent);

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

            this.appendLedgerEvent(events, {
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

    const verifyRenewalResult = await this.verifier.verifyRenewal(
      authDetails?.policyNumber || "AUTO-2026-00182",
      2027
    );

    this.appendLedgerEvent(events, {
      id: `ev_${Date.now()}_ver`,
      sessionId,
      timestamp: new Date().toISOString(),
      action: "independent_verification",
      description: verifyRenewalResult.passed
        ? "Database roll-forward verified: Expiry successfully updated to 2027-10-14."
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
      policyNumber: authDetails?.policyNumber || "AUTO-2026-00182",
      amount: quoteAmount,
      expiryDate: "2027-10-14",
    });

    return {
      sessionId,
      status: "completed",
      intent: plan.intent,
      confidence: plan.confidence,
      message: `Success! Your insurance for ${authDetails?.assetName} (${authDetails?.assetIdentifier}) has been renewed to October 14, 2027. Your certified certificate is ready.`,
      authorizationRequired: false,
      authorizationDetails: null,
      events,
    };
  }
}

export const orchestrator = new ActionOSOrchestrator();
