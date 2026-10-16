import type { IActionOSTool, ToolResult, WorkflowExecutionContext } from "@/types/actionos";
import { frscGateway, normalizePlateNumber } from "@/lib/integrations/frsc";
import { niidGateway, NiidGatewayError, type NiidPolicyVerificationResult } from "@/lib/integrations/niid";

export interface VerifyNiidInput {
  vehiclePlate?: string;
  chassisNumber?: string;
  policyNumber?: string;
}

export interface NiidVerificationOutput {
  verified: boolean;
  vehiclePlate: string;
  chassisNumber: string;
  engineNumber: string;
  niidRecordFound: boolean;
  activeExistingPolicy: boolean;
  underwriterName?: string;
  policyNumber?: string;
  frscRegistered: boolean;
  theftFlag: boolean;
  eStickerNumber?: string;
  naicomPolicyUid?: string;
  preclearanceToken: string;
  timestamp: string;
  isSimulated: boolean;
  registryAuthority: string;
  statutoryNotice: string;
}

export class VerifyNiidTool implements IActionOSTool<VerifyNiidInput, NiidVerificationOutput> {
  public readonly name = "verify_niid_database";
  public readonly description = "Verify vehicle registration against Nigerian Insurance Industry Database (NIID) and FRSC";
  public readonly category = "regulatory";
  public readonly version = "1.2.0";
  public readonly riskLevel = "low" as const;
  public readonly requiresConfirmation = false;

  validateInput(input: unknown): { valid: boolean; error?: string; data?: VerifyNiidInput } {
    if (!input || typeof input !== "object") {
      return { valid: false, error: "Input must be an object" };
    }
    return { valid: true, data: input as VerifyNiidInput };
  }

  async execute(input: VerifyNiidInput, context: WorkflowExecutionContext): Promise<ToolResult<NiidVerificationOutput>> {
    const isSimulated = Boolean(context.isSimulated || context.auth.isDemo);
    const rawPlate = (input.vehiclePlate || "ABC-123-XY").trim();
    const plate = normalizePlateNumber(rawPlate);
    const chassis = (input.chassisNumber || "DEMO-VIN-000001").trim().toUpperCase();

    let niidResult: NiidPolicyVerificationResult;
    try {
      niidResult = await niidGateway.verifyPolicy({
        plateNumber: plate,
        chassisNumber: chassis,
        policyNumber: input.policyNumber,
      });
    } catch (err: unknown) {
      if (!isSimulated) {
        return {
          success: false,
          error: {
            code: err instanceof NiidGatewayError ? err.code : "NIID_VERIFICATION_FAILED",
            message: err instanceof Error ? err.message : "NIID policy lookup failed",
          },
        };
      }
      throw err;
    }

    let frscRegistered = true;
    let theftFlag = false;
    let engineNumber = niidResult.engineNumber || "ENGINE-000001";

    try {
      const frsc = await frscGateway.verifyPlate(plate);
      frscRegistered = frsc.found;
      theftFlag = frsc.theftFlag;
      if (frsc.engineNumber) {
        engineNumber = frsc.engineNumber;
      }
    } catch (err: unknown) {
      if (!isSimulated) {
        return {
          success: false,
          error: {
            code: "FRSC_VERIFICATION_FAILED",
            message: err instanceof Error ? err.message : "FRSC verification failed",
          },
        };
      }
    }

    // Vehicle is verified if not flagged stolen, recognized by FRSC, and without blocking active policy conflicts
    const isVerified = !theftFlag && frscRegistered && (!niidResult.activePolicy || (niidResult.daysUntilExpiry ?? 0) <= 30);

    return {
      success: true,
      data: {
        verified: isVerified,
        vehiclePlate: plate,
        chassisNumber: chassis,
        engineNumber,
        niidRecordFound: niidResult.found,
        activeExistingPolicy: niidResult.activePolicy,
        underwriterName: niidResult.underwriterName,
        policyNumber: niidResult.policyNumber,
        frscRegistered,
        theftFlag,
        eStickerNumber: niidResult.eStickerNumber,
        naicomPolicyUid: niidResult.naicomPolicyUid,
        preclearanceToken: niidResult.preclearanceToken,
        timestamp: niidResult.timestamp,
        isSimulated: niidResult.isSimulated,
        registryAuthority: niidResult.registryAuthority,
        statutoryNotice: niidResult.statutoryNotice,
      },
    };
  }
}
