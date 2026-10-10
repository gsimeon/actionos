import type { IActionOSTool, ToolResult, WorkflowExecutionContext } from "@/types/actionos";
import type { Policy } from "@/types/database";
import { getRepositoryContainer } from "@/lib/repositories";
import { getPaymentProvider } from "@/lib/payments";

export interface RenewPolicyInput {
  policyNumber: string;
  paymentReference: string;
  expectedAmount?: number;
  expectedCurrency?: string;
  underwriter?: string;
}

export interface RenewPolicyOutput {
  policyNumber: string;
  previousExpiry: string;
  newExpiry: string;
  status: string;
  renewedAt: string;
  policy: Policy;
  idempotent?: boolean;
}

export class RenewPolicyTool implements IActionOSTool<RenewPolicyInput, RenewPolicyOutput> {
  public readonly name = "renew_policy";
  public readonly description = "Execute atomic policy renewal state transition and roll forward policy expiry date";
  public readonly category = "policy";
  public readonly version = "1.0.0";
  public readonly riskLevel = "high" as const;
  public readonly requiresConfirmation = true;

  validateInput(input: unknown): { valid: boolean; error?: string; data?: RenewPolicyInput } {
    if (!input || typeof input !== "object") {
      return { valid: false, error: "Input must be an object" };
    }
    const raw = input as Record<string, unknown>;
    const policyNum =
      (typeof raw.policyNumber === "string" ? raw.policyNumber : undefined) ||
      (typeof raw.policyId === "string" ? raw.policyId : undefined);
    if (!policyNum) {
      return { valid: false, error: "policyNumber is required" };
    }
    const data = input as RenewPolicyInput;
    return { valid: true, data: { ...data, policyNumber: policyNum } };
  }

