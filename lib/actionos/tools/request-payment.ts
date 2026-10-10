import type { IActionOSTool, ToolResult, WorkflowExecutionContext } from "@/types/actionos";
import { getPaymentProvider } from "@/lib/payments";
import { getRepositoryContainer } from "@/lib/repositories";

export interface RequestPaymentInput {
  customerId: string;
  email?: string;
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
    if (!data.customerId || typeof data.customerId !== "string" || !data.customerId.trim()) {
      return { valid: false, error: "customerId is required and must be a non-empty string" };
    }
    if (typeof data.amount !== "number" || isNaN(data.amount) || data.amount <= 0 || !isFinite(data.amount)) {
      return { valid: false, error: "amount must be a positive non-zero number" };
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

    // Resolve customer email from repository if not directly provided
    const repos = getRepositoryContainer();
    let customerEmail = input.email;
    if (!customerEmail && input.customerId) {
      try {
        const customer = await repos.customers.findById(input.customerId, {
          organizationId: context.auth.organizationId,
          customerId: context.auth.customerId,
          role: context.auth.role,
        });
        if (customer?.email) {
          customerEmail = customer.email;
        }
      } catch {
        // Fall back gracefully
      }
    }

    try {
      const res = await getPaymentProvider().requestPayment({
        customerId: input.customerId,
        email: customerEmail,
        amount: input.amount,
        currency: input.currency || "NGN",
        reference,
        metadata: {
          sessionId: context.sessionId,
          policyNumber: input.policyNumber,
          renewalId: input.renewalId,
          quoteId: input.quoteId,
          email: customerEmail,
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
