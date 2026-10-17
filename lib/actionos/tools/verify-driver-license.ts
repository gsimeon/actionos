import type { IActionOSTool, ToolResult, WorkflowExecutionContext } from "@/types/actionos";
import { frscGateway, type FrscDriverLicenseVerificationResult, validateDriverLicense } from "@/lib/integrations/frsc";
import { normalizeNigerianLanguage, type SupportedNigerianLanguage } from "@/lib/ai/nigerian-languages";

export interface VerifyDriverLicenseInput {
  dlNumber?: string;
  dateOfBirth?: string;
  language?: string;
}

export interface VerifyDriverLicenseOutput {
  verified: boolean;
  dlNumber: string;
  holderName?: string;
  classOfVehicle?: string;
  expiryDate?: string;
  stateOfIssue?: string;
  authority: string;
  isSimulated: boolean;
  localizedSummary: string;
  language: SupportedNigerianLanguage;
}

export class VerifyDriverLicenseTool
  implements IActionOSTool<VerifyDriverLicenseInput, VerifyDriverLicenseOutput>
{
  public readonly name = "verify_driver_license";
  public readonly description =
    "Authoritative lookup and format verification against the FRSC National Driver's License scheme";
  public readonly category = "regulatory";
  public readonly version = "1.0.0";
  public readonly riskLevel = "low" as const;
  public readonly requiresConfirmation = false;

  validateInput(input: unknown): {
    valid: boolean;
    error?: string;
    data?: VerifyDriverLicenseInput;
  } {
    if (!input || typeof input !== "object") {
      return { valid: false, error: "Input must be an object" };
    }
    return { valid: true, data: input as VerifyDriverLicenseInput };
  }

  async execute(
    input: VerifyDriverLicenseInput,
    context: WorkflowExecutionContext
  ): Promise<ToolResult<VerifyDriverLicenseOutput>> {
    const targetLang = normalizeNigerianLanguage(input.language || context.language);
    const rawDl = input.dlNumber || (context.isSimulated ? "ABC12345678" : undefined);

    if (!rawDl) {
      return {
        success: false,
        error: {
          code: "DL_NUMBER_REQUIRED",
          message: "Please provide a valid Nigerian Driver's License number (e.g. ABC12345678).",
        },
      };
    }

    const val = validateDriverLicense(rawDl);
    if (!val.valid || !val.normalized) {
      return {
        success: false,
        error: {
          code: "INVALID_DL_FORMAT",
          message: val.error || "Malformed Nigerian Driver's License format.",
        },
      };
    }

    try {
      const result: FrscDriverLicenseVerificationResult = await frscGateway.verifyDriverLicense(
        val.normalized,
        input.dateOfBirth
      );

      if (!result.valid) {
        return {
          success: false,
          error: {
            code: "DL_NOT_FOUND_OR_REVOKED",
            message: `Driver's License ${val.normalized} is invalid or has been revoked on the FRSC registry.`,
          },
        };
      }

      let localizedSummary = `FRSC Driver's License verified: ${result.holderName || "Demo Holder"} (${result.classOfVehicle || "Class E"}). Expiry: ${result.expiryDate || "Pending Renewal"}.`;

      if (targetLang === "pcm") {
        localizedSummary = `FRSC Driver License don verify well: ${result.holderName || "Demo Holder"} (${result.classOfVehicle || "Class E"}). E dey expire ${result.expiryDate || "ready for renewal"}.`;
      } else if (targetLang === "yo") {
        localizedSummary = `A ti ṣayẹwo iwe-aṣẹ awakọ FRSC rẹ: ${result.holderName || "Demo Holder"} (${result.classOfVehicle || "Class E"}). O pari ni ${result.expiryDate || "ti ṣetan fun atunṣe"}.`;
      } else if (targetLang === "ha") {
        localizedSummary = `An tantance lasisin tuki na FRSC: ${result.holderName || "Demo Holder"} (${result.classOfVehicle || "Class E"}). Yana karewa a ${result.expiryDate || "a shirye don sabuntawa"}.`;
      } else if (targetLang === "ig") {
        localizedSummary = `Enyochala akwụkwọ ikike ịkwọ ụgbọala FRSC: ${result.holderName || "Demo Holder"} (${result.classOfVehicle || "Class E"}). Ọ na-agwụ na ${result.expiryDate || "dị njikere maka imelite"}.`;
      }

      return {
        success: true,
        data: {
          verified: true,
          dlNumber: result.dlNumber,
          holderName: result.holderName,
          classOfVehicle: result.classOfVehicle,
          expiryDate: result.expiryDate,
          stateOfIssue: result.stateOfIssue,
          authority: result.authority,
          isSimulated: result.isSimulated,
          localizedSummary,
          language: targetLang,
        },
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: {
          code: "FRSC_DL_GATEWAY_ERROR",
          message: err instanceof Error ? err.message : "FRSC Driver's License verification failed",
        },
      };
    }
  }
}
