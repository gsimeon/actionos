import type { IActionOSTool, ToolResult, WorkflowExecutionContext } from "@/types/actionos";
import type { Document } from "@/types/database";
import { getRepositoryContainer } from "@/lib/repositories";
import { niidGateway, NiidGatewayError } from "@/lib/integrations/niid";

export interface GenerateCertInput {
  customerId: string;
  policyNumber: string;
  previousExpiry?: string;
  newExpiry: string;
  amount: number;
  underwriter?: string;
  vehiclePlate?: string;
  chassisNumber?: string;
  customerName?: string;
}

export interface CertOutput {
  certificateId: string;
  documentNumber: string;
  fileUrl: string;
  document: Document;
  isSimulated: boolean;
  authority: string;
  legalStatus: "SIMULATED_DEMO_NON_STATUTORY" | "STATUTORY_OFFICIAL_ISSUED";
  statutoryNotice: string;
  eStickerNumber?: string;
  naicomPolicyUid?: string;
  verificationHash?: string;
  qrVerificationUrl?: string;
}

export class GenerateCertificateTool implements IActionOSTool<GenerateCertInput, CertOutput> {
  public readonly name = "generate_certificate";
  public readonly description = "Generate digitally verifiable insurance certificate document registered with NIID / NAICOM";
  public readonly category = "document";
  public readonly version = "1.2.0";
  public readonly riskLevel = "medium" as const;
  public readonly requiresConfirmation = false;

  validateInput(input: unknown): { valid: boolean; error?: string; data?: GenerateCertInput } {
    if (!input || typeof input !== "object") {
      return { valid: false, error: "Input must be an object" };
    }
    const data = input as GenerateCertInput;
    if (!data.policyNumber) {
      return { valid: false, error: "policyNumber is required" };
    }
    return { valid: true, data };
  }

  async execute(input: GenerateCertInput, context: WorkflowExecutionContext): Promise<ToolResult<CertOutput>> {
    const repos = getRepositoryContainer();
    const tenantContext = {
      organizationId: context.auth.organizationId,
      customerId: context.auth.customerId,
      role: context.auth.role,
    };
    const docNumber = `CERT-ACT-${Date.now().toString().slice(-6)}`;
    const isSimulated = Boolean(context.isSimulated || context.auth.isDemo);

    let customerName = input.customerName || "Chief Babatunde Adeleke";
    const vehiclePlate = input.vehiclePlate || "ABC-123-XY";
    const chassisNumber = input.chassisNumber || "DEMO-VIN-000001";
    const underwriterName = input.underwriter || "Leadway Assurance Company Limited";

    // Attempt to enrich with customer profile if available
    try {
      const customer = await repos.customers.findById(input.customerId, tenantContext);
      if (customer?.full_name) {
        customerName = customer.full_name;
      }
    } catch {
      // In-memory or fallback context
    }

    // Register with NIID Portal
    let eStickerNumber: string | undefined;
    let naicomPolicyUid: string | undefined;
    let verificationHash: string | undefined;
    let qrVerificationUrl: string | undefined;

    try {
      const reg = await niidGateway.registerCertificate({
        policyNumber: input.policyNumber,
        vehiclePlate,
        chassisNumber,
        customerName,
        underwriterId: "leadway",
        underwriterName,
        coverageStartDate: input.previousExpiry || new Date().toISOString().split("T")[0],
        coverageEndDate: input.newExpiry,
        premiumPaid: input.amount,
        currency: "NGN",
      });

      eStickerNumber = reg.eStickerNumber;
      naicomPolicyUid = reg.naicomPolicyUid;
      verificationHash = reg.verificationHash;
      qrVerificationUrl = reg.qrVerificationUrl;
    } catch (err: unknown) {
      if (!isSimulated) {
        return {
          success: false,
          error: {
            code: err instanceof NiidGatewayError ? err.code : "NIID_REGISTRATION_FAILED",
            message: err instanceof Error ? err.message : "Failed to register certificate on NIID",
          },
        };
      }
    }

    const authority = isSimulated
      ? "ActionOS Regulatory Simulation Sandbox (Non-Statutory Demo Certificate)"
      : "NAICOM Digital Statutory Certificate Portal";
    const legalStatus = isSimulated ? "SIMULATED_DEMO_NON_STATUTORY" : "STATUTORY_OFFICIAL_ISSUED";
    const statutoryNotice = isSimulated
      ? "DEMO SIMULATION: Non-statutory sandbox document for demonstration and testing. Does not confer legal insurance coverage under the Insurance Act."
      : "STATUTORY DOCUMENT: Issued under the regulatory supervision of the National Insurance Commission (NAICOM).";

    const docRecord = await repos.documents.create(
      {
        customer_id: input.customerId,
        renewal_id: null,
        document_type: "certificate",
        file_path: `/documents/certificates/${docNumber}.pdf`,
        file_name: isSimulated
          ? `SIMULATED_DEMO_Certificate_${input.policyNumber}.pdf`
          : `Motor_Insurance_Certificate_${input.policyNumber}.pdf`,
        mime_type: "application/pdf",
        status: "generated",
      },
      tenantContext
    );

    return {
      success: true,
      data: {
        certificateId: docRecord.id,
        documentNumber: docNumber,
        fileUrl: `/dashboard/documents?id=${docRecord.id}`,
        document: docRecord,
        isSimulated,
        authority,
        legalStatus,
        statutoryNotice,
        eStickerNumber,
        naicomPolicyUid,
        verificationHash,
        qrVerificationUrl,
      },
    };
  }
}
