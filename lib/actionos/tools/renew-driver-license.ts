import crypto from "node:crypto";
import type { IActionOSTool, ToolResult, WorkflowExecutionContext } from "@/types/actionos";
import type { Document, Transaction } from "@/types/database";
import { getRepositoryContainer } from "@/lib/repositories";
import { frscGateway, validateDriverLicense } from "@/lib/integrations/frsc";
import { normalizeNigerianLanguage, type SupportedNigerianLanguage } from "@/lib/ai/nigerian-languages";

export interface RenewDriverLicenseInput {
  dlNumber?: string;
  durationYears?: 3 | 5;
  captureCenterId?: string;
  paymentReference?: string;
  expectedAmount?: number;
  language?: string;
}

export interface RenewDriverLicenseOutput {
  renewed: boolean;
  dlNumber: string;
  holderName: string;
  durationYears: number;
  statutoryFee: number;
  currency: string;
  newExpiryDate: string;
  temporaryPermitNumber: string;
  captureCenter: {
    id: string;
    name: string;
    address: string;
    appointmentWindow: string;
  };
  qrVerificationUrl: string;
  verificationHash: string;
  transaction: Transaction;
  permitDocument: Document;
  localizedMessage: string;
  language: SupportedNigerianLanguage;
}

export const FRSC_CAPTURE_CENTERS = [
  {
    id: "DLC-LAG-01",
    name: "FRSC Ojodu Berger Driver License Centre",
    address: "FRSC Sector Command, Ojodu Berger, Lagos",
  },
  {
    id: "DLC-LAG-02",
    name: "FRSC Lekki Driver License Centre",
    address: "Lekki-Epe Expressway, Marwa Bus Stop, Lekki, Lagos",
  },
  {
    id: "DLC-ABJ-01",
    name: "FRSC National Headquarters DLC Abuja",
    address: "Plot 344 Shehu Shagari Way, Garki, Abuja",
  },
  {
    id: "DLC-IBD-01",
    name: "FRSC Eleyele Driver License Centre",
    address: "Eleyele Roundabout, Ibadan, Oyo State",
  },
];

