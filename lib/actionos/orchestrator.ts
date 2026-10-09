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
import crypto from "node:crypto";
import { isDemoMode, isProductionMode } from "@/lib/runtime/mode";
import { formatNaira, formatDate } from "@/lib/utils";
import { createWorkflowExecutionContext } from "@/lib/runtime/execution-context";
import { computeQuoteSignature, verifyQuoteSignature } from "@/lib/actionos/quote-signature";
import { mockPaymentProvider } from "@/lib/payments/mock";
import type { RefundPaymentInput } from "./tools/refund-payment";

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

export interface SagaRefundOutcome {
  success: boolean;
  refundReference?: string;
  error?: string;
  refundState?: "refund_confirmed" | "refund_pending" | "refund_failed" | "refund_unknown";
}

/**
 * Redacts sensitive customer details (cards, phone numbers, BVN, NIN, emails) from logged audit events.
 */
export function redactSensitiveInput(text?: string): string {
  if (!text) return "";
  return text
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[REDACTED_CARD]")
    .replace(/\b(?:\+?234|0)[789][01]\d{8}\b/g, "[REDACTED_PHONE]")
    .replace(/\b\d{11}\b/g, "[REDACTED_IDENTIFIER]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[REDACTED_EMAIL]")
    .replace(/\b(?:POL|AUTO|MOT|INS|REN)[A-Z0-9-]{4,}\b/gi, "[REDACTED_POLICY]")
    .replace(/\b[A-Z]{3}[-\s]?\d{3}[-\s]?[A-Z]{2}\b/gi, "[REDACTED_PLATE]");
}

/**
 * Recursively redacts sensitive values (cards, phones, identifiers, emails, policies, plates)
 * from arbitrary metadata objects before audit trail persistence.
 */
