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
}

export interface RefundPaymentOutput {
  refundReference: string;
  originalReference: string;
  amount: number;
  currency: string;
  status: "refunded" | "processing";
  reason: string;
  refundedAt: string;
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
    });

    if (refundProviderRes.status !== "refunded") {
      return {
        success: false,
        error: {
          code: "REFUND_REJECTED",
          message: refundProviderRes.error || "Payment gateway rail declined refund reversal",
        },
      };
    }

    const refundRef = refundProviderRes.refundReference || `ref_rev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const providerName = paymentProvider.name.includes("Paystack Gateway") ? "paystack" : "mock_paystack";

    // 2. ONLY record reversing transaction in DB after provider confirms refund
    await repos.transactions.create(
      {
        customer_id: customerId,
        renewal_id: null,
        amount: -Math.abs(input.amount),
        currency: input.currency || "NGN",
        provider: providerName,
        reference: refundRef,
        status: "succeeded",
        transaction_type: "refund",
        metadata: {
          originalReference: input.reference,
          reason: input.reason,
          isSagaCompensating: true,
          gatewayVerified: true,
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
      },
    };
  }
}
