import type { IActionOSTool, ToolResult, WorkflowExecutionContext } from "@/types/actionos";
import { getRepositoryContainer } from "@/lib/repositories";
import { isDemoMode } from "@/lib/runtime/mode";
import { DEMO_CONTEXT } from "@/lib/security/auth-context";
import { getPaymentProvider } from "@/lib/payments";
import type { Transaction } from "@/types/database";

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
    if (!data.reference || typeof data.reference !== "string" || !data.reference.trim()) {
      return { valid: false, error: "Missing required reference" };
    }
    if (data.amount === undefined || data.amount === null) {
      return { valid: false, error: "Missing required amount for refund" };
    }
    if (typeof data.amount !== "number" || !Number.isFinite(data.amount) || data.amount <= 0) {
      return { valid: false, error: "Refund amount must be a finite positive number strictly greater than zero." };
    }
    if (Math.abs(data.amount * 100 - Math.round(data.amount * 100)) > 1e-6) {
      return { valid: false, error: "Refund amount cannot have more than 2 decimal places." };
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

    if (typeof input.amount !== "number" || !Number.isFinite(input.amount) || input.amount <= 0) {
      return {
        success: false,
        error: {
          code: "INVALID_REFUND_AMOUNT",
          message: "Refund amount must be a finite positive number strictly greater than zero.",
        },
      };
    }

    if (Math.abs(input.amount * 100 - Math.round(input.amount * 100)) > 1e-6) {
      return {
        success: false,
        error: {
          code: "INVALID_REFUND_PRECISION",
          message: "Refund amount cannot have more than 2 decimal places.",
        },
      };
    }

    const tenantContext = {
      organizationId: context.auth.organizationId,
      customerId: context.auth.customerId,
      role: context.auth.role,
    };

    // 1. FAIL CLOSED: Require a successfully retrieved, tenant-authorized original transaction before initiating any refund
    let originalTx: Transaction | null = null;
    try {
      originalTx = await repos.transactions.findByReference(input.reference, tenantContext);
    } catch (dbErr) {
      return {
        success: false,
        error: {
          code: "DATABASE_LOOKUP_FAILED",
          message: `Database error querying original transaction '${input.reference}': ${dbErr instanceof Error ? dbErr.message : String(dbErr)}. Failing closed.`,
        },
      };
    }

    if (!originalTx) {
      return {
        success: false,
        error: {
          code: "TRANSACTION_NOT_FOUND",
          message: `Original payment transaction '${input.reference}' was not found or tenant authorization mismatch. Cannot refund an unverified transaction.`,
        },
      };
    }

    if (originalTx.status !== "succeeded" && originalTx.status !== "partially_refunded") {
      return {
        success: false,
        error: {
          code: "INVALID_TRANSACTION_STATUS",
          message: `Cannot refund transaction in status '${originalTx.status}'. Only succeeded or partially_refunded transactions may be refunded.`,
        },
      };
    }

    // 2. ATOMIC BALANCE RESERVATION: Move refund balance reservation and cumulative-limit enforcement into an atomic database operation
    // Prevents two simultaneous refund requests from spending the same balance
    let reservationResult: { success: boolean; remainingBalance: number; reservationId?: string };
    try {
      reservationResult = await repos.transactions.reserveRefundBalance(
        originalTx.id,
        input.amount,
        tenantContext,
        { reason: input.reason }
      );
    } catch (reserveErr) {
      const errCode = (reserveErr as { code?: string })?.code || "CUMULATIVE_REFUND_LIMIT_EXCEEDED";
      const errMsg = reserveErr instanceof Error ? reserveErr.message : String(reserveErr);
      return {
        success: false,
        error: {
          code: errCode,
          message: errMsg,
        },
      };
    }

    if (!reservationResult || !reservationResult.success) {
      return {
        success: false,
        error: {
          code: "CUMULATIVE_REFUND_LIMIT_EXCEEDED",
          message: `Requested refund amount (${input.amount}) exceeds remaining refundable balance.`,
        },
      };
    }

    const reservationId = reservationResult.reservationId;

    // 3. Process refund directly through payment rail provider
    const paymentProvider = getPaymentProvider();
    if (!paymentProvider.refundPayment) {
      try {
        await repos.transactions.releaseRefundReservation(originalTx.id, input.amount, tenantContext, { reservationId });
      } catch {
        // ignore release error
      }
      return {
        success: false,
        error: {
          code: "REFUND_NOT_SUPPORTED",
          message: `Active payment provider '${paymentProvider.name}' does not support automated refunds.`,
        },
      };
    }

    let refundProviderRes;
    try {
      refundProviderRes = await paymentProvider.refundPayment(input.reference, input.amount, {
        simulateRefundFailure: input.simulateRefundFailure,
        simulateRefundPending: input.simulateRefundPending,
        simulateRefundUnknown: input.simulateRefundUnknown,
      });
    } catch (providerErr) {
      const errMsg = providerErr instanceof Error ? providerErr.message : String(providerErr);
      const isNetworkOrUnknown =
        errMsg.includes("EAI_AGAIN") ||
        errMsg.includes("ETIMEDOUT") ||
        errMsg.includes("ECONNRESET") ||
        errMsg.includes("timeout") ||
        errMsg.includes("DNS lookup") ||
        errMsg.includes("network") ||
        errMsg.includes("FetchError");

      if (!isNetworkOrUnknown) {
        try {
          await repos.transactions.releaseRefundReservation(originalTx.id, input.amount, tenantContext, { reservationId });
        } catch {
          // ignore
        }
      }

      return {
        success: false,
        data: {
          originalReference: input.reference,
          amount: input.amount,
          currency: input.currency || "NGN",
          status: "failed",
          reason: input.reason,
          refundedAt: new Date().toISOString(),
          refundState: isNetworkOrUnknown ? "refund_unknown" : "refund_failed",
        },
        error: {
          code: isNetworkOrUnknown ? "REFUND_UNKNOWN" : "PROVIDER_REFUND_ERROR",
          message: `Payment provider error during refund execution: ${errMsg}`,
        },
      };
    }

    const isConfirmed = refundProviderRes.status === "refund_confirmed" || refundProviderRes.status === "refunded";
    const isPending = refundProviderRes.status === "refund_pending";
    const isUnknown = refundProviderRes.status === "refund_unknown" || refundProviderRes.status === "unknown";

    if (!isConfirmed && !isPending && !isUnknown) {
      // Provider explicitly failed/declined refund: release reservation and fail closed
      try {
        await repos.transactions.releaseRefundReservation(originalTx.id, input.amount, tenantContext, { reservationId });
      } catch {
        // ignore
      }
      return {
        success: false,
        data: {
          refundReference: refundProviderRes.refundReference,
          originalReference: input.reference,
          amount: refundProviderRes.amount !== undefined ? refundProviderRes.amount : input.amount,
          currency: refundProviderRes.currency || input.currency || "NGN",
          status: "failed",
          reason: input.reason,
          refundedAt: new Date().toISOString(),
          refundState: "refund_failed",
        },
        error: {
          code: "REFUND_FAILED",
          message: refundProviderRes.error || "Payment provider declined refund request.",
        },
      };
    }

    const refundRef = refundProviderRes.refundReference;
    const dbTxRef = refundRef || `tx_refund_${input.reference}_${Date.now()}`;
    const providerName = paymentProvider.name.includes("Paystack Gateway") ? "paystack" : "mock_paystack";

    if (isConfirmed) {
      // 4. Authoritative confirmation: Record reversing transaction as succeeded
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
            expected_refund_amount: input.amount,
            reason: input.reason,
            isSagaCompensating: true,
            gatewayVerified: true,
            refundState: "refund_confirmed",
          },
        },
        tenantContext
      );

      // Update original transaction status and cumulative refund metadata - FAIL CLOSED if update fails
      const prevCumulative: number =
        typeof originalTx.metadata?.cumulative_refund_amount === "number"
          ? (originalTx.metadata.cumulative_refund_amount as number)
          : 0;
      const newCumulative = prevCumulative + input.amount;
      const isFullRefund = newCumulative >= originalTx.amount - 0.01;

      const existingHistory: Array<Record<string, unknown>> = Array.isArray(originalTx.metadata?.refund_history)
        ? [...(originalTx.metadata.refund_history as Array<Record<string, unknown>>)]
        : [];

      const updatedHistory = [
        ...existingHistory,
        {
          refund_reference: refundRef || dbTxRef,
          amount: input.amount,
          currency: input.currency || originalTx.currency || "NGN",
          settled_at: new Date().toISOString(),
        },
      ];

      const reservedBalance = Math.max(
        0,
        Number(originalTx.metadata?.reserved_refund_amount || 0) - input.amount
      );

      try {
        await repos.transactions.updateStatus(
          originalTx.id,
          isFullRefund ? "refunded" : "partially_refunded",
          tenantContext,
          {
            metadata: {
              ...originalTx.metadata,
              refund_state: "refund_confirmed",
              cumulative_refund_amount: newCumulative,
              remaining_balance: Math.max(0, originalTx.amount - newCumulative),
              reserved_refund_amount: reservedBalance,
              is_partial_refund: !isFullRefund,
              refund_history: updatedHistory,
              last_refund_settled_at: new Date().toISOString(),
            },
          }
        );
      } catch (updateErr) {
        // Do NOT treat update failure as non-fatal; propagate failure
        return {
          success: false,
          error: {
            code: "TRANSACTION_UPDATE_FAILED",
            message: `Failed to update original transaction after confirmed refund: ${updateErr instanceof Error ? updateErr.message : String(updateErr)}. Requires ledger reconciliation.`,
          },
        };
      }

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
            expected_refund_amount: input.amount,
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
