import type { IActionOSTool, ToolResult, ExecutionContext } from "@/types/actionos";
import type { Policy } from "@/types/database";
import { getStore } from "@/lib/actionos/mock-store";

export interface GetPolicyInput {
  customerId?: string;
  policyNumber?: string;
  vehiclePlate?: string;
}

export class GetPolicyTool implements IActionOSTool<GetPolicyInput, Policy> {
  public readonly name = "get_policy";
  public readonly description = "Find active, expiring, or eligible insurance policy by number, vehicle plate, or customer ID";
  public readonly category = "policy";
  public readonly version = "1.0.0";
  public readonly riskLevel = "low" as const;
  public readonly requiresConfirmation = false;

  validateInput(input: unknown): { valid: boolean; error?: string; data?: GetPolicyInput } {
    if (!input || typeof input !== "object") {
      return { valid: false, error: "Input must be an object" };
    }
    const data = input as GetPolicyInput;
    return { valid: true, data };
  }

  async execute(input: GetPolicyInput, context: ExecutionContext): Promise<ToolResult<Policy>> {
    const store = getStore();
    const customerId = input.customerId || context.customerId || store.customers[0]?.id;

    // First try matching policyNumber directly
    if (input.policyNumber) {
      const match = store.policies.find(
        (p) => p.policy_number.toLowerCase() === input.policyNumber?.toLowerCase()
      );
      if (match) {
        return { success: true, data: match };
      }
    }

    // Try matching via vehicle plate
    if (input.vehiclePlate) {
      const asset = store.assets.find(
        (a) => a.identifier.replace(/[-\s]/g, "").toLowerCase() === input.vehiclePlate?.replace(/[-\s]/g, "").toLowerCase()
      );
      if (asset) {
        const policy = store.policies.find((p) => p.asset_id === asset.id);
        if (policy) {
          return { success: true, data: policy };
        }
      }
    }

    // Fall back to finding policy belonging to customer (prefer expiring/active ones)
    const customerPolicies = store.policies.filter((p) => p.customer_id === customerId);
    if (customerPolicies.length > 0) {
      // Find expiring first, then active
      const prioritized =
        customerPolicies.find((p) => p.status === "expiring") ||
        customerPolicies.find((p) => p.status === "active") ||
        customerPolicies[0];

      return { success: true, data: prioritized };
    }

    return {
      success: false,
      error: {
        code: "POLICY_NOT_FOUND",
        message: "No active or expiring vehicle insurance policy was found for this customer.",
      },
    };
  }
}
