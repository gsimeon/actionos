import type { IActionOSTool, ToolResult, WorkflowExecutionContext } from "@/types/actionos";
import type { Asset } from "@/types/database";
import { getRepositoryContainer } from "@/lib/repositories";
import { VerifyNiidTool, type NiidVerificationOutput } from "./verify-niid";
import {
  normalizeNigerianLanguage,
  formatVehicleFoundMessage,
  formatVehicleNotFoundMessage,
  type SupportedNigerianLanguage,
} from "@/lib/ai/nigerian-languages";

export interface QueryVehicleInput {
  vehiclePlate?: string;
  chassisNumber?: string;
  vin?: string;
  engineNumber?: string;
  customerId?: string;
  query?: string;
  language?: string;
}

export interface QueryVehicleOutput {
  found: boolean;
  vehicle: Asset | null;
  plate?: string;
  vin?: string;
  engineNumber?: string;
  makeModel?: string;
  registrationStatus: string;
  niidVerification?: NiidVerificationOutput;
  localizedMessage: string;
  language: SupportedNigerianLanguage;
}

export class QueryVehicleTool implements IActionOSTool<QueryVehicleInput, QueryVehicleOutput> {
  public readonly name = "query_vehicle";
  public readonly description = "Query the ActionOS vehicle database and cross-verify with FRSC/NIID in Nigerian languages";
  public readonly category = "regulatory";
  public readonly version = "1.0.0";
  public readonly riskLevel = "low" as const;
  public readonly requiresConfirmation = false;

  private niidTool = new VerifyNiidTool();

  validateInput(input: unknown): { valid: boolean; error?: string; data?: QueryVehicleInput } {
    if (!input || typeof input !== "object") {
      return { valid: false, error: "Input must be an object" };
    }
    return { valid: true, data: input as QueryVehicleInput };
  }

  async execute(input: QueryVehicleInput, context: WorkflowExecutionContext): Promise<ToolResult<QueryVehicleOutput>> {
    const repos = getRepositoryContainer();
    const tenantContext = {
      organizationId: context.auth.organizationId,
      customerId: context.auth.customerId,
      role: context.auth.role,
    };

    const targetLang = normalizeNigerianLanguage(input.language || context.language);
    const rawQuery = (
      input.vehiclePlate ||
      input.vin ||
      input.chassisNumber ||
      input.engineNumber ||
      input.query ||
      ""
    ).trim();

    // 1. Query vehicles by plate / vin / engine / customer
    let vehicles: Asset[] = [];

    if (rawQuery) {
      vehicles = await repos.assets.queryVehicles({
        query: rawQuery,
        plate: input.vehiclePlate,
        vin: input.vin || input.chassisNumber,
        engineNumber: input.engineNumber,
        tenant: tenantContext,
      });
    }

    // 2. If no direct search query was provided, check customer's vehicles
    const targetCustomerId = input.customerId || context.auth.customerId;
    if (vehicles.length === 0 && !rawQuery && targetCustomerId) {
      vehicles = await repos.assets.findByCustomerId(targetCustomerId, tenantContext);
    }

    // 3. Fallback to benchmark vehicle in simulated mode if search is empty
    if (vehicles.length === 0 && !rawQuery && context.isSimulated) {
      const benchmark = await repos.assets.findByIdentifier("ABC-123-XY", tenantContext);
      if (benchmark) {
        vehicles = [benchmark];
      }
    }

    // Case A: Vehicle found
    if (vehicles.length > 0) {
      const matchedVehicle = vehicles[0];
      const meta = (matchedVehicle.metadata || {}) as Record<string, unknown>;

      // Perform statutory NIID / FRSC verification
      let niidResult: NiidVerificationOutput | undefined;
      const niidExec = await this.niidTool.execute(
        {
          vehiclePlate: matchedVehicle.identifier,
          chassisNumber: (meta.chassis_number as string) || (meta.vin as string),
        },
        context
      );
      if (niidExec.success && niidExec.data) {
        niidResult = niidExec.data;
      }

      // Fetch customer owner name if available
      let ownerName: string | undefined;
      if (matchedVehicle.customer_id) {
        const owner = await repos.customers.findById(matchedVehicle.customer_id, tenantContext);
        if (owner) {
          ownerName = owner.full_name;
        }
      }

      const localizedMessage = formatVehicleFoundMessage(matchedVehicle, ownerName, targetLang);

      return {
        success: true,
        data: {
          found: true,
          vehicle: matchedVehicle,
          plate: matchedVehicle.identifier,
          vin: (meta.chassis_number as string) || (meta.vin as string),
          engineNumber: (meta.engine_number as string) || (meta.engine as string),
          makeModel: matchedVehicle.name,
          registrationStatus: "registered",
          niidVerification: niidResult,
          localizedMessage,
          language: targetLang,
        },
      };
    }

    // Case B: Vehicle not found
    const displayQuery = rawQuery || "specified vehicle";
    const notFoundMessage = formatVehicleNotFoundMessage(displayQuery, targetLang);

    return {
      success: true,
      data: {
        found: false,
        vehicle: null,
        registrationStatus: "unregistered",
        localizedMessage: notFoundMessage,
        language: targetLang,
      },
    };
  }
}
