import type { IActionOSTool, ToolResult, WorkflowExecutionContext } from "@/types/actionos";
import { nhiaGateway, TIER_ANNUAL_PREMIUMS, type HmoTier, type NhiaEnrolleeVerificationResult } from "@/lib/integrations/nhia";

export interface CheckHealthEligibilityInput {
  nhiaNumber?: string;
  nin?: string;
  enrollee?: NhiaEnrolleeVerificationResult;
  selectedTier?: HmoTier;
  additionalDependents?: number;
}

export interface CheckHealthEligibilityOutput {
  eligible: boolean;
  nhiaNumber: string;
  enrolleeName: string;
  tier: HmoTier;
  basePremium: number;
  vatAmount: number;
  dependentsSurcharge: number;
  totalPremium: number;
  currency: string;
  coverageStartDate: string;
  newCoverageEndDate: string;
  daysUntilExpiry: number;
  primaryHcpName: string;
  reason?: string;
}

export class CheckHealthEligibilityTool
  implements IActionOSTool<CheckHealthEligibilityInput, CheckHealthEligibilityOutput>
{
  public readonly name = "check_health_eligibility";
  public readonly description =
    "Deterministic validation of health insurance renewal eligibility, statutory NHIA constraints, and premium quote calculation";
  public readonly category = "health";
  public readonly version = "1.0.0";
  public readonly riskLevel = "low" as const;
  public readonly requiresConfirmation = false;

  validateInput(input: unknown): {
    valid: boolean;
    error?: string;
    data?: CheckHealthEligibilityInput;
  } {
    if (!input || typeof input !== "object") {
      return { valid: false, error: "Input must be an object" };
    }
    return { valid: true, data: input as CheckHealthEligibilityInput };
  }

  async execute(
    input: CheckHealthEligibilityInput,
    context: WorkflowExecutionContext
  ): Promise<ToolResult<CheckHealthEligibilityOutput>> {
    let enrollee = input.enrollee;

    if (!enrollee) {
      const nhiaId = input.nhiaNumber || (context.isSimulated ? "NHIA-2026-00812" : undefined);
      if (!nhiaId && !input.nin) {
        return {
          success: false,
          error: {
            code: "ENROLLEE_IDENTIFIER_REQUIRED",
            message: "Cannot check health eligibility without NHIA ID or NIN.",
          },
        };
      }
      try {
        enrollee = await nhiaGateway.verifyEnrollee({
          nhiaNumber: nhiaId,
          nin: input.nin,
        });
      } catch (err) {
        return {
          success: false,
          error: {
            code: "NHIA_LOOKUP_FAILED",
            message: err instanceof Error ? err.message : "Failed to verify enrollee status.",
          },
        };
      }
    }

    if (!enrollee || !enrollee.found) {
      return {
        success: false,
        error: {
          code: "ENROLLEE_NOT_FOUND",
          message: "Enrollee record not found on the NHIA statutory portal.",
        },
      };
    }

    if (enrollee.activeStatus === "suspended") {
      return {
        success: false,
        error: {
          code: "POLICY_SUSPENDED",
          message: "Enrollee health policy is under administrative suspension by NHIA.",
        },
      };
    }

    // Renewal window check: Up to 60 days before expiry or 30 days after expiry (grace period)
    const isWithinWindow = enrollee.daysUntilExpiry <= 60 && enrollee.daysUntilExpiry >= -30;
    if (!isWithinWindow) {
      return {
        success: false,
        error: {
          code: "OUTSIDE_RENEWAL_WINDOW",
          message: `Health policy is not yet eligible for renewal. Expiry is in ${enrollee.daysUntilExpiry} days (eligible window: 60 days prior).`,
        },
      };
    }

    const tier = input.selectedTier || enrollee.tier;
    const basePremium = TIER_ANNUAL_PREMIUMS[tier] || 95000;
    const addlDependents = Math.max(0, input.additionalDependents || 0);
    const dependentsSurcharge = addlDependents * 15000; // ₦15,000 per extra dependent
    const subtotal = basePremium + dependentsSurcharge;
    const vatAmount = Math.round(subtotal * 0.075); // 7.5% Nigerian statutory VAT
    const totalPremium = subtotal + vatAmount;

    // Calculate new rolled-forward 1-year coverage window
    const currentEnd = new Date(enrollee.coverageEndDate || new Date());
    const newStart = currentEnd > new Date() ? currentEnd : new Date();
    const newEnd = new Date(newStart);
    newEnd.setFullYear(newEnd.getFullYear() + 1);

    return {
      success: true,
      data: {
        eligible: true,
        nhiaNumber: enrollee.nhiaNumber,
        enrolleeName: enrollee.enrolleeName,
        tier,
        basePremium,
        vatAmount,
        dependentsSurcharge,
        totalPremium,
        currency: "NGN",
        coverageStartDate: newStart.toISOString(),
        newCoverageEndDate: newEnd.toISOString(),
        daysUntilExpiry: enrollee.daysUntilExpiry,
        primaryHcpName: enrollee.primaryHcpName,
      },
    };
  }
}
