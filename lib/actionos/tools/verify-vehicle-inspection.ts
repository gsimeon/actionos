import type { IActionOSTool, ToolResult, WorkflowExecutionContext } from "@/types/actionos";
import {
  normalizeNigerianLanguage,
  formatRoadworthinessInspectionMessage,
  type SupportedNigerianLanguage,
} from "@/lib/ai/nigerian-languages";
import { lacvisGateway, LacvisGatewayError } from "@/lib/integrations/lacvis";

export interface VerifyInspectionInput {
  vehiclePlate?: string;
  chassisNumber?: string;
  vin?: string;
  language?: string;
}

export interface VerifyInspectionOutput {
  verified: boolean;
  vehiclePlate: string;
  chassisNumber: string;
  inspectionId: string;
  mvaaRegistryStatus: "ACTIVE" | "PENDING_RENEWAL" | "EXPIRED";
  visualInspection: "PASSED" | "FAILED";
  brakeEfficiency: string;
  emissionStatus: string;
  lightingAndElectrical: "PASSED" | "FAILED";
  steeringSuspension: "PASSED" | "FAILED";
  overallResult: "PASSED" | "REQUIRES_RETEST";
  inspectionDate: string;
  expiryDate: string;
  inspectionCenter: string;
  certifiedAuthority: string;
  isSimulated: boolean;
  statutoryNotice: string;
  localizedMessage: string;
  language: SupportedNigerianLanguage;
}

export class VerifyVehicleInspectionTool
  implements IActionOSTool<VerifyInspectionInput, VerifyInspectionOutput>
{
  public readonly name = "verify_vehicle_inspection";
  public readonly description =
    "Verify vehicle statutory MVAA registry status and LACVIS computerized roadworthiness test clearance";
  public readonly category = "regulatory";
  public readonly version = "1.1.0";
  public readonly riskLevel = "low" as const;
  public readonly requiresConfirmation = false;

  validateInput(input: unknown): { valid: boolean; error?: string; data?: VerifyInspectionInput } {
    if (!input || typeof input !== "object") {
      return { valid: false, error: "Input must be an object" };
    }
    return { valid: true, data: input as VerifyInspectionInput };
  }

  async execute(
    input: VerifyInspectionInput,
    context: WorkflowExecutionContext
  ): Promise<ToolResult<VerifyInspectionOutput>> {
    const plate = (input.vehiclePlate || "ABC-123-XY").trim().toUpperCase();
    const chassis = (input.chassisNumber || input.vin || "DEMO-VIN-000001").trim().toUpperCase();
    const targetLang = normalizeNigerianLanguage(input.language || context.language);

    try {
      const inspection = await lacvisGateway.verifyInspection(plate, chassis);
      const brakeEfficiency = `${inspection.brakeEfficiencyPct}% (Min statutory threshold 70%)`;
      const emissionStatus =
        inspection.emissionStatus === "PASSED"
          ? `COMPLIANT (CO: ${inspection.emissionCoPct}%, HC: ${inspection.emissionHcPpm}ppm)`
          : `NON-COMPLIANT (CO: ${inspection.emissionCoPct}%, HC: ${inspection.emissionHcPpm}ppm)`;
      const overallResult = inspection.overallResult;

      const localizedMessage = formatRoadworthinessInspectionMessage(
        {
          plate,
          inspectionId: inspection.inspectionId,
          brakeEfficiency,
          emissionStatus,
          overallResult,
        },
        targetLang
      );

      return {
        success: true,
        data: {
          verified: overallResult === "PASSED",
          vehiclePlate: plate,
          chassisNumber: chassis,
          inspectionId: inspection.inspectionId,
          mvaaRegistryStatus: "ACTIVE",
          visualInspection: inspection.visualInspection,
          brakeEfficiency,
          emissionStatus,
          lightingAndElectrical: inspection.lightingAndElectrical,
          steeringSuspension: inspection.steeringSuspension,
          overallResult,
          inspectionDate: inspection.inspectionDate,
          expiryDate: inspection.expiryDate,
          inspectionCenter: inspection.centerName,
          certifiedAuthority: inspection.certifiedAuthority,
          isSimulated: inspection.isSimulated,
          statutoryNotice: inspection.statutoryNotice,
          localizedMessage,
          language: targetLang,
        },
      };
    } catch (err: unknown) {
      if (err instanceof LacvisGatewayError) {
        return {
          success: false,
          error: {
            code: err.code,
            message: err.message,
          },
        };
      }
      return {
        success: false,
        error: {
          code: "INSPECTION_FAILED",
          message: err instanceof Error ? err.message : "Vehicle inspection query failed",
        },
      };
    }
  }
}
