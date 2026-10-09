import type { IActionOSTool, ToolResult, WorkflowExecutionContext } from "@/types/actionos";
import type { Policy } from "@/types/database";
import { getRepositoryContainer } from "@/lib/repositories";

import { mockPaymentProvider } from "@/lib/payments/mock";

export interface RenewPolicyInput {
  policyNumber: string;
  paymentReference: string;
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

    // 1. Verify payment independently before renewing policy
    if (!input.paymentReference) {
      return {
        success: false,
        error: {
          code: "PAYMENT_REFERENCE_REQUIRED",
          message: "A verified paymentReference is strictly required to execute policy renewal.",
        },
      };
    }

    const tx = await repos.transactions.findByReference(input.paymentReference, tenantContext);
    let isSettled = tx?.status === "succeeded";

    if (!isSettled) {
      const verification = await mockPaymentProvider.verifyPayment(input.paymentReference);
      isSettled = verification.status === "succeeded";
    }

    if (!isSettled) {
      return {
        success: false,
        error: {
          code: "UNVERIFIED_PAYMENT",
          message: `Payment settlement could not be independently verified for reference '${input.paymentReference}'. Policy renewal halted.`,
        },
      };
    }

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

    const previousExpiry = policy.expiry_date;
    const prevDate = new Date(previousExpiry);
    const newDate = new Date(prevDate);
    newDate.setFullYear(prevDate.getFullYear() + 1);
    const newExpiry = newDate.toISOString().split("T")[0]; // e.g. 2027-10-14

    // 3. Idempotent check: if policy is already renewed or renewal is already completed, return existing record
    const renewal = await repos.renewals.findByPolicyId(policy.id, tenantContext);
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

    // 4. Mutate policy state via repository with tenant guard
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