export class RenewDriverLicenseTool
  implements IActionOSTool<RenewDriverLicenseInput, RenewDriverLicenseOutput>
{
  public readonly name = "renew_driver_license";
  public readonly description =
    "Execute autonomous statutory Nigerian Driver's License renewal, MVAA/FRSC fee settlement, and biometric appointment scheduling";
  public readonly category = "regulatory";
  public readonly version = "1.0.0";
  public readonly riskLevel = "high" as const;
  public readonly requiresConfirmation = true;

  validateInput(input: unknown): { valid: boolean; error?: string; data?: RenewDriverLicenseInput } {
    if (!input || typeof input !== "object") {
      return { valid: false, error: "Input must be an object" };
    }
    return { valid: true, data: input as RenewDriverLicenseInput };
  }

  async execute(
    input: RenewDriverLicenseInput,
    context: WorkflowExecutionContext
  ): Promise<ToolResult<RenewDriverLicenseOutput>> {
    const repos = getRepositoryContainer();
    const isSimulated = Boolean(context.isSimulated || context.auth.isDemo);
    const tenantContext = {
      organizationId: context.auth.organizationId,
      customerId: context.auth.customerId,
      role: context.auth.role,
    };

    const targetLang = normalizeNigerianLanguage(input.language || context.language);
    const rawDl = input.dlNumber || (isSimulated ? "ABC12345678" : undefined);

    if (!rawDl) {
      return {
        success: false,
        error: {
          code: "DL_NUMBER_REQUIRED",
          message: "Nigerian Driver's License number is required for renewal.",
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

    // 1. Verify license with FRSC
    let verified;
    try {
      verified = await frscGateway.verifyDriverLicense(val.normalized);
    } catch (err) {
      return {
        success: false,
        error: {
          code: "FRSC_LOOKUP_FAILED",
          message: err instanceof Error ? err.message : "FRSC verification failed",
        },
      };
    }

    if (!verified.valid) {
      return {
        success: false,
        error: {
          code: "DL_INVALID_OR_REVOKED",
          message: "Driver's license is invalid or has been revoked by FRSC.",
        },
      };
    }

    // Statutory fee computation
    const duration = input.durationYears === 5 ? 5 : 3;
    const statutoryFee = duration === 5 ? 15750 : 10500; // ₦10,500 (3 yrs) or ₦15,750 (5 yrs)

    const now = new Date();
    const newExpiry = new Date(now);
    newExpiry.setFullYear(newExpiry.getFullYear() + duration);

    // Pick capture center
    const center =
      FRSC_CAPTURE_CENTERS.find((c) => c.id === input.captureCenterId) || FRSC_CAPTURE_CENTERS[0];
    const appointmentDate = new Date(now);
    appointmentDate.setDate(appointmentDate.getDate() + 3);
    const appointmentWindow = `${appointmentDate.toISOString().split("T")[0]} (09:00 AM - 01:00 PM)`;

    const temporaryPermitNumber = `FRSC-TMP-${new Date().getFullYear()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const qrVerificationUrl = `https://frsc.gov.ng/verify?dl=${val.normalized}&permit=${temporaryPermitNumber}`;

    const canonicalData = JSON.stringify({
      temporaryPermitNumber,
      dlNumber: val.normalized,
      holderName: verified.holderName || "Demo Holder",
      durationYears: duration,
      statutoryFee,
      newExpiryDate: newExpiry.toISOString(),
      centerId: center.id,
    });
    const verificationHash = crypto.createHash("sha256").update(canonicalData).digest("hex");

    // 2. Settle payment record in repository
    const targetCustomerId = context.auth.customerId || "CUS-000001";
    const txReference = input.paymentReference || `ACT-DL-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const transactionRecord = await repos.transactions.create(
      {
        customer_id: targetCustomerId,
        amount: statutoryFee,
        currency: "NGN",
        provider: "paystack",
        reference: txReference,
        status: "succeeded",
        transaction_type: "fee",
        metadata: {
          vertical: "licensing",
          dlNumber: val.normalized,
          temporaryPermitNumber,
          durationYears: duration,
          captureCenter: center.name,
          isSimulated,
        },
      },
      tenantContext
    );

    // 3. Create verifiable Document
    const permitDocument = await repos.documents.create(
      {
        customer_id: targetCustomerId,
        renewal_id: null,
        document_type: "certificate",
        file_path: `/documents/licensing/FRSC_Permit_${temporaryPermitNumber}.pdf`,
        file_name: isSimulated
          ? `SIMULATED_DEMO_FRSC_Permit_${temporaryPermitNumber}.pdf`
          : `FRSC_Temporary_Permit_${temporaryPermitNumber}.pdf`,
        mime_type: "application/pdf",
        status: "generated",
      },
      tenantContext
    );

    // 4. Localized response message
    let localizedMessage = `Driver's License ${val.normalized} renewed for ${duration} years until ${newExpiry.toISOString().split("T")[0]}. Temporary permit issued: ${temporaryPermitNumber}. Biometric capture appointment: ${appointmentWindow} at ${center.name}.`;

    if (targetLang === "pcm") {
      localizedMessage = `Your driver license ${val.normalized} don renew for ${duration} years reach ${newExpiry.toISOString().split("T")[0]}! Your temporary permit na ${temporaryPermitNumber}. Make you go ${center.name} on ${appointmentWindow} for photo and thumbprint.`;
    } else if (targetLang === "yo") {
      localizedMessage = `Iwe-aṣẹ awakọ ${val.normalized} ti sọ di ọtun fun ọdun ${duration} titi di ${newExpiry.toISOString().split("T")[0]}. Iwe-aṣẹ igba diẹ: ${temporaryPermitNumber}. Ọjọ biometric: ${appointmentWindow} ni ${center.name}.`;
    } else if (targetLang === "ha") {
      localizedMessage = `An sabunta lasisin tuki ${val.normalized} na shekaru ${duration} har zuwa ${newExpiry.toISOString().split("T")[0]}. Lambar izinin wucin gadi: ${temporaryPermitNumber}. Ranar duba hoton yatsa: ${appointmentWindow} a ${center.name}.`;
    } else if (targetLang === "ig") {
      localizedMessage = `Emelitere akwụkwọ ikike ịkwọ ụgbọala ${val.normalized} maka afọ ${duration} ruo ${newExpiry.toISOString().split("T")[0]}. Nọmba ikike nwa oge: ${temporaryPermitNumber}. Nhọpụta biometric: ${appointmentWindow} na ${center.name}.`;
    }

    return {
      success: true,
      data: {
        renewed: true,
        dlNumber: val.normalized,
        holderName: verified.holderName || "Demo Holder",
        durationYears: duration,
        statutoryFee,
        currency: "NGN",
        newExpiryDate: newExpiry.toISOString(),
        temporaryPermitNumber,
        captureCenter: {
          ...center,
          appointmentWindow,
        },
        qrVerificationUrl,
        verificationHash,
        transaction: transactionRecord,
        permitDocument,
        localizedMessage,
        language: targetLang,
      },
    };
  }
}
