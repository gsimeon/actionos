import type { IActionOSTool, ToolResult, ExecutionContext } from "@/types/actionos";
import { getStore } from "@/lib/actionos/mock-store";

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
  frscRegistered: boolean;
  theftFlag: boolean;
  preclearanceToken: string;
  timestamp: string;
}

export class VerifyNiidTool implements IActionOSTool<VerifyNiidInput, NiidVerificationOutput> {
  public readonly name = "verify_niid_database";
  public readonly description = "Verify vehicle registration against Nigerian Insurance Industry Database (NIID) and FRSC";
  public readonly category = "regulatory";
  public readonly version = "1.0.0";
  public readonly riskLevel = "low" as const;
  public readonly requiresConfirmation = false;

  validateInput(input: unknown): { valid: boolean; error?: string; data?: VerifyNiidInput } {
    if (!input || typeof input !== "object") {
      return { valid: false, error: "Input must be an object" };
    }
    return { valid: true, data: input as VerifyNiidInput };
  }

  async execute(input: VerifyNiidInput, context: ExecutionContext): Promise<ToolResult<NiidVerificationOutput>> {
    const store = getStore();
    const plate = input.vehiclePlate || "ABC-123-XY";
    const matchingAsset = store.assets.find(
      (a) => a.identifier.replace(/\s+/g, "-").toUpperCase() === plate.replace(/\s+/g, "-").toUpperCase()
    );

    // NIID & FRSC statutory registry verification
    const preclearanceToken = `NIID-${new Date().getFullYear()}-VAL-${Math.floor(100000 + Math.random() * 900000)}`;

    return {
      success: true,
      data: {
        verified: true,
        vehiclePlate: plate,
        chassisNumber: (matchingAsset?.metadata?.vin as string) || "JTD12345678901234",
        engineNumber: "ENG-2GR-99410",
        niidRecordFound: true,
        activeExistingPolicy: false, // Eligible for renewal
        frscRegistered: true,
        theftFlag: false,
        preclearanceToken,
        timestamp: new Date().toISOString(),
      },
    };
  }
}
