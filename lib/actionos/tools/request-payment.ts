import type { IActionOSTool, ToolResult, WorkflowExecutionContext } from "@/types/actionos";
import { getPaymentProvider } from "@/lib/payments";

export interface RequestPaymentInput {
  customerId: string;
  amount: number;
  currency?: string;
  policyNumber: string;
  renewalId?: string;
  quoteId?: string;
  idempotencyKey?: string;
}

export interface PaymentRequestOutput {
  reference: string;
  amount: number;
  currency: string;
  status: string;
  gatewayUrl?: string;
  providerReference?: string;
  idempotencyKey: string;
}

export class RequestPaymentTool implements IActionOSTool<RequestPaymentInput, PaymentRequestOutput> {
  public readonly name = "request_payment";
  public readonly description = "Initialize transaction through designated payment gateway rail";
  public readonly category = "payment";
  public readonly version = "1.0.0";
  public readonly riskLevel = "high" as const;
  public readonly requiresConfirmation = true;

  validateInput(input: unknown): { valid: boolean; error?: string; data?: RequestPaymentInput } {
    if (!input || typeof input !== "object") {
      return { valid: false, error: "Input must be an object" };
    }
    const data = input as RequestPaymentInput;
    if (!data.customerId || !data.amount) {
      return { valid: false, error: "customerId and amount are required" };
    }
    return { valid: true, data };
  }

  async execute(input: RequestPaymentInput, context: WorkflowExecutionContext): Promise<ToolResult<PaymentRequestOutput>> {
    // Durable idempotency reference tied to session and quote to guarantee exactly-once payment
    const sanitizedSession = context.sessionId.replace(/-/g, "").substring(0, 16);
    const sanitizedQuote = input.quoteId ? input.quoteId.replace(/-/g, "").substring(0, 16) : "";
    const sanitizedPolicy = input.policyNumber ? input.policyNumber.replace(/[^a-zA-Z0-9]/g, "") : "unknown";

    const reference =
      input.idempotencyKey ||
      (sanitizedQuote
        ? `act_${sanitizedSession}_q_${sanitizedQuote}`
        : `act_${sanitizedSession}_pay_${sanitizedPolicy}`);

    try {
      const res = await getPaymentProvider().requestPayment({
        customerId: input.customerId,
        amount: input.amount,
        currency: input.currency || "NGN",
        reference,
        metadata: {
          sessionId: context.sessionId,
          policyNumber: input.policyNumber,
          renewalId: input.renewalId,
          quoteId: input.quoteId,
          idempotencyKey: reference,
        },
      });

      return {
        success: true,
        data: {
          reference: res.reference,
          amount: input.amount,
          currency: input.currency || "NGN",
          status: res.status,
          gatewayUrl: res.gatewayUrl,
          providerReference: res.providerReference,
          idempotencyKey: reference,
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Payment gateway request failed";
      return {
        success: false,
        error: {
          code: "PAYMENT_INITIATION_FAILED",
          message,
        },
      };
    }
  }
}
