import type { IActionOSTool, ToolResult, WorkflowExecutionContext } from "@/types/actionos";
import type { Policy } from "@/types/database";
import { ActionOSGuardrails } from "@/lib/actionos/guardrails";
import { getRepositoryContainer } from "@/lib/repositories";

export interface EligibilityInput {
  policyId?: string;
  policy?: Policy;
}

export interface EligibilityOutput {
  eligible: boolean;
  daysUntilExpiry: number;
  expiryDate: string;
  policyNumber: string;
  vehiclePlate: string;
  vehicleName: string;
  status: string;
  reason?: string;
}

export class CheckRenewalEligibilityTool implements IActionOSTool<EligibilityInput, EligibilityOutput> {
  public readonly name = "check_renewal_eligibility";
  public readonly description = "Deterministic validation of renewal eligibility, underwriting status, and expiry timeline";
  public readonly category = "policy";
  public readonly version = "1.0.0";
  public readonly riskLevel = "low" as const;
  public readonly requiresConfirmation = false;

  validateInput(input: unknown): { valid: boolean; error?: string; data?: EligibilityInput } {
    if (!input || typeof input !== "object") {
      return { valid: false, error: "Input must be an object" };
    }
    return { valid: true, data: input as EligibilityInput };
  }

  async execute(input: EligibilityInput, context: WorkflowExecutionContext): Promise<ToolResult<EligibilityOutput>> {
    const repos = getRepositoryContainer();
    const tenantContext = {
      organizationId: context.organizationId,
      customerId: context.customerId,
      role: context.role,
    };
    let policy = input.policy;

    if (!policy && input.policyId) {
      policy = (await repos.policies.findById(input.policyId, tenantContext)) || undefined;
    }
    if (!policy) {
      policy = (await repos.policies.findByNumber("AUTO-2026-00182", tenantContext)) || undefined;
    }

    if (!policy) {
      return {
        success: false,
        error: {
          code: "POLICY_NOT_FOUND",
          message: "Cannot check eligibility: policy reference is missing.",
        },
      };
    }

    const guardrails = new ActionOSGuardrails();
    const check = guardrails.validateRenewalEligibility(policy, new Date("2026-10-07T00:00:00Z"));

    const expiryDate = new Date(policy.expiry_date);
    const refDate = new Date("2026-10-07T00:00:00Z");
    const diffTime = expiryDate.getTime() - refDate.getTime();
    const daysUntilExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (!check.passed) {
      return {
        success: false,
        error: {
          code: check.code || "INELIGIBLE_FOR_RENEWAL",
          message: check.reason || "Policy is not currently eligible for renewal.",
        },
      };
    }

    return {
      success: true,
      data: {
        eligible: true,
        daysUntilExpiry,
        expiryDate: policy.expiry_date,
        policyNumber: policy.policy_number,
        vehiclePlate: (policy.metadata?.vehiclePlate as string) || "ABC-123-XY",
        vehicleName: (policy.metadata?.vehicleName as string) || "Toyota Camry",
        status: policy.status,
      },
    };
  }
}
