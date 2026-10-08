import type { IActionOSTool, ToolResult, WorkflowExecutionContext } from "@/types/actionos";
import type { Policy } from "@/types/database";
import { getRepositoryContainer } from "@/lib/repositories";

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
    const data = input as RenewPolicyInput;
    if (!data.policyNumber) {
      return { valid: false, error: "policyNumber is required" };
    }
    return { valid: true, data };
  }

  async execute(input: RenewPolicyInput, context: WorkflowExecutionContext): Promise<ToolResult<RenewPolicyOutput>> {
    const repos = getRepositoryContainer();
    const tenantContext = {
      organizationId: context.organizationId,
      customerId: context.customerId,
      role: context.role,
    };
    const policy = await repos.policies.findByNumber(input.policyNumber, tenantContext);

    if (!policy) {
      return {
        success: false,
        error: {
          code: "POLICY_NOT_FOUND",
          message: `Policy '${input.policyNumber}' was not found in active records.`,
        },
      };
    }

    const previousExpiry = policy.expiry_date;
    const prevDate = new Date(previousExpiry);
    const newDate = new Date(prevDate);
    newDate.setFullYear(prevDate.getFullYear() + 1);
    const newExpiry = newDate.toISOString().split("T")[0]; // e.g. 2027-10-14

    // Mutate policy state via repository with tenant guard
    const updatedPolicy = await repos.policies.updateStatusAndExpiry(policy.id, "renewed", newExpiry, tenantContext);

    // Update renewal record if present
    const renewal = await repos.renewals.findByPolicyId(policy.id, tenantContext);
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
