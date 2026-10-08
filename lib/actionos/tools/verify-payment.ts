import type { IActionOSTool, ToolResult, WorkflowExecutionContext } from "@/types/actionos";
import { mockPaymentProvider } from "@/lib/payments/mock";
import { ActionOSGuardrails } from "@/lib/actionos/guardrails";

export interface VerifyPaymentInput {
  reference: string;
  expectedAmount: number;
}

export interface VerifyPaymentOutput {
  verified: boolean;
  reference: string;
  amount: number;
  currency: string;
  paidAt: string;
  isSimulated: boolean;
  gatewayChannel: "sandbox_simulation" | "paystack_live";
  verificationSource: string;
}

export class VerifyPaymentTool implements IActionOSTool<VerifyPaymentInput, VerifyPaymentOutput> {
  public readonly name = "verify_payment";
  public readonly description = "Independently query payment gateway to confirm transaction settlement and match amount";
  public readonly category = "payment";
  public readonly version = "1.0.0";
  public readonly riskLevel = "medium" as const;
  public readonly requiresConfirmation = false;

  validateInput(input: unknown): { valid: boolean; error?: string; data?: VerifyPaymentInput } {
    if (!input || typeof input !== "object") {
      return { valid: false, error: "Input must be an object" };
    }
    const data = input as VerifyPaymentInput;
    if (!data.reference) {
      return { valid: false, error: "reference is required" };
    }
    return { valid: true, data };
  }

  async execute(input: VerifyPaymentInput, context: WorkflowExecutionContext): Promise<ToolResult<VerifyPaymentOutput>> {
    try {
      const verification = await mockPaymentProvider.verifyPayment(input.reference);

      const guardrails = new ActionOSGuardrails();
      const settlementCheck = guardrails.validatePaymentSettlement(
        verification.status,
        input.expectedAmount || 0,
        verification.amount
      );

      if (!settlementCheck.passed) {
        return {
          success: false,
          error: {
            code: settlementCheck.code || "PAYMENT_NOT_SETTLED",
            message: settlementCheck.reason || "Payment could not be verified.",
          },
        };
      }

      const isSimulated = Boolean(context.isSimulated || context.auth.isDemo);

      return {
        success: true,
        data: {
          verified: true,
          reference: input.reference,
          amount: verification.amount,
          currency: verification.currency,
          paidAt: verification.paidAt,
          isSimulated,
          gatewayChannel: isSimulated ? "sandbox_simulation" : "paystack_live",
          verificationSource: isSimulated
            ? "ActionOS Simulation Sandbox Gateway (Mock Paystack Rail)"
            : "Paystack Direct Verification API (live_settlement)",
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Payment verification check failed";
      return {
        success: false,
        error: {
          code: "VERIFICATION_FAILED",
          message,
        },
      };
    }
  }
}
