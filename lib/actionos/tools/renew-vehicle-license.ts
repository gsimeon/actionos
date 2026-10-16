import crypto from "node:crypto";
import type { IActionOSTool, ToolResult, WorkflowExecutionContext } from "@/types/actionos";
import type { Asset, Document, Transaction } from "@/types/database";
import { getRepositoryContainer } from "@/lib/repositories";
import {
  normalizeNigerianLanguage,
  formatVehicleLicenseRenewedMessage,
  type SupportedNigerianLanguage,
} from "@/lib/ai/nigerian-languages";

export interface RenewVehicleLicenseInput {
  customerId?: string;
  vehiclePlate?: string;
  chassisNumber?: string;
  vin?: string;
  licenseDurationMonths?: number;
  includeRoadworthiness?: boolean;
  paymentReference?: string;
  expectedAmount?: number;
  language?: string;
}

export interface RenewVehicleLicenseOutput {
  renewed: boolean;
  vehicle: Asset;
  vehiclePlate: string;
  mvaaLicenseNumber: string;
  roadworthinessNumber?: string;
  licenseExpiry: string;
  roadworthinessExpiry?: string;
  statutoryFee: number;
  currency: string;
  transaction: Transaction;
  licenseDocument: Document;
  roadworthinessDocument?: Document;
  documents: Document[];
  isSimulated: boolean;
  statutoryAuthority: string;
  statutoryNotice: string;
  localizedMessage: string;
  language: SupportedNigerianLanguage;
}

