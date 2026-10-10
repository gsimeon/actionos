import type { IActionOSTool, ToolResult, WorkflowExecutionContext } from "@/types/actionos";
import { getRepositoryContainer } from "@/lib/repositories";
import { isDemoMode } from "@/lib/runtime/mode";
import { DEMO_CONTEXT } from "@/lib/security/auth-context";
import { getPaymentProvider } from "@/lib/payments";

export interface RefundPaymentInput {
  reference: string;
  amount: number;
  currency?: string;
  reason: string;
  simulateRefundFailure?: boolean;
  simulateRefundPending?: boolean;
  simulateRefundUnknown?: boolean;
}

export interface RefundPaymentOutput {
  refundReference?: string;
  originalReference: string;
  amount: number;
  currency: string;
  status: "refunded" | "processing" | "pending" | "failed";
  reason: string;
  refundedAt: string;
  refundState?: "refund_confirmed" | "refund_pending" | "refund_failed" | "refund_unknown";
}

export class RefundPaymentTool implements IActionOSTool<RefundPaymentInput, RefundPaymentOutput> {
  public readonly name = "refund_payment";
  public readonly description = "Saga Compensating Action: Reverse or refund customer payment upon downstream failure";
  public readonly category = "billing";
  public readonly version = "1.0.0";
  public readonly riskLevel = "high" as const;
  public readonly requiresConfirmation = false; // Internal Saga compensating execution

  validateInput(input: unknown): { valid: boolean; error?: string; data?: RefundPaymentInput } {
    if (!input || typeof input !== "object") {
      return { valid: false, error: "Input must be an object" };
    }
    const data = input as RefundPaymentInput;
    if (!data.reference) {
      return { valid: false, error: "Missing required reference" };
    }
    return { valid: true, data };
  }

  async execute(input: RefundPaymentInput, context: WorkflowExecutionContext): Promise<ToolResult<RefundPaymentOutput>> {
    const repos = getRepositoryContainer();
    const customerId = context.auth.customerId || (isDemoMode() ? DEMO_CONTEXT.customerId : undefined);

    if (!customerId) {
      return {
        success: false,
        error: {
          code: "MISSING_CUSTOMER_ID",
          message: "Security violation: customerId is required to process refund.",
        },
      };
    }

    const tenantContext = {
      organizationId: context.auth.organizationId,
      customerId: context.auth.customerId,
      role: context.auth.role,
    };

    // 1. Process refund directly through payment rail provider
    const paymentProvider = getPaymentProvider();
    if (!paymentProvider.refundPayment) {
      return {
        success: false,
        error: {
          code: "REFUND_NOT_SUPPORTED",
          message: `Active payment provider '${paymentProvider.name}' does not support automated refunds.`,
        },
      };
    }
    const refundProviderRes = await paymentProvider.refundPayment(input.reference, input.amount, {
      simulateRefundFailure: input.simulateRefundFailure,
      simulateRefundPending: input.simulateRefundPending,
      simulateRefundUnknown: input.simulateRefundUnknown,
    });

    const isConfirmed = refundProviderRes.status === "refund_confirmed" || refundProviderRes.status === "refunded";
    const isPending = refundProviderRes.status === "refund_pending";
    const isUnknown = refundProviderRes.status === "refund_unknown" || refundProviderRes.status === "unknown";

    const refundRef = refundProviderRes.refundReference;
    const dbTxRef = refundRef || `tx_refund_${input.reference}_${Date.now()}`;
    const providerName = paymentProvider.name.includes("Paystack Gateway") ? "paystack" : "mock_paystack";

    if (isConfirmed) {
      // 2. Authoritative confirmation: Record reversing transaction as succeeded
      await repos.transactions.create(
        {
          customer_id: customerId,
          renewal_id: null,
          amount: -Math.abs(input.amount),
          currency: input.currency || "NGN",
          provider: providerName,
          reference: dbTxRef,
          status: "succeeded",
          transaction_type: "refund",
          metadata: {
            originalReference: input.reference,
            gatewayRefundReference: refundRef || null,
            reason: input.reason,
            isSagaCompensating: true,
            gatewayVerified: true,
            refundState: "refund_confirmed",
          },
        },
        tenantContext
      );

      return {
        success: true,
        data: {
          refundReference: refundRef,
          originalReference: input.reference,
          amount: refundProviderRes.amount !== undefined ? refundProviderRes.amount : input.amount,
          currency: refundProviderRes.currency || input.currency || "NGN",
          status: "refunded",
          reason: input.reason,
          refundedAt: new Date().toISOString(),
          refundState: "refund_confirmed",
        },
      };
    }

    if (isPending) {
      // Accepted by gateway but not yet settled: record transaction as pending, NOT succeeded
      await repos.transactions.create(
        {
          customer_id: customerId,
          renewal_id: null,
          amount: -Math.abs(input.amount),
          currency: input.currency || "NGN",
          provider: providerName,
          reference: dbTxRef,
          status: "pending",
          transaction_type: "refund",
          metadata: {
            originalReference: input.reference,
            gatewayRefundReference: refundRef || null,
            reason: input.reason,
            isSagaCompensating: true,
            gatewayVerified: false,
            refundState: "refund_pending",
          },
        },
        tenantContext
      );

      return {
        success: false,
        data: {
          refundReference: refundRef,
          originalReference: input.reference,
          amount: refundProviderRes.amount !== undefined ? refundProviderRes.amount : input.amount,
          currency: refundProviderRes.currency || input.currency || "NGN",
          status: "pending",
          reason: input.reason,
          refundedAt: new Date().toISOString(),
          refundState: "refund_pending",
        },
        error: {
          code: "REFUND_PENDING",
          message: "Refund request accepted by payment gateway but settlement is pending confirmation.",
        },
      };
    }

    if (isUnknown) {
      return {
        success: false,
        data: {
          refundReference: refundRef,
          originalReference: input.reference,
          amount: refundProviderRes.amount !== undefined ? refundProviderRes.amount : input.amount,
          currency: refundProviderRes.currency || input.currency || "NGN",
          status: "pending",
          reason: input.reason,
          refundedAt: new Date().toISOString(),
          refundState: "refund_unknown",
        },
        error: {
          code: "REFUND_UNKNOWN",
          message: refundProviderRes.error || "Payment gateway refund outcome is ambiguous (network error or provider timeout).",
        },
      };
    }

    return {
      success: false,
      data: {
        refundReference: refundRef,
        originalReference: input.reference,
        amount: refundProviderRes.amount !== undefined ? refundProviderRes.amount : input.amount,
        currency: refundProviderRes.currency || input.currency || "NGN",
        status: "failed",
        reason: input.reason,
        refundedAt: new Date().toISOString(),
        refundState: "refund_failed",
      },
      error: {
        code: "REFUND_REJECTED",
        message: refundProviderRes.error || "Payment gateway rail declined refund reversal",
      },
    };
  }
}
