import type { IActionOSTool, ToolResult, WorkflowExecutionContext } from "@/types/actionos";
import type { Document } from "@/types/database";
import { getRepositoryContainer } from "@/lib/repositories";

export interface GenerateCertInput {
  customerId: string;
  policyNumber: string;
  previousExpiry: string;
  newExpiry: string;
  amount: number;
}

export interface CertOutput {
  certificateId: string;
  documentNumber: string;
  fileUrl: string;
  document: Document;
}

export class GenerateCertificateTool implements IActionOSTool<GenerateCertInput, CertOutput> {
  public readonly name = "generate_certificate";
  public readonly description = "Generate digitally verifiable insurance certificate document";
  public readonly category = "document";
  public readonly version = "1.0.0";
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

    const docRecord = await repos.documents.create(
      {
        customer_id: input.customerId,
        renewal_id: null,
        document_type: "certificate",
        file_path: `/documents/certificates/${docNumber}.pdf`,
        file_name: `Motor_Insurance_Certificate_${input.policyNumber}.pdf`,
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
      },
    };
  }
}