export function redactSensitiveObject<T>(obj: T): T {
  if (typeof obj === "string") {
    return redactSensitiveInput(obj) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(redactSensitiveObject) as unknown as T;
  }
  if (obj && typeof obj === "object") {
    const res: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      res[k] = redactSensitiveObject(v);
    }
    return res as unknown as T;
  }
  return obj;
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
    const sanitizedDescription = redactSensitiveInput(ev.description);
    const sanitizedMetadata = ev.metadata ? redactSensitiveObject(ev.metadata) : undefined;
    const sanitizedEv = {
      ...ev,
      description: sanitizedDescription,
      ...(sanitizedMetadata !== undefined ? { metadata: sanitizedMetadata } : {}),
    };

    const previousHash =
      events.length > 0 && events[events.length - 1].hash
        ? events[events.length - 1].hash!
        : GENESIS_LEDGER_HASH;

    const hash = computeEventHash(sanitizedEv, previousHash);
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
      ...sanitizedEv,
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
    const sessionId = `act_${crypto.randomUUID()}`;
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
    const tenantContext: TenantContext = {
      organizationId: orgId,
      customerId,
      role: auth.role,
    };

    const sm = new ActionStateMachine("received");
    const events: ActionLedgerEvent[] = [];

    // Session record persisted via repository
    const session = await repos.sessions.create({
      id: sessionId,
      customer_id: customerId,
      organization_id: orgId,
      channel: input.channel,
      language: input.language || "en-NG",
      input_text: redactSensitiveInput(input.inputText),
      input_audio_url: input.inputAudioUrl || null,
      intent: null,
      status: "received",
      metadata: {
        aiProvider: this.nAtlas.name,
        retentionPolicy: {
          rawInputRetained: false,
          piiRedacted: true,
          auditRetentionDays: 90,
          retentionPeriodDays: 90,
          piiClass: "redacted-financial-identities",
        },
      },
    });

    // Outbound webhook dispatch with minimal non-PII payload
    webhookDispatcher.broadcast("action.started", {
      sessionId,
      channel: input.channel,
      hasInputText: Boolean(input.inputText),
      intent: input.inputText ? "insurance_renewal" : "unknown",
      timestamp: new Date().toISOString(),
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
      description: `Input received via ${input.channel}: "${redactSensitiveInput(input.inputText)}"`,
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
      description: `N-ATLAS Intent: '${understanding.intent}' (${Math.round(understanding.confidence * 100)}% confidence). ${redactSensitiveInput(understanding.normalizedText)}`,
      status: "verified",
      actor: "N-ATLAS AI",
      metadata: { entities: redactSensitiveObject(understanding.entities) },
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

      // Require exact match on amount and currency - fail closed if no match
      const targetCurrency = activePolicy.currency || "NGN";
      const matchedQuote = availableQuotes.find(
        (q) => q.amount === quoteAmount && (q.currency || "NGN") === targetCurrency
      );
      if (!matchedQuote || !matchedQuote.id) {
        sm.transition("failed", "No issued underwriter quote exactly matches calculated quote amount and currency");
        session.status = "failed";
        await repos.sessions.updateStatus(sessionId, "failed", undefined, tenantContext);
        return {
          sessionId,
          status: "failed",
          intent: understanding.intent,
          confidence: understanding.confidence,
          message: "ActionOS halted: Quote selection integrity violation. Calculated amount does not match any verified underwriter quote exactly. Failing closed.",
          authorizationRequired: false,
          authorizationDetails: null,
          events,
        };
      }

      const quoteExpiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      let quoteCustId = activeCustomer?.id || customerId;
      if (!quoteCustId) {
        if (isProductionMode()) {
          sm.transition("failed", "Missing customer identity in production mode");
          session.status = "failed";
          await repos.sessions.updateStatus(sessionId, "failed", undefined, tenantContext);
          return {
            sessionId,
            status: "failed",
            intent: understanding.intent,
            confidence: understanding.confidence,
            message: "ActionOS halted: Customer identity could not be resolved. Production quote generation requires verified customer identity. Failing closed.",
            authorizationRequired: false,
            authorizationDetails: null,
            events,
          };
        }
        quoteCustId = "f0000000-0000-0000-0000-000000000001";
      }

      const quoteProvider = matchedQuote.underwriter || providerName;
      const quoteUnderwriterId = matchedQuote.underwriter_id || matchedQuote.underwriter || activePolicy.provider_id || null;
      const { quoteHash } = computeQuoteSignature({
        sessionId,
        organizationId: orgId,
        customerId: quoteCustId,
        policyId: activePolicy.id,
        providerName: quoteProvider,
        amount: matchedQuote.amount,
        currency: targetCurrency,
        expiresAt: quoteExpiry,
        providerReference: matchedQuote.id,
        underwriterId: quoteUnderwriterId,
      });

      // Persist primary quote - let repository generate canonical database ID
      const createdQuote = await repos.quotes.create(
        {
          session_id: sessionId,
          organization_id: orgId,
          customer_id: quoteCustId,
          policy_id: activePolicy.id,
          provider_name: quoteProvider,
          amount: matchedQuote.amount,
          currency: targetCurrency,
          status: "issued",
          expires_at: quoteExpiry,
          quote_hash: quoteHash,
          provider_reference: matchedQuote.id,
          underwriter_id: quoteUnderwriterId,
          metadata: {
            underwriter: matchedQuote.underwriter,
            policyNumber: activePolicy.policy_number,
            assetIdentifier,
          },
        },
        tenantContext
      );

      // Persist explicit mapping between provider quote IDs and ActionOS database IDs
      const providerToCanonicalQuoteMap: Record<string, string> = {
        [matchedQuote.id]: createdQuote.id,
        [createdQuote.id]: createdQuote.id,
      };

      // Build customer-facing list strictly from returned database records
      const canonicalQuotes: UnderwriterQuote[] = [
        {
          ...matchedQuote,
          id: createdQuote.id, // Prefer ActionOS database ID as canonical quoteId
          provider_reference: matchedQuote.id,
        },
      ];

      // Also persist alternative marketplace quotes into database
      for (const alt of availableQuotes) {
        if (alt.id !== matchedQuote.id) {
          const altProvider = alt.underwriter || providerName;
          const altCurrency = alt.currency || targetCurrency;
          const altUnderwriterId = alt.underwriter_id || alt.underwriter || activePolicy.provider_id || null;
          const { quoteHash: altHash } = computeQuoteSignature({
            sessionId,
            organizationId: orgId,
            customerId: quoteCustId,
            policyId: activePolicy.id,
            providerName: altProvider,
            amount: alt.amount,
            currency: altCurrency,
            expiresAt: quoteExpiry,
            providerReference: alt.id,
            underwriterId: altUnderwriterId,
          });
          const createdAltQuote = await repos.quotes.create(
            {
              session_id: sessionId,
              organization_id: orgId,
              customer_id: quoteCustId,
              policy_id: activePolicy.id,
              provider_name: altProvider,
              amount: alt.amount,
              currency: altCurrency,
              status: "issued",
              expires_at: quoteExpiry,
              quote_hash: altHash,
              provider_reference: alt.id,
              underwriter_id: altUnderwriterId,
              metadata: {
                underwriter: alt.underwriter,
                policyNumber: activePolicy.policy_number,
              },
            },
            tenantContext
          );

          providerToCanonicalQuoteMap[alt.id] = createdAltQuote.id;
          providerToCanonicalQuoteMap[createdAltQuote.id] = createdAltQuote.id;
          canonicalQuotes.push({
            ...alt,
            id: createdAltQuote.id, // Canonical ActionOS database ID
            provider_reference: alt.id,
          });
        }
      }

      const quoteId = createdQuote.id;

      authDetails = {
        quoteId,
        sessionId,
        customerName: activeCustomer?.full_name || "Customer",
        providerName: createdQuote.provider_name,
        amount: createdQuote.amount,
        currency: createdQuote.currency,
        policyNumber: activePolicy.policy_number,
        policyId: activePolicy.id,
        assetIdentifier,
        assetName,
        currentExpiry: activePolicy.expiry_date,
        newExpiry: nextYearDate.toISOString().split("T")[0],
        requiresExplicitConsent: true,
        expiresAt: quoteExpiry,
        quotes: canonicalQuotes,
      };

      session.metadata = {
        ...session.metadata,
        authorizationDetails: authDetails,
        persistedQuote: {
          quoteId: createdQuote.id,
          policyId: activePolicy.id,
          policyNumber: activePolicy.policy_number,
          customerId: createdQuote.customer_id,
          amount: createdQuote.amount,
          currency: createdQuote.currency,
          providerName: createdQuote.provider_name,
          expiresAt: createdQuote.expires_at,
          quoteHash: createdQuote.quote_hash,
        },
        quoteAmount,
        presentedQuoteOptions: canonicalQuotes.map((q) => ({
          quoteId: q.id,
          providerReference: q.provider_reference || q.id,
          underwriter: q.underwriter,
          amount: q.amount,
          currency: q.currency,
        })),
        providerToCanonicalQuoteMap,
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
   * Executes and independently verifies a Saga compensating refund.
   * Never marks a refund as verified unless confirmed by the payment rail.
   * If the refund fails or is uncertain, records the failure in the ledger,
   * flags the session as 'refund_pending' / 'escalated', and notifies human escalation.
   */
  private async executeVerifiedSagaRefund(params: {
    sessionId: string;
    paymentReference: string;
    amount: number;
    currency: string;
    reason: string;
    execContext: WorkflowExecutionContext;
    events: ActionLedgerEvent[];
    tenantContext?: TenantContext;
    simulateRefundFailure?: boolean;
  }): Promise<SagaRefundOutcome> {
    const {
      sessionId,
      paymentReference,
      amount,
      currency,
      reason,
      execContext,
      events,
      tenantContext,
      simulateRefundFailure,
    } = params;

    const repos = getRepositoryContainer();
    const refundTool = toolRegistry.get("refund_payment");

    if (!refundTool) {
      await this.appendLedgerEvent(events, {
        id: `ev_${Date.now()}_saga_rollback_failed`,
        sessionId,
        timestamp: new Date().toISOString(),
        action: "saga_compensating_refund_failed",
        description: `Saga Rollback Failed: Refund tool not registered. Escalated for manual refund of ${formatNaira(amount)}.`,
        status: "failed",
        actor: "Saga Compensator",
        isCompensating: true,
        metadata: { paymentReference, reason, error: "TOOL_NOT_FOUND" },
      });

      await repos.sessions.updateMetadata(
        sessionId,
        {
          refundState: "refund_pending",
          refundFailureReason: "Refund tool not registered",
          requiresManualRefund: true,
        },
        tenantContext
      );

      return { success: false, error: "Refund tool not registered", refundState: "refund_failed" };
    }

    try {
      const refundRes = await refundTool.execute(
        {
          reference: paymentReference,
          amount,
          currency,
          reason,
          simulateRefundFailure,
        } as unknown as RefundPaymentInput,
        execContext
      );

      if (refundRes.success && refundRes.data?.status === "refunded") {
        await this.appendLedgerEvent(events, {
          id: `ev_${Date.now()}_saga_rollback`,
          sessionId,
          timestamp: new Date().toISOString(),
          action: "saga_compensating_refund",
          description: `Saga Rollback Verified: Automatic reversal of ${formatNaira(amount)} confirmed by gateway (Ref: ${refundRes.data.refundReference})`,
          status: "verified",
          actor: "Saga Compensator",
          isCompensating: true,
          metadata: refundRes.data,
        });

        await repos.sessions.updateMetadata(
          sessionId,
          {
            refundState: "refund_confirmed",
            refundStatus: "refund_confirmed",
            isRefundConfirmed: true,
            refundReference: refundRes.data.refundReference,
            refundedAt: refundRes.data.refundedAt,
          },
          tenantContext
        );

        webhookDispatcher.broadcast("saga.compensated", {
          sessionId,
          reason,
          refundReference: refundRes.data.refundReference,
          amount,
        });

        return { success: true, refundReference: refundRes.data.refundReference, refundState: "refund_confirmed" };
      } else {
        const failureReason = refundRes.error?.message || "Refund was not confirmed by gateway";

        await this.appendLedgerEvent(events, {
          id: `ev_${Date.now()}_saga_rollback_failed`,
          sessionId,
          timestamp: new Date().toISOString(),
          action: "saga_compensating_refund_failed",
          description: `Saga Rollback Failed: Reversal of ${formatNaira(amount)} could not be verified (${failureReason}). Escalated for supervisor refund.`,
          status: "failed",
          actor: "Saga Compensator",
          isCompensating: true,
          metadata: { paymentReference, reason, error: failureReason },
        });

        const refundState = refundRes.data?.status === "failed" || !refundRes.success ? "refund_failed" : "refund_pending";
        await repos.sessions.updateMetadata(
          sessionId,
          {
            refundState,
            refundStatus: refundState,
            refundFailureReason: failureReason,
            requiresManualRefund: true,
          },
          tenantContext
        );

        webhookDispatcher.broadcast("saga.compensation_failed", {
          sessionId,
          reason,
          paymentReference,
          amount,
          error: failureReason,
        });

        return { success: false, error: failureReason, refundState: refundState as "refund_failed" | "refund_pending" };
      }
    } catch (refundErr) {
      const failureReason = refundErr instanceof Error ? refundErr.message : String(refundErr);

      await this.appendLedgerEvent(events, {
        id: `ev_${Date.now()}_saga_rollback_failed`,
        sessionId,
        timestamp: new Date().toISOString(),
        action: "saga_compensating_refund_failed",
        description: `Saga Rollback Failed: Exception during reversal (${failureReason}). Escalated for supervisor refund.`,
        status: "failed",
        actor: "Saga Compensator",
        isCompensating: true,
        metadata: { paymentReference, reason, error: failureReason },
      });

      await repos.sessions.updateMetadata(
        sessionId,
        {
          refundState: "refund_unknown",
          refundStatus: "refund_unknown",
          refundFailureReason: failureReason,
          requiresManualRefund: true,
        },
        tenantContext
      );

      return { success: false, error: failureReason, refundState: "refund_unknown" };
    }
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
      simulateRefundFailure?: boolean;
      authMethod?: "pin" | "biometric_webauthn" | "passkey" | "whatsapp_otp";
      quoteId?: string;
      authorizedQuoteId?: string;
    }
  ): Promise<WorkflowStepResult> {
    if (isProductionMode()) {
      if (options?.simulateSagaFailure) {
        throw new Error(
          "Security enforcement violation: Fault injection (simulateSagaFailure) is prohibited in production runtime mode."
        );
      }
      if (options?.simulateRefundFailure) {
        throw new Error(
          "Security enforcement violation: Fault injection (simulateRefundFailure) is prohibited in production runtime mode."
        );
      }
    }

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
    if (!targetCustomerId) {
      if (isProductionMode()) {
        throw new Error("Identity enforcement violation: customer identity is strictly required to execute workflow in production.");
      }
      if (role === "customer") {
        throw new Error("Identity enforcement violation: customerId is required to execute workflow.");
      }
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

    // 1. Guardrail Check on Authorization Details
    const authDetails = session.metadata?.authorizationDetails as AuthorizationDetails | undefined;
    const persistedQuoteMeta = session.metadata?.persistedQuote as {
      quoteId: string;
      policyId?: string;
      policyNumber: string;
      customerId?: string;
      amount: number;
      currency: string;
      providerName: string;
      expiresAt: string;
      quoteHash?: string;
    } | undefined;

    if (!authDetails || !authDetails.quoteId || typeof authDetails.amount !== "number" || authDetails.amount <= 0 || !persistedQuoteMeta) {
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

    // Determine target quote ID
    const requestedQuoteId = options?.authorizedQuoteId || options?.quoteId;
    let targetQuoteId = requestedQuoteId || authDetails.quoteId;

    // Check if client passed a provider reference (e.g. from an underwriter catalog) and map to canonical ActionOS quoteId
    const quoteMap = session.metadata?.providerToCanonicalQuoteMap as Record<string, string> | undefined;
    if (quoteMap && quoteMap[targetQuoteId]) {
      targetQuoteId = quoteMap[targetQuoteId];
    }

    // Explicit null/undefined and numeric range check for customAmount
    const hasCustomAmount = options?.customAmount !== undefined && options?.customAmount !== null;
    if (hasCustomAmount) {
      if (typeof options.customAmount !== "number" || isNaN(options.customAmount) || options.customAmount <= 0) {
        sm.transition("failed", "Invalid custom amount: must be a positive numeric value");
        session.status = "failed";
        await repos.sessions.updateStatus(sessionId, "failed", undefined, tenantContext);
        return {
          sessionId,
          status: "failed",
          intent: plan.intent,
          confidence: plan.confidence,
          message: "Guardrail Failure: customAmount must be a positive numeric value.",
          authorizationRequired: false,
          authorizationDetails: null,
          events,
        };
      }
    }

    if (options?.selectedUnderwriter && !requestedQuoteId) {
      const match = authDetails.quotes?.find(
        (q) => q.underwriter.toLowerCase() === options.selectedUnderwriter!.toLowerCase()
      );
      if (match) {
        targetQuoteId = match.id;
      }
    } else if (hasCustomAmount && !requestedQuoteId) {
      const match = authDetails.quotes?.find((q) => q.amount === options.customAmount);
      if (match) {
        targetQuoteId = match.id;
      } else {
        sm.transition("failed", "Custom amount does not match any approved underwriter quote");
        session.status = "failed";
        await repos.sessions.updateStatus(sessionId, "failed");
        return {
          sessionId,
          status: "failed",
          intent: plan.intent,
          confidence: plan.confidence,
          message: "Guardrail Failure: Requested custom amount does not match any approved underwriter quote.",
          authorizationRequired: false,
          authorizationDetails: null,
          events,
        };
      }
    }

    // Verify targetQuoteId was among valid options presented to customer
    const presentedQuotes = authDetails.quotes || [];
    const validQuoteIds = new Set<string>([
      authDetails.quoteId,
      ...presentedQuotes.map((q) => q.id),
      ...presentedQuotes.map((q) => q.provider_reference).filter(Boolean) as string[],
    ]);
    if (!validQuoteIds.has(requestedQuoteId || targetQuoteId)) {
      sm.transition("failed", "Requested quoteId was not among options presented to customer");
      session.status = "failed";
      await repos.sessions.updateStatus(sessionId, "failed", undefined, tenantContext);
      return {
        sessionId,
        status: "failed",
        intent: plan.intent,
        confidence: plan.confidence,
        message: `Guardrail Failure: Quote integrity violation. Quote '${requestedQuoteId || targetQuoteId}' was not among the verified options presented to the customer. Authorization must bind to a verified, persisted quote record.`,
        authorizationRequired: false,
        authorizationDetails: null,
        events,
      };
    }

    // 2. Load the quote from the database using immutable quoteId
    const dbQuote = await repos.quotes.findById(targetQuoteId, tenantContext);
    if (!dbQuote) {
      sm.transition("failed", `Missing persisted quote record for quoteId: ${targetQuoteId}`);
      session.status = "failed";
      await repos.sessions.updateStatus(sessionId, "failed");
      return {
        sessionId,
        status: "failed",
        intent: plan.intent,
        confidence: plan.confidence,
        message: `Guardrail Failure: Authorization must bind to a verified, persisted quote record (quoteId: ${targetQuoteId}).`,
        authorizationRequired: false,
        authorizationDetails: null,
        events,
      };
    }

    // 3. Verify quote integrity against session and caller context
    if (dbQuote.session_id !== sessionId) {
      sm.transition("failed", "Quote session mismatch");
      session.status = "failed";
      await repos.sessions.updateStatus(sessionId, "failed");
      return {
        sessionId,
        status: "failed",
        intent: plan.intent,
        confidence: plan.confidence,
        message: "Guardrail Failure: Quote integrity violation. Quote is not associated with this session.",
        authorizationRequired: false,
        authorizationDetails: null,
        events,
      };
    }

    if (callerOrgId && dbQuote.organization_id !== callerOrgId) {
      sm.transition("failed", "Quote tenant mismatch");
      session.status = "failed";
      await repos.sessions.updateStatus(sessionId, "failed");
      return {
        sessionId,
        status: "failed",
        intent: plan.intent,
        confidence: plan.confidence,
        message: "Guardrail Failure: Tenant boundary violation on quote authorization.",
        authorizationRequired: false,
        authorizationDetails: null,
        events,
      };
    }

    if (callerCustomerId && dbQuote.customer_id !== callerCustomerId) {
      sm.transition("failed", "Quote customer mismatch");
      session.status = "failed";
      await repos.sessions.updateStatus(sessionId, "failed");
      return {
        sessionId,
        status: "failed",
        intent: plan.intent,
        confidence: plan.confidence,
        message: "Guardrail Failure: Customer boundary violation on quote authorization.",
        authorizationRequired: false,
        authorizationDetails: null,
        events,
      };
    }

    // Check expiry
    if (new Date(dbQuote.expires_at).getTime() < Date.now()) {
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

    // In production, reject arbitrary custom amounts that don't match the loaded quote
    if (isProductionMode() && hasCustomAmount && options.customAmount !== dbQuote.amount) {
      sm.transition("failed", "Arbitrary custom amount is strictly forbidden in production mode");
      session.status = "failed";
      await repos.sessions.updateStatus(sessionId, "failed");
      return {
        sessionId,
        status: "failed",
        intent: plan.intent,
        confidence: plan.confidence,
        message: "Guardrail Failure: Arbitrary customAmount is rejected in production. Authorization must bind to an immutable quoteId.",
        authorizationRequired: false,
        authorizationDetails: null,
        events,
      };
    }

    // Validate quote status: must be strictly 'issued'
    if (dbQuote.status !== "issued") {
      sm.transition("failed", `Quote status is '${dbQuote.status}'; must be 'issued'`);
      session.status = "failed";
      await repos.sessions.updateStatus(sessionId, "failed", undefined, tenantContext);
      return {
        sessionId,
        status: "failed",
        intent: plan.intent,
        confidence: plan.confidence,
        message: `Guardrail Failure: Quote status is '${dbQuote.status}'. Only quotes in 'issued' status can be authorized.`,
        authorizationRequired: false,
        authorizationDetails: null,
        events,
      };
    }

    // Verify cryptographic quote signature (keyed HMAC-SHA256)
    if (!verifyQuoteSignature(dbQuote)) {
      sm.transition("failed", "Quote signature verification failed");
      session.status = "failed";
      await repos.sessions.updateStatus(sessionId, "failed", undefined, tenantContext);
      return {
        sessionId,
        status: "failed",
        intent: plan.intent,
        confidence: plan.confidence,
        message: "Guardrail Failure: Cryptographic quote signature mismatch. Persisted quote record has been tampered with.",
        authorizationRequired: false,
        authorizationDetails: null,
        events,
      };
    }

    const quoteAmount = dbQuote.amount;
    const quoteCurrency = dbQuote.currency || "NGN";
    const expectedAuthAmount = hasCustomAmount ? options.customAmount! : dbQuote.amount;

    const guardCheck = this.guardrails.validateAuthorization(true, quoteAmount, expectedAuthAmount);
    if (!guardCheck.passed) {
      sm.transition("failed", guardCheck.reason);
      session.status = "failed";
      await repos.sessions.updateStatus(sessionId, "failed", undefined, tenantContext);
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

    // 1. Atomically claim session AND accept quote in a single atomic transaction/operation
    const atomicClaim = await repos.sessions.claimAuthorizationAndAcceptQuote(
      sessionId,
      dbQuote.id,
      tenantContext
    );

    if (!atomicClaim) {
      sm.transition("failed", "Atomic authorization claim or quote acceptance failed");
      return {
        sessionId,
        status: "failed",
        intent: plan.intent,
        confidence: plan.confidence,
        message: `Guardrail Failure: Concurrent authorization detected. Session or quote '${dbQuote.id}' has already been claimed or cannot be accepted atomically. Current status may not be 'issued' or session is already executing.`,
        authorizationRequired: false,
        authorizationDetails: null,
        events,
      };
    }

    const _claimedSession = atomicClaim.session;
    const _acceptedQuote = atomicClaim.quote;

    sm.transition("executing", "Customer authorization confirmed; executing secure payment and renewal");
    session.status = "executing";

    const authDesc = options?.authMethod === "biometric_webauthn"
      ? `WebAuthn Biometric Passkey authorization confirmed for ${formatNaira(quoteAmount)}.`
      : `Explicit authorization confirmed for ${formatNaira(quoteAmount)}. Proceeding with execution.`;

    const consentRecord = {
      quoteId: dbQuote.id,
      amount: dbQuote.amount,
      currency: dbQuote.currency,
      provider: dbQuote.provider_name,
      policyNumber: authDetails.policyNumber,
      policyId: dbQuote.policy_id,
      authorizedAt: new Date().toISOString(),
      authenticatedActor: auth.userId || callerCustomerId || "User",
      authMethod: options?.authMethod || "pin",
    };

    session.metadata = {
      ...session.metadata,
      consentRecord,
    };
    await repos.sessions.updateMetadata(sessionId, session.metadata, tenantContext);

    await this.appendLedgerEvent(events, {
      id: `ev_${Date.now()}_auth_ok`,
      sessionId,
      timestamp: new Date().toISOString(),
      action: "authorization_confirmed",
      description: authDesc,
      status: "verified",
      actor: "User",
      referenceId: dbQuote.id,
      metadata: {
        ...consentRecord,
        selectedUnderwriter: dbQuote.provider_name,
      },
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

    try {
      // Execute remaining steps (steps 5 through 10)
      for (const step of steps) {
        if (step.status === "completed") continue; // skip already run steps

        // Simulate fault injection for Saga testing if requested
        if (options?.simulateSagaFailure && step.tool_name === "generate_certificate") {
          // Force failure at certificate generation to trigger automated refund
          step.status = "failed";
          step.error = "Simulated network failure on NAICOM document dispatch";

          // TRIGGER SAGA COMPENSATING TRANSACTIONS WITH VERIFICATION
          let refundOutcome: SagaRefundOutcome = { success: false };
          if (paymentReference) {
            refundOutcome = await this.executeVerifiedSagaRefund({
              sessionId,
              paymentReference,
              amount: quoteAmount,
              currency: quoteCurrency,
              reason: "Saga Compensation: Document generation failed after payment settlement",
              execContext,
              events,
              tenantContext,
              simulateRefundFailure: options?.simulateRefundFailure,
            });
          }

          sm.transition("escalated", refundOutcome.success ? "Saga rollback completed: Customer charge was reversed" : "Saga rollback incomplete: Refund unverified");
          session.status = "escalated";
          await repos.sessions.updateStatus(sessionId, "escalated", undefined, tenantContext);

          return {
            sessionId,
            status: "escalated",
            intent: plan.intent,
            confidence: plan.confidence,
            message: refundOutcome.success
              ? `Saga Rollback Triggered: Certificate generation failed, but your payment of ${formatNaira(quoteAmount)} was automatically refunded.`
              : `Saga Rollback Incomplete: Certificate generation failed and automatic refund could not be verified (${refundOutcome.error || "Gateway rejected"}). Your account was NOT credited. Escalated for manual supervisor refund.`,
            authorizationRequired: false,
            authorizationDetails: null,
            events,
          };
        }

        const stepOverride: Record<string, unknown> = {};

        if (step.tool_name === "request_payment") {
          stepOverride.customerId = targetCustomerId;
          stepOverride.amount = dbQuote.amount;
          stepOverride.currency = dbQuote.currency || "NGN";
          stepOverride.policyNumber = policyNumber;
          stepOverride.quoteId = dbQuote.id;
          const sanitizedSession = sessionId.replace(/-/g, "").substring(0, 16);
          const sanitizedQuote = dbQuote.id.replace(/-/g, "").substring(0, 16);
          stepOverride.idempotencyKey = `act_${sanitizedSession}_q_${sanitizedQuote}`;
        } else if (step.tool_name === "verify_payment") {
          stepOverride.reference = paymentReference;
          stepOverride.expectedAmount = dbQuote.amount;
        } else if (step.tool_name === "renew_policy") {
          stepOverride.policyNumber = policyNumber;
          stepOverride.paymentReference = paymentReference;
          stepOverride.underwriter = dbQuote.provider_name;
        } else if (step.tool_name === "generate_certificate") {
          stepOverride.customerId = targetCustomerId;
          stepOverride.policyNumber = policyNumber;
          if (currentExpiry) {
            stepOverride.previousExpiry = currentExpiry;
          }
          stepOverride.newExpiry = renewalOutput.newExpiry || targetNewExpiry;
          stepOverride.amount = dbQuote.amount;
          stepOverride.underwriter = dbQuote.provider_name;
        } else if (step.tool_name === "send_notification") {
          stepOverride.customerId = targetCustomerId;
          stepOverride.policyNumber = policyNumber;
          stepOverride.newExpiry = renewalOutput.newExpiry || targetNewExpiry;
          stepOverride.amount = dbQuote.amount;
          stepOverride.underwriter = dbQuote.provider_name;
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
          let refundOutcome: SagaRefundOutcome = { success: false };
          if (paymentReference) {
            refundOutcome = await this.executeVerifiedSagaRefund({
              sessionId,
              paymentReference,
              amount: quoteAmount,
              currency: quoteCurrency,
              reason: `Saga Compensation: Execution halted at ${step.tool_name}`,
              execContext,
              events,
              tenantContext,
              simulateRefundFailure: options?.simulateRefundFailure,
            });
          }

          const resolvedStatus = refundOutcome.success ? "failed" : "escalated";
          sm.transition(resolvedStatus, result.error?.message);
          session.status = resolvedStatus;
          await repos.sessions.updateStatus(sessionId, resolvedStatus, undefined, tenantContext);
          return {
            sessionId,
            status: resolvedStatus,
            intent: plan.intent,
            confidence: plan.confidence,
            message: refundOutcome.success
              ? `Execution halted at step '${step.tool_name}': ${result.error?.message}. Payment of ${formatNaira(quoteAmount)} was automatically refunded.`
              : `Execution halted at step '${step.tool_name}': ${result.error?.message}. Automated refund of ${formatNaira(quoteAmount)} could not be verified. Escalated for supervisor review.`,
            authorizationRequired: false,
            authorizationDetails: null,
            events,
          };
        }

        executedMutations.push({ tool: step.tool_name, input: stepOverride });

        if (step.tool_name === "request_payment") {
          paymentReference = (result.data?.reference as string) || "";
          const providerRef = (result.data?.providerReference as string) || "";
          const sanitizedSession = sessionId.replace(/-/g, "").substring(0, 16);
          const sanitizedQuote = dbQuote.id.replace(/-/g, "").substring(0, 16);
          const durableKey = `act_${sanitizedSession}_q_${sanitizedQuote}`;

          // Persist payment attempt immediately into durable session metadata
          session.metadata = {
            ...session.metadata,
            paymentReference,
            paymentAttempt: {
              reference: paymentReference,
              paymentReference,
              providerReference: providerRef,
              quoteId: dbQuote.id,
              amount: dbQuote.amount,
              currency: dbQuote.currency || "NGN",
              provider: dbQuote.provider_name,
              gatewayUrl: result.data?.gatewayUrl,
              status: result.success ? "succeeded" : "failed",
              attemptedAt: new Date().toISOString(),
              idempotencyKey: durableKey,
            },
            lastPaymentAttempt: {
              reference: paymentReference,
              providerReference: providerRef,
              quoteId: dbQuote.id,
              amount: dbQuote.amount,
              currency: dbQuote.currency || "NGN",
              provider: dbQuote.provider_name,
              gatewayUrl: result.data?.gatewayUrl,
              status: result.success ? "succeeded" : "failed",
              attemptedAt: new Date().toISOString(),
              idempotencyKey: durableKey,
            },
          };
          await repos.sessions.updateMetadata(sessionId, session.metadata, tenantContext);
        } else if (step.tool_name === "verify_payment") {
          if (result.success) {
            session.metadata = {
              ...session.metadata,
              paymentVerification: {
                reference: paymentReference,
                verified: true,
                verifiedAt: new Date().toISOString(),
                amount: result.data?.amount,
                currency: result.data?.currency,
                providerReference: result.data?.providerReference,
                gatewayChannel: result.data?.gatewayChannel,
              },
            };
            await repos.sessions.updateMetadata(sessionId, session.metadata, tenantContext);
          }
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
        // Query authoritative policy state and payment status before making financial determination
        let authoritativePolicy: Policy | null = null;
        if (policyNumber) {
          authoritativePolicy = await repos.policies.findByNumber(policyNumber, tenantContext);
        }

        let isPaymentSettled = false;
        if (paymentReference) {
          const tx = await repos.transactions.findByReference(paymentReference, tenantContext);
          if (tx?.status === "succeeded") {
            isPaymentSettled = true;
          } else {
            const providerVerify = await mockPaymentProvider.verifyPayment(paymentReference).catch(() => null);
            if (providerVerify?.status === "succeeded") {
              isPaymentSettled = true;
            }
          }
        }

        const isPolicyAuthoritativelyRenewed =
          authoritativePolicy?.status === "renewed" &&
          new Date(authoritativePolicy.expiry_date).getFullYear() >= expectedYear;

        if (isPolicyAuthoritativelyRenewed) {
          // Authoritative policy state confirms renewal was successful despite verifier alert
          await this.appendLedgerEvent(events, {
            id: `ev_${Date.now()}_auth_rec`,
            sessionId,
            timestamp: new Date().toISOString(),
            action: "independent_verification_reconciled",
            description: `Authoritative policy database inspection confirms policy is renewed (${authoritativePolicy?.policy_number}, expiry: ${authoritativePolicy?.expiry_date}). Proceeding with completion.`,
            status: "verified",
            actor: "Policy Guardrail",
          });
        } else if (isPaymentSettled) {
          // Payment settled, but renewal did not occur: execute verified saga refund compensation
          let refundOutcome: SagaRefundOutcome = { success: false };
          if (paymentReference) {
            refundOutcome = await this.executeVerifiedSagaRefund({
              sessionId,
              paymentReference,
              amount: quoteAmount,
              currency: quoteCurrency,
              reason: `Saga Compensation: Post-renewal verification failed (${verifyRenewalResult.reason}) and policy is not renewed`,
              execContext,
              events,
              tenantContext,
              simulateRefundFailure: options?.simulateRefundFailure,
            });
          }

          sm.transition("escalated", `Post-payment verification failure: ${verifyRenewalResult.reason}. Safe compensation applied.`);
          session.status = "escalated";
          await repos.sessions.updateStatus(sessionId, "escalated", undefined, tenantContext);
          await repos.sessions.updateMetadata(
            sessionId,
            {
              postPaymentVerificationFailure: true,
              verificationFailureReason: verifyRenewalResult.reason,
              reconciliation_required: !refundOutcome.success,
              requiresManualRefund: !refundOutcome.success,
            },
            tenantContext
          );

          return {
            sessionId,
            status: "escalated",
            intent: plan.intent,
            confidence: plan.confidence,
            message: refundOutcome.success
              ? `Verification check failed: ${verifyRenewalResult.reason}. Your payment of ${formatNaira(quoteAmount)} was automatically refunded and verified.`
              : `Verification check failed: ${verifyRenewalResult.reason}. An automated refund could not be verified. Escalated for human supervisor reconciliation.`,
            authorizationRequired: false,
            authorizationDetails: null,
            events,
          };
        } else {
          // Outcome is ambiguous (e.g. payment unconfirmed): move to recoverable escalated state
          sm.transition("escalated", `Ambiguous post-payment verification: ${verifyRenewalResult.reason}`);
          session.status = "escalated";
          await repos.sessions.updateStatus(sessionId, "escalated", undefined, tenantContext);
          await repos.sessions.updateMetadata(
            sessionId,
            {
              postPaymentVerificationFailure: true,
              verificationFailureReason: verifyRenewalResult.reason,
              reconciliation_required: true,
              reconciliationState: "reconciliation_required",
            },
            tenantContext
          );

          return {
            sessionId,
            status: "escalated",
            intent: plan.intent,
            confidence: plan.confidence,
            message: `Post-payment verification could not confirm renewal (${verifyRenewalResult.reason}). Session escalated for reconciliation.`,
            authorizationRequired: false,
            authorizationDetails: null,
            events,
          };
        }
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
    } catch (unhandledErr: unknown) {
      const errMsg = unhandledErr instanceof Error ? unhandledErr.message : String(unhandledErr);
      let refundSuccess = false;
      if (paymentReference) {
        try {
          const refundOutcome = await this.executeVerifiedSagaRefund({
            sessionId,
            paymentReference,
            amount: quoteAmount,
            currency: quoteCurrency,
            reason: `Saga Compensation: Execution exception (${errMsg})`,
            execContext,
            events,
            tenantContext,
          });
          refundSuccess = refundOutcome.success;
        } catch (refundErr) {
          console.error(`[ActionOS] Recovery refund failed: ${refundErr}`);
        }
      }

      sm.transition("escalated", `Execution failed: ${errMsg}`);
      session.status = "escalated";
      await repos.sessions.updateStatus(sessionId, "escalated", undefined, tenantContext);

      return {
        sessionId,
        status: "escalated",
        intent: plan.intent,
        confidence: plan.confidence,
        message: refundSuccess
          ? `We ran into an issue executing your action: ${errMsg}. Your payment of ${formatNaira(quoteAmount)} was automatically refunded.`
          : `We ran into an issue executing your action: ${errMsg}. An automated refund could not be verified. A supervisor has been alerted to review your account.`,
        authorizationRequired: false,
        authorizationDetails: null,
        events,
      };
    }
  }

  /**
   * Safe recovery and reconciliation process for sessions stuck in 'executing' state.
   * Reconciles against actual payment provider transactions before taking any action.
   * Never blindly retries payment on timeout.
   */
  async reconcileExecutingSession(
    sessionId: string,
    tenantContext?: TenantContext
  ): Promise<{
    sessionId: string;
    resolvedStatus: ActionSession["status"];
    reconciliationAction:
      | "completed_renewal"
      | "refunded_uncompleted"
      | "cancelled_unpaid"
      | "escalated"
      | "payment_uncertain_escalated"
      | "refund_pending_escalated"
      | "reconciliation_required";
    message: string;
  }> {
    const repos = getRepositoryContainer();
    const session = await repos.sessions.findById(sessionId, tenantContext);
    if (!session) {
      throw new Error(`Session not found for reconciliation: ${sessionId}`);
    }

    if (session.status !== "executing") {
      return {
        sessionId,
        resolvedStatus: session.status,
        reconciliationAction: "escalated",
        message: `Session is in '${session.status}', not 'executing'. No reconciliation needed.`,
      };
    }

    const authDetails = session.metadata?.authorizationDetails as AuthorizationDetails | undefined;
    const policyNumber = authDetails?.policyNumber;
    const sanitizedSession = sessionId.replace(/-/g, "").substring(0, 16);
    const sanitizedPolicy = policyNumber ? policyNumber.replace(/[^a-zA-Z0-9]/g, "") : "unknown";
    const sessionMeta = (session.metadata || {}) as Record<string, unknown>;
    const consentRecord = sessionMeta.consentRecord as Record<string, unknown> | undefined;
    const quoteId = (consentRecord?.quoteId || authDetails?.quoteId) as string | undefined;
    const sanitizedQuote = quoteId ? quoteId.replace(/-/g, "").substring(0, 16) : "";
    const quoteRef = sanitizedQuote ? `act_${sanitizedSession}_q_${sanitizedQuote}` : undefined;
    const legacyRef = policyNumber ? `act_${sanitizedSession}_pay_${sanitizedPolicy}` : undefined;
    const persistedRef = sessionMeta.paymentReference as string | undefined;
    const paymentAttempt = sessionMeta.paymentAttempt as Record<string, unknown> | undefined;
    const attemptRef = paymentAttempt?.reference as string | undefined;
    const attemptPaymentRef = paymentAttempt?.paymentReference as string | undefined;
    const attemptProviderRef = paymentAttempt?.providerReference as string | undefined;
    const attemptIdempotencyKey = paymentAttempt?.idempotencyKey as string | undefined;

    // Check all candidate references: persisted attempt, durable quote key, idempotency keys, or legacy policy key
    const candidateRefs = Array.from(
      new Set(
        [
          persistedRef,
          attemptRef,
          attemptPaymentRef,
          attemptProviderRef,
          attemptIdempotencyKey,
          quoteRef,
          legacyRef,
        ].filter(Boolean) as string[]
      )
    );

    if (candidateRefs.length === 0) {
      await repos.sessions.updateStatus(sessionId, "escalated", undefined, tenantContext);
      await repos.sessions.updateMetadata(
        sessionId,
        {
          paymentReconciliationState: "unknown_reference",
          reconciliation_required: true,
        },
        tenantContext
      );
      return {
        sessionId,
        resolvedStatus: "escalated",
        reconciliationAction: "payment_uncertain_escalated",
        message: "No payment reference or idempotency key found for executing session. Outcome is unknown; escalated for reconciliation.",
      };
    }

    let tx = null;
    let effectiveRef = candidateRefs[0];
    for (const ref of candidateRefs) {
      tx = await repos.transactions.findByReference(ref, tenantContext);
      if (tx) {
        effectiveRef = ref;
        break;
      }
    }

    let isSettled = tx?.status === "succeeded";
    let settledAmount = tx?.amount;
    let settledCurrency = tx?.currency || "NGN";

    // If transaction not found in DB, reconcile directly against payment provider
    let isPaymentPending = false;
    let isGatewayUnreachable = false;
    let providerConfirmedUnpaidCount = 0;

    if (!isSettled) {
      for (const ref of candidateRefs) {
        try {
          const verifyRes = await mockPaymentProvider.verifyPayment(ref);
          if (verifyRes.status === "succeeded") {
            isSettled = true;
            effectiveRef = ref;
            settledAmount = verifyRes.amount;
            settledCurrency = verifyRes.currency;
            break;
          } else if (verifyRes.status === "pending") {
            isPaymentPending = true;
            effectiveRef = ref;
            break;
          } else if (verifyRes.status === "failed") {
            providerConfirmedUnpaidCount++;
          }
        } catch {
          isGatewayUnreachable = true;
          effectiveRef = ref;
          break;
        }
      }
    }

    if (isPaymentPending || isGatewayUnreachable) {
      await repos.sessions.updateStatus(sessionId, "escalated", undefined, tenantContext);
      await repos.sessions.updateMetadata(
        sessionId,
        {
          paymentReconciliationState: isGatewayUnreachable ? "gateway_unreachable" : "payment_pending",
          candidateReference: effectiveRef,
          requiresDeferredReconciliation: true,
          reconciliation_required: true,
        },
        tenantContext
      );
      return {
        sessionId,
        resolvedStatus: "escalated",
        reconciliationAction: "payment_uncertain_escalated",
        message: "Payment status is currently uncertain with the gateway rail. Session escalated for deferred reconciliation without duplicate charge.",
      };
    }

    if (isSettled) {
      // Payment was settled! Check if policy renewal was finished:
      let policy = null;
      if (policyNumber) {
        policy = await repos.policies.findByNumber(policyNumber, tenantContext);
      }

      if (policy && policy.status === "renewed") {
        // Renewal is already complete; mark session completed
        await repos.sessions.updateStatus(sessionId, "completed", new Date().toISOString(), tenantContext);
        return {
          sessionId,
          resolvedStatus: "completed",
          reconciliationAction: "completed_renewal",
          message: "Payment confirmed settled and policy is renewed. Session marked completed.",
        };
      }

      // Payment succeeded but policy renewal failed: perform compensating refund
      const recoveryExecCtx = createWorkflowExecutionContext(
        {
          userId: session.customer_id || "recovery_agent",
          profileId: "recovery_profile",
          organizationId: session.organization_id,
          customerId: session.customer_id || undefined,
          role: "manager",
          isDemo: false,
        },
        { sessionId, planId: "recovery_plan", channel: session.channel, language: session.language }
      );

      const refundOutcome = await this.executeVerifiedSagaRefund({
        sessionId,
        paymentReference: effectiveRef,
        amount: settledAmount || 0,
        currency: settledCurrency,
        reason: "Reconciliation Recovery: Payment settled but renewal was uncompleted.",
        execContext: recoveryExecCtx,
        events: [],
        tenantContext,
      });

      await repos.sessions.updateStatus(sessionId, "escalated", undefined, tenantContext);
      if (refundOutcome.success && refundOutcome.refundState === "refund_confirmed") {
        return {
          sessionId,
          resolvedStatus: "escalated",
          reconciliationAction: "refunded_uncompleted",
          message: "Payment was settled but downstream renewal failed. Customer refund was verified and session escalated.",
        };
      } else if (refundOutcome.refundState === "refund_failed") {
        await repos.sessions.updateMetadata(
          sessionId,
          {
            refundState: "refund_failed",
            reconciliation_required: true,
            requiresManualRefund: true,
          },
          tenantContext
        );
        return {
          sessionId,
          resolvedStatus: "escalated",
          reconciliationAction: "refund_pending_escalated",
          message: "Payment was settled and renewal failed, but automated refund could not be verified. Session escalated with refund_pending status.",
        };
      } else {
        await repos.sessions.updateMetadata(
          sessionId,
          {
            refundState: refundOutcome.refundState || "refund_unknown",
            reconciliation_required: true,
            requiresManualRefund: true,
          },
          tenantContext
        );
        return {
          sessionId,
          resolvedStatus: "escalated",
          reconciliationAction: "reconciliation_required",
          message: "Payment was settled and renewal failed, but refund outcome is uncertain. Session escalated for supervisor reconciliation.",
        };
      }
    }

    // Only fail closed if provider explicitly confirmed unpaid across all candidate references
    if (providerConfirmedUnpaidCount === candidateRefs.length) {
      await repos.sessions.updateStatus(sessionId, "failed", undefined, tenantContext);
      return {
        sessionId,
        resolvedStatus: "failed",
        reconciliationAction: "cancelled_unpaid",
        message: "No settled payment found with gateway across all verified references. Session safely failed closed without charging customer.",
      };
    }

    // Outcome is ambiguous; do NOT close as failed! Keep open for manual reconciliation.
    await repos.sessions.updateStatus(sessionId, "escalated", undefined, tenantContext);
    await repos.sessions.updateMetadata(
      sessionId,
      {
        paymentReconciliationState: "payment_uncertain",
        candidateReference: effectiveRef,
        reconciliation_required: true,
      },
      tenantContext
    );
    return {
      sessionId,
      resolvedStatus: "escalated",
      reconciliationAction: "reconciliation_required",
      message: "Payment status could not be conclusively determined with the gateway rail. Session kept open for manual reconciliation.",
    };
  }
}

export const orchestrator = new ActionOSOrchestrator();