  async execute(input: RenewPolicyInput, context: WorkflowExecutionContext): Promise<ToolResult<RenewPolicyOutput>> {
    const repos = getRepositoryContainer();
    const rawContext = context as unknown as Record<string, unknown>;
    const tenantContext = {
      organizationId:
        context.auth?.organizationId ||
        (typeof rawContext.organizationId === "string" ? rawContext.organizationId : undefined),
      customerId:
        context.auth?.customerId ||
        (typeof rawContext.customerId === "string" ? rawContext.customerId : undefined),
      role: context.auth?.role,
    };

    // 1. Verify payment reference is present
    if (!input.paymentReference || typeof input.paymentReference !== "string" || !input.paymentReference.trim()) {
      return {
        success: false,
        error: {
          code: "PAYMENT_REFERENCE_REQUIRED",
          message: "A verified paymentReference is strictly required to execute policy renewal.",
        },
      };
    }

    const ref = input.paymentReference.trim();

    // 2. Fetch policy record
    const rawInput = input as unknown as Record<string, unknown>;
    const effectivePolicyNumber =
      input.policyNumber || (typeof rawInput.policyId === "string" ? rawInput.policyId : "");
    const policy = await repos.policies.findByNumber(effectivePolicyNumber, tenantContext);

    if (!policy) {
      return {
        success: false,
        error: {
          code: "POLICY_NOT_FOUND",
          message: `Policy '${effectivePolicyNumber}' was not found in active records.`,
        },
      };
    }

    // 3. Fetch linked renewal record if present
    const renewal = await repos.renewals.findByPolicyId(policy.id, tenantContext);

    // 4. Verify payment independently against DB and/or payment rail provider
    const tx = await repos.transactions.findByReference(ref, tenantContext);
    let settledAmount = tx?.status === "succeeded" ? tx.amount : undefined;
    let settledCurrency = tx?.status === "succeeded" ? (tx.currency || "NGN").toUpperCase() : undefined;
    let isSettled = tx?.status === "succeeded";

    if (!isSettled) {
      try {
        const verification = await getPaymentProvider().verifyPayment(ref);
        if (verification.status === "succeeded" || verification.status === "confirmed") {
          isSettled = true;
          settledAmount = verification.amount;
          settledCurrency = (verification.currency || "NGN").toUpperCase();
        }
      } catch {
        isSettled = false;
      }
    }

    if (!isSettled) {
      return {
        success: false,
        error: {
          code: "UNVERIFIED_PAYMENT",
          message: `Payment settlement could not be independently verified for reference '${ref}'. Policy renewal halted.`,
        },
      };
    }

    // 5. Enforce quote amount and currency integrity
    const expectedAmount =
      typeof input.expectedAmount === "number"
        ? input.expectedAmount
        : typeof renewal?.quote_amount === "number"
        ? renewal.quote_amount
        : typeof policy.premium === "number"
        ? policy.premium
        : undefined;

    const expectedCurrency = (
      input.expectedCurrency ||
      renewal?.currency ||
      policy.currency ||
      "NGN"
    ).toUpperCase();

    if (expectedAmount !== undefined && settledAmount !== undefined) {
      if (Math.abs(settledAmount - expectedAmount) > 0.01) {
        return {
          success: false,
          error: {
            code: settledAmount < expectedAmount ? "UNDERPAID_PAYMENT" : "PAYMENT_AMOUNT_MISMATCH",
            message: `Settled payment amount (₦${settledAmount}) does not match required policy premium / quote (₦${expectedAmount}). Renewal halted.`,
          },
        };
      }
    }

    if (settledCurrency && expectedCurrency && settledCurrency !== expectedCurrency) {
      return {
        success: false,
        error: {
          code: "CURRENCY_MISMATCH",
          message: `Settled payment currency (${settledCurrency}) does not match expected quote currency (${expectedCurrency}). Renewal halted.`,
        },
      };
    }

    // 6. Enforce transaction boundary: prevent reusing refunded or cross-customer transactions
    if (tx) {
      if (tx.transaction_type === "refund") {
        return {
          success: false,
          error: {
            code: "UNVERIFIED_PAYMENT",
            message: `Transaction reference '${ref}' is a refunded reversal. Policy renewal cannot complete using a refunded transaction.`,
          },
        };
      }
      if (tenantContext.customerId && tx.customer_id && tx.customer_id !== tenantContext.customerId) {
        return {
          success: false,
          error: {
            code: "UNAUTHORIZED_PAYMENT",
            message: "Payment transaction belongs to another customer tenant context. Policy renewal halted.",
          },
        };
      }
    }

    const previousExpiry = policy.expiry_date;
    const prevDate = new Date(previousExpiry);
    const newDate = new Date(prevDate);
    newDate.setFullYear(prevDate.getFullYear() + 1);
    const newExpiry = newDate.toISOString().split("T")[0]; // e.g. 2027-10-14

    // 7. Idempotent check: if policy is already renewed or renewal is already completed, return existing record
    if (policy.status === "renewed" || (renewal && renewal.status === "completed")) {
      return {
        success: true,
        data: {
          policyNumber: policy.policy_number,
          previousExpiry: policy.expiry_date,
          newExpiry: policy.expiry_date,
          status: "renewed",
          renewedAt: policy.updated_at,
          policy,
          idempotent: true,
        },
      };
    }

    // 8. Mutate policy state via repository with tenant guard
    const updatedPolicy = await repos.policies.updateStatusAndExpiry(policy.id, "renewed", newExpiry, tenantContext);

    // Update renewal record if present
    if (renewal) {
      await repos.renewals.updateStatus(renewal.id, "completed", new Date().toISOString(), tenantContext);
      await repos.renewals.updatePaymentStatus(renewal.id, "succeeded", tenantContext);
    }

    return {
      success: true,
      data: {
        policyNumber: updatedPolicy.policy_number,
        previousExpiry,
        newExpiry,
        status: "renewed",
        renewedAt: new Date().toISOString(),
        policy: updatedPolicy,
      },
    };
  }
}
