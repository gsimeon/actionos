import type { ActionSessionStatus } from "./database";
import type { ActionLedgerEvent, AuthorizationDetails } from "./actionos";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface CreateActionRequest {
  channel: "web" | "voice" | "whatsapp" | "telegram" | "api";
  language?: string;
  customerId?: string;
  organizationId?: string;
  inputText: string;
  inputAudioUrl?: string;
}

export interface CreateActionResponse {
  sessionId: string;
  status: ActionSessionStatus;
  intent: string;
  confidence: number;
  message: string;
  authorizationRequired: boolean;
  authorizationDetails?: AuthorizationDetails | null;
  amount?: number;
  currency?: string;
  events: ActionLedgerEvent[];
}

export interface ActionDetailResponse {
  session: {
    id: string;
    status: ActionSessionStatus;
    intent: string | null;
    channel: string;
    language: string;
    inputText: string | null;
    startedAt: string;
    completedAt: string | null;
  };
  plan?: {
    id: string;
    goal: string;
    riskLevel: string;
    confidence: number;
    status: string;
  } | null;
  steps: Array<{
    id: string;
    sequence: number;
    description: string;
    toolName: string;
    status: string;
    requiresConfirmation: boolean;
    error: string | null;
  }>;
  authorizationRequired: boolean;
  authorizationDetails?: AuthorizationDetails | null;
  events: ActionLedgerEvent[];
}

export interface AuthorizeActionRequest {
  authorized: boolean;
  reason?: string;
}

export interface AuthorizeActionResponse {
  sessionId: string;
  status: ActionSessionStatus;
  authorized: boolean;
  message: string;
  events: ActionLedgerEvent[];
}

export interface ExecuteStepRequest {
  stepId?: string;
}

export interface PaymentWebhookPayload {
  event:
    | "charge.success"
    | "charge.failed"
    | "refund.processed"
    | "refund.pending"
    | "refund.processing"
    | "refund.failed"
    | string;
  data: {
    id?: number | string;
    reference: string;
    amount?: number;
    currency?: string;
    status?: string;
    customer_id?: string;
    paid_at?: string;
    refundReference?: string;
    [key: string]: unknown;
  };
}

