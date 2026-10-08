import type { IActionOSTool, ToolResult, ExecutionContext } from "@/types/actionos";
import type { Policy } from "@/types/database";
import { getStore } from "@/lib/actionos/mock-store";

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

  async execute(input: RenewPolicyInput, _context: ExecutionContext): Promise<ToolResult<RenewPolicyOutput>> {
    const store = getStore();
    const policy = store.policies.find(
      (p) => p.policy_number.toLowerCase() === input.policyNumber.toLowerCase()
    );

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

    // Mutate policy state
    policy.status = "renewed";
    policy.expiry_date = newExpiry;
    policy.updated_at = new Date().toISOString();

    // Update renewal record
    const renewal = store.renewals.find((r) => r.policy_id === policy.id);
    if (renewal) {
      renewal.status = "completed";
      renewal.payment_status = "paid";
      renewal.renewed_at = new Date().toISOString();
      renewal.updated_at = new Date().toISOString();
    }

    return {
      success: true,
      data: {
        policyNumber: policy.policy_number,
        previousExpiry,
        newExpiry,
        status: "renewed",
        renewedAt: new Date().toISOString(),
        policy,
      },
    };
  }
}