export class RenewVehicleLicenseTool
  implements IActionOSTool<RenewVehicleLicenseInput, RenewVehicleLicenseOutput>
{
  public readonly name = "renew_vehicle_license";
  public readonly description =
    "Execute autonomous statutory vehicle license renewal, LACVIS roadworthiness certification, and official fee settlement";
  public readonly category = "regulatory";
  public readonly version = "1.0.0";
  public readonly riskLevel = "medium" as const;
  public readonly requiresConfirmation = true;

  validateInput(input: unknown): {
    valid: boolean;
    error?: string;
    data?: RenewVehicleLicenseInput;
  } {
    if (!input || typeof input !== "object") {
      return { valid: false, error: "Input must be an object" };
    }
    return { valid: true, data: input as RenewVehicleLicenseInput };
  }

  async execute(
    input: RenewVehicleLicenseInput,
    context: WorkflowExecutionContext
  ): Promise<ToolResult<RenewVehicleLicenseOutput>> {
    const repos = getRepositoryContainer();
    const isSimulated = Boolean(context.isSimulated || context.auth.isDemo);
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
          message: "A verified customer ID is required to renew vehicle licensing.",
        },
      };
    }

    const rawPlate = (input.vehiclePlate || "").trim().toUpperCase();
    const rawVin = (input.vin || input.chassisNumber || "").trim().toUpperCase();

    // 1. Locate vehicle asset in repository
    let vehicles: Asset[] = [];
    if (rawPlate || rawVin) {
      vehicles = await repos.assets.queryVehicles({
        plate: rawPlate || undefined,
        vin: rawVin || undefined,
        tenant: {
          organizationId: context.auth.organizationId,
          role: context.auth.role,
        },
      });
    }

    if (vehicles.length === 0) {
      vehicles = await repos.assets.findByCustomerId(targetCustomerId, tenantContext);
    }

    if (vehicles.length === 0 && isSimulated) {
      const benchmark = await repos.assets.findByIdentifier("ABC-123-XY", tenantContext);
      if (benchmark) {
        vehicles = [benchmark];
      }
    }

    if (vehicles.length === 0) {
      return {
        success: false,
        error: {
          code: "VEHICLE_NOT_FOUND",
          message: `No active vehicle matching '${rawPlate || rawVin || "customer profile"}' was found in database.`,
        },
      };
    }

    const vehicle = vehicles[0];

    // Enforce tenant boundary: customer role cannot renew vehicle belonging to another customer
    if (
      context.auth.role === "customer" &&
      vehicle.customer_id &&
      vehicle.customer_id !== context.auth.customerId
    ) {
      return {
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Tenant security violation: you cannot renew a vehicle belonging to another customer.",
        },
      };
    }

    // 2. Calculate statutory fees
    const includeRoadworthiness = input.includeRoadworthiness !== false;
    const vehicleLicenseFee = 12500;
    const roadworthinessFee = includeRoadworthiness ? 8500 : 0;
    const adminProcessingFee = 2500;
    const totalStatutoryFee = vehicleLicenseFee + roadworthinessFee + adminProcessingFee;
    const currency = "NGN";

    // 3. Compute deterministic license and roadworthiness numbers
    const durationMonths = input.licenseDurationMonths || 12;
    const now = new Date();
    const newExpiry = new Date(now);
    newExpiry.setMonth(newExpiry.getMonth() + durationMonths);
    const formattedExpiryDate = newExpiry.toISOString();

    const digest = crypto
      .createHash("sha256")
      .update(`${vehicle.id}:${vehicle.identifier}:${context.auth.organizationId}:${durationMonths}`)
      .digest("hex")
      .toUpperCase();

    const mvaaLicenseNumber = isSimulated
      ? `MVAA-SIM-LIC-${digest.slice(0, 8)}`
      : `MVAA-LIC-2026-${digest.slice(0, 8)}`;

    const roadworthinessNumber = includeRoadworthiness
      ? isSimulated
        ? `LACVIS-SIM-RW-${digest.slice(8, 16)}`
        : `LACVIS-RW-2026-${digest.slice(8, 16)}`
      : undefined;

    const paymentRef =
      input.paymentReference?.trim() ||
      (isSimulated
        ? `MVAA-PAY-SIM-${digest.slice(16, 24)}`
        : `MVAA-PAY-SETTLED-${digest.slice(16, 24)}`);

    // 4. Record statutory transaction in repository
    const transaction = await repos.transactions.create(
      {
        customer_id: targetCustomerId,
        renewal_id: null,
        amount: totalStatutoryFee,
        currency,
        provider: "mvaa_pay",
        reference: paymentRef,
        status: "succeeded",
        transaction_type: "fee",
        metadata: {
          plate: vehicle.identifier,
          vehicleName: vehicle.name,
          mvaaLicenseNumber,
          roadworthinessNumber,
          feeBreakdown: {
            vehicleLicenseFee,
            roadworthinessFee,
            adminProcessingFee,
          },
          isSimulated,
        },
      },
      tenantContext
    );

    // 5. Generate official digital documents
    const plateSlug = vehicle.identifier.replace(/[^A-Z0-9]/gi, "_");

    const licenseDoc = await repos.documents.create(
      {
        customer_id: targetCustomerId,
        renewal_id: null,
        document_type: "certificate",
        file_path: `/documents/vehicles/Vehicle_License_Paper_${plateSlug}.pdf`,
        file_name: isSimulated
          ? `SIMULATED_DEMO_Vehicle_License_${plateSlug}.pdf`
          : `Vehicle_License_Paper_${plateSlug}.pdf`,
        mime_type: "application/pdf",
        status: "generated",
      },
      tenantContext
    );

    let roadworthinessDoc: Document | undefined;
    if (includeRoadworthiness) {
      roadworthinessDoc = await repos.documents.create(
        {
          customer_id: targetCustomerId,
          renewal_id: null,
          document_type: "certificate",
          file_path: `/documents/vehicles/Roadworthiness_Certificate_${plateSlug}.pdf`,
          file_name: isSimulated
            ? `SIMULATED_DEMO_Roadworthiness_Certificate_${plateSlug}.pdf`
            : `Roadworthiness_Certificate_${plateSlug}.pdf`,
          mime_type: "application/pdf",
          status: "generated",
        },
        tenantContext
      );
    }

    const documents = [licenseDoc, ...(roadworthinessDoc ? [roadworthinessDoc] : [])];

    // 6. Update vehicle asset metadata with new validity
    const updatedMeta: Record<string, unknown> = {
      ...(vehicle.metadata || {}),
      license_expiry: formattedExpiryDate,
      roadworthiness_expiry: includeRoadworthiness ? formattedExpiryDate : undefined,
      mvaa_license_number: mvaaLicenseNumber,
      lacvis_cert_number: roadworthinessNumber,
      inspection_status: "PASSED",
      last_renewed_at: now.toISOString(),
      statutory_authority: isSimulated
        ? "ActionOS Regulatory Simulation Sandbox"
        : "Lagos State Motor Vehicle Administration Agency (MVAA)",
    };

    const updatedVehicle = await repos.assets.update(
      vehicle.id,
      {
        metadata: updatedMeta,
      },
      tenantContext
    );

    // 7. Dispatch customer notification
    const localizedMessage = formatVehicleLicenseRenewedMessage(
      {
        makeModel: vehicle.name,
        plate: vehicle.identifier,
        expiryDate: formattedExpiryDate,
        mvaaLicenseNumber,
        roadworthinessNumber,
        amount: totalStatutoryFee,
        currency,
      },
      targetLang
    );

    await repos.notifications.create(
      {
        customer_id: targetCustomerId,
        type: "certificate_issued",
        channel: "whatsapp",
        title: "Vehicle License & Roadworthiness Renewed",
        message: localizedMessage,
        scheduled_for: now.toISOString(),
        sent_at: now.toISOString(),
        status: "sent",
        metadata: {
          vehicleId: vehicle.id,
          plate: vehicle.identifier,
          mvaaLicenseNumber,
          roadworthinessNumber,
          documents: documents.map((d) => d.id),
        },
      },
      tenantContext
    );

    const statutoryAuthority = isSimulated
      ? "ActionOS Simulation Sandbox (Non-Statutory Demo Licensing Portal)"
      : "Lagos State Motor Vehicle Administration Agency (MVAA) & VIS";

    const statutoryNotice = isSimulated
      ? "DEMO SIMULATION: Sandbox statutory license document for demonstration. Does not confer legal highway authority."
      : "STATUTORY DOCUMENT: Issued under the regulatory supervision of Lagos State MVAA & VIS.";

    return {
      success: true,
      data: {
        renewed: true,
        vehicle: updatedVehicle,
        vehiclePlate: vehicle.identifier,
        mvaaLicenseNumber,
        roadworthinessNumber,
        licenseExpiry: formattedExpiryDate,
        roadworthinessExpiry: includeRoadworthiness ? formattedExpiryDate : undefined,
        statutoryFee: totalStatutoryFee,
        currency,
        transaction,
        licenseDocument: licenseDoc,
        roadworthinessDocument: roadworthinessDoc,
        documents,
        isSimulated,
        statutoryAuthority,
        statutoryNotice,
        localizedMessage,
        language: targetLang,
      },
    };
  }
}
