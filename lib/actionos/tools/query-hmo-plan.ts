import type { IActionOSTool, ToolResult, WorkflowExecutionContext } from "@/types/actionos";
import { nhiaGateway, type NhiaEnrolleeVerificationResult, type AccreditedHospital } from "@/lib/integrations/nhia";
import { normalizeNigerianLanguage, type SupportedNigerianLanguage } from "@/lib/ai/nigerian-languages";

export interface QueryHmoPlanInput {
  nhiaNumber?: string;
  nin?: string;
  customerEmail?: string;
  language?: string;
}

export interface QueryHmoPlanOutput {
  enrollee: NhiaEnrolleeVerificationResult;
  nearbyAccreditedHospitals: AccreditedHospital[];
  localizedSummary: string;
  language: SupportedNigerianLanguage;
}

export class QueryHmoPlanTool implements IActionOSTool<QueryHmoPlanInput, QueryHmoPlanOutput> {
  public readonly name = "query_hmo_plan";
  public readonly description =
    "Retrieve citizen health insurance enrollee record and NHIA-accredited healthcare providers";
  public readonly category = "health";
  public readonly version = "1.0.0";
  public readonly riskLevel = "low" as const;
  public readonly requiresConfirmation = false;

  validateInput(input: unknown): { valid: boolean; error?: string; data?: QueryHmoPlanInput } {
    if (!input || typeof input !== "object") {
      return { valid: false, error: "Input must be an object" };
    }
    return { valid: true, data: input as QueryHmoPlanInput };
  }

  async execute(
    input: QueryHmoPlanInput,
    context: WorkflowExecutionContext
  ): Promise<ToolResult<QueryHmoPlanOutput>> {
    const targetLang = normalizeNigerianLanguage(input.language || context.language);
    const targetNhia = input.nhiaNumber || (context.isSimulated ? "NHIA-2026-00812" : undefined);
    const targetNin = input.nin;

    if (!targetNhia && !targetNin) {
      return {
        success: false,
        error: {
          code: "NHIA_CREDENTIALS_REQUIRED",
          message: "Please provide either your NHIA Enrollee ID or National Identification Number (NIN).",
        },
      };
    }

    try {
      const enrollee = await nhiaGateway.verifyEnrollee({
        nhiaNumber: targetNhia,
        nin: targetNin,
        customerEmail: input.customerEmail,
      });

      if (!enrollee.found) {
        return {
          success: false,
          error: {
            code: "ENROLLEE_NOT_FOUND",
            message: `No active NHIA record found for identifier: ${targetNhia || targetNin}.`,
          },
        };
      }

      const hospitals = nhiaGateway.getAccreditedHospitals({ tier: enrollee.tier });

      let localizedSummary = `NHIA Enrollee verified: ${enrollee.enrolleeName} (${enrollee.tier.toUpperCase()} Tier). Primary Hospital: ${enrollee.primaryHcpName}. Coverage expires in ${enrollee.daysUntilExpiry} days.`;

      if (targetLang === "pcm") {
        localizedSummary = `We don verify your NHIA HMO card: ${enrollee.enrolleeName} (${enrollee.tier.toUpperCase()} Plan). Your hospital na ${enrollee.primaryHcpName}. E remain ${enrollee.daysUntilExpiry} days make e expire.`;
      } else if (targetLang === "yo") {
        localizedSummary = `A ti ṣayẹwo iwe-iṣeduro ilera NHIA rẹ: ${enrollee.enrolleeName} (${enrollee.tier.toUpperCase()}). Ile-iwosan rẹ ni ${enrollee.primaryHcpName}. O ku ọjọ ${enrollee.daysUntilExpiry} ki o pari.`;
      } else if (targetLang === "ha") {
        localizedSummary = `An tantance katin inshorar lafiya na NHIA: ${enrollee.enrolleeName} (${enrollee.tier.toUpperCase()}). Asibitin ku shine ${enrollee.primaryHcpName}. Sauran kwanaki ${enrollee.daysUntilExpiry} ya kare.`;
      } else if (targetLang === "ig") {
        localizedSummary = `Anyi enyochala kaadị mkpuchi ahụike NHIA gị: ${enrollee.enrolleeName} (${enrollee.tier.toUpperCase()}). Ụlọ ọgwụ gị bụ ${enrollee.primaryHcpName}. O fọrọ ụbọchị ${enrollee.daysUntilExpiry} ka ọ gwụ.`;
      }

      return {
        success: true,
        data: {
          enrollee,
          nearbyAccreditedHospitals: hospitals.slice(0, 3),
          localizedSummary,
          language: targetLang,
        },
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: {
          code: "NHIA_GATEWAY_ERROR",
          message: err instanceof Error ? err.message : "NHIA Gateway lookup error",
        },
      };
    }
  }
}
