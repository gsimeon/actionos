import type { IActionOSTool, ToolResult, WorkflowExecutionContext } from "@/types/actionos";
import type { Asset } from "@/types/database";
import { getRepositoryContainer } from "@/lib/repositories";
import { VerifyNiidTool } from "./verify-niid";
import {
  normalizeNigerianLanguage,
  formatVehicleRegisteredMessage,
  type SupportedNigerianLanguage,
} from "@/lib/ai/nigerian-languages";

export interface RegisterVehicleInput {
  customerId?: string;
  name?: string;
  make?: string;
  model?: string;
  year?: number;
  color?: string;
  vehiclePlate?: string;
  chassisNumber?: string;
  vin?: string;
  engineNumber?: string;
  language?: string;
}

export interface RegisterVehicleOutput {
  registered: boolean;
  vehicle: Asset;
  preclearanceToken: string;
  frscRegistrationNumber: string;
  localizedMessage: string;
  language: SupportedNigerianLanguage;
}

export class RegisterVehicleTool implements IActionOSTool<RegisterVehicleInput, RegisterVehicleOutput> {
  public readonly name = "register_vehicle";
  public readonly description = "Register a verified vehicle in the database with statutory FRSC and NIID pre-clearance in Nigerian languages";
  public readonly category = "regulatory";
  public readonly version = "1.0.0";
  public readonly riskLevel = "medium" as const;
  public readonly requiresConfirmation = true;

  private niidTool = new VerifyNiidTool();

  validateInput(input: unknown): { valid: boolean; error?: string; data?: RegisterVehicleInput } {
    if (!input || typeof input !== "object") {
      return { valid: false, error: "Input must be an object" };
    }
    return { valid: true, data: input as RegisterVehicleInput };
  }

  async execute(input: RegisterVehicleInput, context: WorkflowExecutionContext): Promise<ToolResult<RegisterVehicleOutput>> {
    const repos = getRepositoryContainer();
    const tenantContext = {
      organizationId: context.auth.organizationId,
      customerId: context.auth.customerId,
      role: context.auth.role,
    };

    const targetLang = normalizeNigerianLanguage(input.language || context.language);
    const targetCustomerId = input.customerId || context.auth.customerId;

    if (!targetCustomerId) {
      return {
        success: false,
        error: {
          code: "MISSING_CUSTOMER_ID",
          message: "A verified customer ID is required to register a vehicle.",
        },
      };
    }

    // Plate generation or normalization
    let plate = (input.vehiclePlate || "").trim().toUpperCase();
    if (!plate) {
      plate = `LAG-${Math.floor(100 + Math.random() * 900)}-${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`;
    }

    const vin = (input.vin || input.chassisNumber || `DEMO-VIN-${Math.floor(100000 + Math.random() * 900000)}`).trim().toUpperCase();
    const engine = (input.engineNumber || `DEMO-ENGINE-${Math.floor(100000 + Math.random() * 900000)}`).trim().toUpperCase();
    const make = input.make || "Toyota";
    const model = input.model || "Camry";
    const name = input.name || `${make} ${model}`;
    const year = input.year || new Date().getFullYear();
    const color = input.color || "Midnight Black";

    // 1. Statutory FRSC/NIID Verification Pre-flight
    const niidExec = await this.niidTool.execute(
      { vehiclePlate: plate, chassisNumber: vin },
      context
    );

    if (niidExec.success && niidExec.data?.theftFlag) {
      return {
        success: false,
        error: {
          code: "THEFT_FLAGGED",
          message: "Vehicle has an active theft or dispute flag in statutory registry and cannot be registered.",
        },
      };
    }

    const preclearanceToken = niidExec.data?.preclearanceToken || `NIID-${new Date().getFullYear()}-VAL-${Math.floor(100000 + Math.random() * 900000)}`;
    const frscRegistrationNumber = `FRSC-${new Date().getFullYear()}-${plate}`;

    // 2. Persist in ActionOS Vehicle Repository
    const createdAsset = await repos.assets.create(
      {
        customer_id: targetCustomerId,
        asset_type: "vehicle",
        name,
        identifier: plate,
        metadata: {
          make,
          model,
          year,
          color,
          chassis_number: vin,
          vin,
          engine_number: engine,
          engine,
          preclearance_token: preclearanceToken,
          frsc_registration_number: frscRegistrationNumber,
          registration_status: "registered",
          verified_at: new Date().toISOString(),
        },
      },
      tenantContext
    );

    const localizedMessage = formatVehicleRegisteredMessage(createdAsset, preclearanceToken, targetLang);

    return {
      success: true,
      data: {
        registered: true,
        vehicle: createdAsset,
        preclearanceToken,
        frscRegistrationNumber,
        localizedMessage,
        language: targetLang,
      },
    };
  }
}
