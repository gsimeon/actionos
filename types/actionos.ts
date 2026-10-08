import type {
  ActionSessionChannel,
  ActionSessionStatus,
  MemberRole,
  ToolRiskLevel,
} from "./database";

// Allowed Action State Machine Transitions
export const ALLOWED_STATE_TRANSITIONS: Record<ActionSessionStatus, ActionSessionStatus[]> = {
  received: ["understanding", "cancelled"],
  understanding: ["planning", "failed", "escalated"],
  planning: ["validating", "failed", "escalated"],
  validating: ["awaiting_authorization", "executing", "failed", "escalated"],
  awaiting_authorization: ["executing", "cancelled", "expired", "failed"],
  executing: ["verifying", "failed", "escalated"],
  verifying: ["completed", "failed", "escalated"],
  failed: ["escalated"],
  escalated: ["executing", "completed", "cancelled"],
  completed: [],
  cancelled: [],
  expired: [],
};

export type ChannelType = ActionSessionChannel;

// Canonical Authenticated Execution Context derived server-side
export interface AuthenticatedExecutionContext {
  userId: string;
  profileId: string;
  organizationId: string;
  role: MemberRole;
  customerId?: string;
  isDemo: boolean;
}

// Tool & Workflow Execution Context carrying verified auth as primary authority
export interface WorkflowExecutionContext {
  readonly auth: AuthenticatedExecutionContext;
  readonly sessionId: string;
  readonly planId?: string;
  readonly stepId?: string;
  readonly channel: ChannelType;
  readonly language?: string;
  readonly isSimulated: boolean;
}

// Structured Tool Output standard
export interface ToolResult<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// Tool Definition Interface
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface IActionOSTool<TInput = any, TOutput = any> {
  name: string;
  description: string;
  category: string;
  version: string;
  riskLevel: ToolRiskLevel;
  requiresConfirmation: boolean;
  validateInput(input: unknown): { valid: boolean; error?: string; data?: TInput };
  execute(input: TInput, context: WorkflowExecutionContext): Promise<ToolResult<TOutput>>;
}

// N-ATLAS Provider Interface
export interface NAtlasUnderstanding {
  intent: string;
  confidence: number;
  entities: {
    policyNumber?: string;
    vehiclePlate?: string;
    customerNumber?: string;
    actionType?: string;
    urgency?: string;
    currency?: string;
    amount?: number;
    channel?: string;
    [key: string]: unknown;
  };
  normalizedText: string;
}

export interface NAtlasProvider {
  name: string;
  understand(input: {
    text?: string;
    audioUrl?: string;
    language: string;
  }): Promise<NAtlasUnderstanding>;
}

// Action Ledger Event (Signature Feature with Cryptographic Hash Chaining)
export interface ActionLedgerEvent {
  id: string;
  sessionId: string;
  sequenceNumber?: number;
  timestamp: string;
  action: string;
  description: string;
  status: "pending" | "processing" | "verified" | "completed" | "failed" | "escalated";
  actor: "User" | "ActionOS Engine" | "N-ATLAS AI" | "Policy Guardrail" | "Payment Gateway" | "System Worker" | "Saga Compensator";
  tool?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
  referenceId?: string;
  previousHash?: string;
  hash?: string;
  signature?: string;
  signingKeyVersion?: string;
  isCompensating?: boolean;
  eventClass?: "informational" | "consequential" | "critical";
}

// Multi-Insurer Marketplace Quote
export interface UnderwriterQuote {
  id: string;
  provider_reference?: string;
  underwriter: string;
  tier: "comprehensive" | "third_party" | "executive";
  tierLabel: string;
  amount: number;
  currency: string;
  benefits: string[];
  rating?: number;
  isRecommended?: boolean;
}

// Authorization Quote Request
export interface AuthorizationDetails {
  quoteId: string;
  sessionId: string;
  policyNumber: string;
  policyId?: string;
  customerName: string;
  assetIdentifier: string;
  assetName: string;
  providerName: string;
  currentExpiry: string;
  newExpiry: string;
  amount: number;
  currency: string;
  expiresAt: string;
  requiresExplicitConsent?: boolean;
  quotes?: UnderwriterQuote[];
  authMethod?: "pin" | "biometric_webauthn" | "passkey" | "whatsapp_otp";
  biometricVerified?: boolean;
}

// Saga Transaction Compensation Step
export interface SagaCompensationStep {
  tool: string;
  input: Record<string, unknown>;
  reason: string;
  executed: boolean;
  success?: boolean;
}

// Payment Provider Interface
export interface PaymentProvider {
  name: string;
  requestPayment(input: {
    customerId: string;
    amount: number;
    currency: string;
    reference: string;
    metadata?: Record<string, unknown>;
  }): Promise<{
    status: "processing" | "succeeded" | "failed";
    reference: string;
    gatewayUrl?: string;
  }>;

  verifyPayment(reference: string): Promise<{
    status: "succeeded" | "failed" | "pending";
    amount: number;
    currency: string;
    providerReference: string;
    paidAt: string;
  }>;
}

// Guardrail Verification Result
export interface GuardrailCheckResult {
  passed: boolean;
  rule: string;
  reason?: string;
  code?: string;
}
