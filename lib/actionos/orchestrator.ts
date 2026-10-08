import { ActionStateMachine } from "./state-machine";
import { createNAtlasProvider } from "@/lib/ai/n-atlas";
import { ActionOSPlanner } from "./planner";
import { ActionOSExecutor } from "./executor";
import { ActionOSVerifier } from "./verifier";
import { ActionOSGuardrails } from "./guardrails";
import { getStore } from "./mock-store";
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
      previousHash,
      hash,
      signature,
    };

    events.push(completeEvent);
    return completeEvent;
  }

  /**
   * Start a new natural language or voice workflow session.
   * Executes pre-authorization steps (Identity -> Policy -> Eligibility -> Quote)
   * and yields at the authorization gate if high-risk actions are required.
   */
  async startWorkflow(input: StartWorkflowInput): Promise<WorkflowStepResult> {
    const store = getStore();
    const sessionId = `act_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const orgId = input.organizationId || store.customers[0]?.organization_id || "a0000000-0000-0000-0000-000000000001";
    const customerId = input.customerId || store.customers[0]?.id;

    const sm = new ActionStateMachine("received");
    const events: ActionLedgerEvent[] = [];

    // Session record
    const session: ActionSession = {
      id: sessionId,
      customer_id: customerId,
      organization_id: orgId,
      channel: input.channel,
      language: input.language || "en-NG",
      input_text: input.inputText,
      input_audio_url: input.inputAudioUrl || null,
      intent: null,
      status: "received",
      started_at: new Date().toISOString(),
      completed_at: null,
      metadata: { aiProvider: this.nAtlas.name },
    };
    store.sessions.unshift(session);
    store.ledgerEvents[sessionId] = events;

    // Outbound webhook dispatch
    webhookDispatcher.broadcast("action.started", {
      sessionId,
      channel: input.channel,
      inputText: input.inputText,
    });

    // 1. Move to UNDERSTANDING
    sm.transition("understanding", "Parsing natural language input with N-ATLAS");
    session.status = "understanding";

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
      id: `ev_${Date.now()}_ai`,
      sessionId,
      timestamp: new Date().toISOString(),
      action: "intent_classification",
      description: `Intent detected: ${understanding.intent} (${Math.round(understanding.confidence * 100)}% confidence)`,
      status: "verified",
      actor: "N-ATLAS AI",
      metadata: understanding.entities,
    });

    // 2. Move to PLANNING
    sm.transition("planning", "Generating structured deterministic action plan");
    session.status = "planning";

    const { plan, steps } = this.planner.createPlan({
      sessionId,
      understanding,
      customerId,
      organizationId: orgId,
    });

    store.plans.unshift(plan);
    store.steps.push(...steps);

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

    const execContext: ExecutionContext = {
      sessionId,
      planId: plan.id,
      organizationId: orgId,
      customerId,
      userId: input.userId,
      userRole: "customer",
      channel: input.channel,
      language: input.language,
      isSimulated: true,
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
        quoteAmount = (result.data?.quoteAmount as number) || 87500;
        availableQuotes = (result.data?.quotes as UnderwriterQuote[]) || [];
      }
    }

    // 4. If authorization required (Renewal workflow), transition to AWAITING_AUTHORIZATION
    if (requiresAuth && activePolicy) {
      sm.transition("awaiting_authorization", "Pending explicit customer authorization for payment and renewal");
      session.status = "awaiting_authorization";

      const vehicleName = activePolicy.metadata?.vehicle_name as string || "Toyota Camry";
      const vehiclePlate = activePolicy.metadata?.vehicle_reg as string || "ABC-123-XY";
      const formattedAmount = formatNaira(quoteAmount);
      const formattedExpiry = formatDate(activePolicy.expiry_date);

      authDetails = {
        sessionId,
        policyNumber: activePolicy.policy_number,
        customerName: activeCustomer?.full_name || "Demo Customer",
        assetIdentifier: vehiclePlate,
        assetName: vehicleName,
        providerName: (activePolicy.metadata?.provider_name as string) || "Demo Insurance Ltd.",
        currentExpiry: activePolicy.expiry_date,
        newExpiry: "2027-10-14",
        amount: quoteAmount,
        currency: activePolicy.currency || "NGN",
        expiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
        quotes: availableQuotes,
        authMethod: "pin",
        biometricVerified: false,
      };

      session.metadata = {
        ...session.metadata,
        authorizationDetails: authDetails,
        quoteAmount,
      };

      this.appendLedgerEvent(events, {
        id: `ev_${Date.now()}_auth_req`,
        sessionId,
        timestamp: new Date().toISOString(),
        action: "authorization_requested",
        description: `Authorization requested for ₦${quoteAmount.toLocaleString()} to renew ${activePolicy.policy_number}`,
        status: "pending",
        actor: "Policy Guardrail",
        metadata: { amount: quoteAmount, currency: "NGN", quotesCount: availableQuotes.length },
      });

      webhookDispatcher.broadcast("authorization.required", authDetails as unknown as Record<string, unknown>);

      responseMessage = `I found your vehicle insurance policy for ${vehicleName} (${vehiclePlate}) expiring on ${formattedExpiry}. It is eligible for renewal. Your renewal quote is ${formattedAmount}. Would you like me to proceed with payment?`;

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

    // For non-renewal workflows that completed right away
    sm.transition("executing");
    sm.transition("verifying");
    sm.transition("completed");
    session.status = "completed";
    session.completed_at = new Date().toISOString();

    return {
      sessionId,
      status: "completed",
      intent: understanding.intent,
      confidence: understanding.confidence,
      message: "Customer and policy information retrieved successfully.",
      authorizationRequired: false,
      authorizationDetails: null,
      events,
    };
  }

  /**
   * Complete workflow after explicit customer authorization.
   * Resumes at step 5 (request_payment -> verify_payment -> renew_policy -> cert -> notify -> reminder).
   * Includes distributed Saga transaction rollback with compensating actions.
   */
  async authorizeAndExecute(
    sessionId: string,
    authorized: boolean,
    userRole: string = "customer",
    options?: {
      selectedUnderwriter?: string;
      customAmount?: number;
      simulateSagaFailure?: boolean;
      authMethod?: "pin" | "biometric_webauthn" | "passkey" | "whatsapp_otp";
    }
  ): Promise<WorkflowStepResult> {
    const store = getStore();
    const session = store.sessions.find((s) => s.id === sessionId);
    const plan = store.plans.find((p) => p.session_id === sessionId);
    const steps = store.steps.filter((s) => s.action_plan_id === plan?.id);
    const events = store.ledgerEvents[sessionId] || [];

    if (!session || !plan) {
      throw new Error(`Session '${sessionId}' not found.`);
    }

    const sm = new ActionStateMachine(session.status);

    if (!authorized) {
      sm.transition("cancelled", "User rejected authorization");
      session.status = "cancelled";
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

    const execContext: ExecutionContext = {
      sessionId,
      planId: plan.id,
      organizationId: session.organization_id,
      customerId: session.customer_id || store.customers[0]?.id,
      userRole: userRole as ExecutionContext["userRole"],
      channel: session.channel,
      language: session.language,
      isSimulated: true,
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
        stepOverride.customerId = session.customer_id || store.customers[0]?.id;
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
        stepOverride.customerId = session.customer_id || store.customers[0]?.id;
        stepOverride.policyNumber = authDetails?.policyNumber || "AUTO-2026-00182";
        stepOverride.previousExpiry = authDetails?.currentExpiry || "2026-10-14";
        stepOverride.newExpiry = renewalOutput.newExpiry || "2027-10-14";
        stepOverride.amount = quoteAmount;
      } else if (step.tool_name === "send_notification") {
        stepOverride.customerId = session.customer_id || store.customers[0]?.id;
        stepOverride.policyNumber = authDetails?.policyNumber || "AUTO-2026-00182";
        stepOverride.newExpiry = renewalOutput.newExpiry || "2027-10-14";
        stepOverride.amount = quoteAmount;
      } else if (step.tool_name === "schedule_reminder") {
        stepOverride.customerId = session.customer_id || store.customers[0]?.id;
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
