import crypto from "node:crypto";
import type { IActionOSTool, ToolResult, WorkflowExecutionContext } from "@/types/actionos";
import type { Document, Transaction } from "@/types/database";
import { getRepositoryContainer } from "@/lib/repositories";
import { nhiaGateway, type HmoTier, type HmoCardIssuanceResult } from "@/lib/integrations/nhia";
import { normalizeNigerianLanguage, type SupportedNigerianLanguage } from "@/lib/ai/nigerian-languages";

export interface RenewHmoPolicyInput {
  nhiaNumber?: string;
  nin?: string;
  tier?: HmoTier;
  primaryHcpId?: string;
  primaryHcpName?: string;
  paymentReference?: string;
  expectedAmount?: number;
  dependentsCount?: number;
  language?: string;
}

export interface RenewHmoPolicyOutput {
  renewed: boolean;
  nhiaNumber: string;
  enrolleeName: string;
  tier: HmoTier;
  hmoProviderName: string;
  primaryHcpName: string;
  digitalCard: HmoCardIssuanceResult;
  coverageStartDate: string;
  coverageEndDate: string;
  premiumPaid: number;
  currency: string;
  transaction: Transaction;
  hmoDocument: Document;
  localizedMessage: string;
  language: SupportedNigerianLanguage;
}

export class RenewHmoPolicyTool implements IActionOSTool<RenewHmoPolicyInput, RenewHmoPolicyOutput> {
  public readonly name = "renew_hmo_policy";
  public readonly description =
    "Execute autonomous statutory HMO health insurance renewal, NHIA digital card issuance, and fee settlement";
  public readonly category = "health";
  public readonly version = "1.0.0";
  public readonly riskLevel = "high" as const;
  public readonly requiresConfirmation = true;

  validateInput(input: unknown): { valid: boolean; error?: string; data?: RenewHmoPolicyInput } {
    if (!input || typeof input !== "object") {
      return { valid: false, error: "Input must be an object" };
    }
    return { valid: true, data: input as RenewHmoPolicyInput };
  }

  async execute(
    input: RenewHmoPolicyInput,
    context: WorkflowExecutionContext
  ): Promise<ToolResult<RenewHmoPolicyOutput>> {
    const repos = getRepositoryContainer();
    const isSimulated = Boolean(context.isSimulated || context.auth.isDemo);
    const tenantContext = {
      organizationId: context.auth.organizationId,
      customerId: context.auth.customerId,
      role: context.auth.role,
    };

    const targetLang = normalizeNigerianLanguage(input.language || context.language);
    const targetNhia = input.nhiaNumber || (isSimulated ? "NHIA-2026-00812" : undefined);

    if (!targetNhia && !input.nin) {
      return {
        success: false,
        error: {
          code: "NHIA_IDENTIFIER_REQUIRED",
          message: "NHIA Enrollee ID or NIN is required for HMO policy renewal.",
        },
      };
    }

    // 1. Verify Enrollee with NHIA
    let enrollee;
    try {
      enrollee = await nhiaGateway.verifyEnrollee({
        nhiaNumber: targetNhia,
        nin: input.nin,
      });
    } catch (err) {
      return {
        success: false,
        error: {
          code: "NHIA_VERIFICATION_FAILED",
          message: err instanceof Error ? err.message : "NHIA verification failed",
        },
      };
    }

    if (!enrollee.found) {
      return {
        success: false,
        error: {
          code: "ENROLLEE_NOT_FOUND",
          message: `NHIA enrollee record not found for ${targetNhia || input.nin}.`,
        },
      };
    }

    const tier: HmoTier = input.tier || enrollee.tier;
    const premiumPaid = input.expectedAmount || enrollee.annualPremium;

    // 2. Roll forward coverage window by 1 year
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setFullYear(endDate.getFullYear() + 1);

    // 3. Issue official NHIA digital HMO card
    let digitalCard: HmoCardIssuanceResult;
    try {
      digitalCard = await nhiaGateway.issueDigitalHmoCard({
        nhiaNumber: enrollee.nhiaNumber,
        enrolleeName: enrollee.enrolleeName,
        hmoProviderName: enrollee.hmoProviderName,
        hmoProviderId: enrollee.hmoProviderId,
        tier,
        primaryHcpName: input.primaryHcpName || enrollee.primaryHcpName,
        primaryHcpId: input.primaryHcpId || enrollee.primaryHcpId,
        coverageStartDate: startDate.toISOString(),
        coverageEndDate: endDate.toISOString(),
        premiumPaid,
        bloodGroup: enrollee.bloodGroup,
        genotype: enrollee.genotype,
        dependentsCount: input.dependentsCount ?? enrollee.dependentsCount,
      });
    } catch (err) {
      return {
        success: false,
        error: {
          code: "NHIA_CARD_ISSUANCE_FAILED",
          message: err instanceof Error ? err.message : "Failed to issue digital HMO card",
        },
      };
    }

    // 4. Record financial settlement transaction in ActionOS repository
    const targetCustomerId = context.auth.customerId || "CUS-000001";
    const txReference = input.paymentReference || `ACT-HMO-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const transactionRecord = await repos.transactions.create(
      {
        customer_id: targetCustomerId,
        amount: premiumPaid,
        currency: "NGN",
        provider: "paystack",
        reference: txReference,
        status: "succeeded",
        transaction_type: "renewal_premium",
        metadata: {
          vertical: "health",
          nhiaNumber: enrollee.nhiaNumber,
          digitalCardNumber: digitalCard.digitalCardNumber,
          tier,
          hmoProvider: enrollee.hmoProviderName,
          isSimulated,
        },
      },
      tenantContext
    );

    // 5. Create verifiable Document record
    const hmoDocument = await repos.documents.create(
      {
        customer_id: targetCustomerId,
        renewal_id: null,
        document_type: "certificate",
        file_path: `/documents/health/HMO_Card_${digitalCard.digitalCardNumber}.pdf`,
        file_name: isSimulated
          ? `SIMULATED_DEMO_HMO_Card_${digitalCard.digitalCardNumber}.pdf`
          : `NHIA_HMO_Card_${digitalCard.digitalCardNumber}.pdf`,
        mime_type: "application/pdf",
        status: "generated",
      },
      tenantContext
    );

    // 6. Localized confirmation message
    let localizedMessage = `Your ${enrollee.hmoProviderName} (${tier.toUpperCase()}) health policy has been renewed successfully until ${endDate.toISOString().split("T")[0]}. Digital Card: ${digitalCard.digitalCardNumber}.`;

    if (targetLang === "pcm") {
      localizedMessage = `Your ${enrollee.hmoProviderName} (${tier.toUpperCase()}) health policy don renew sharp sharp! E go dey valid reach ${endDate.toISOString().split("T")[0]}. Your digital HMO card number na ${digitalCard.digitalCardNumber}.`;
    } else if (targetLang === "yo") {
      localizedMessage = `Iwe-iṣeduro ilera ${enrollee.hmoProviderName} (${tier.toUpperCase()}) rẹ ti sọ di ọtun ni aṣeyọri titi di ${endDate.toISOString().split("T")[0]}. Nọmba kaadi ilera rẹ ni ${digitalCard.digitalCardNumber}.`;
    } else if (targetLang === "ha") {
      localizedMessage = `An sabunta inshorar lafiyar ku ta ${enrollee.hmoProviderName} (${tier.toUpperCase()}) cikin nasara har zuwa ${endDate.toISOString().split("T")[0]}. Lambar katin ku shine ${digitalCard.digitalCardNumber}.`;
    } else if (targetLang === "ig") {
      localizedMessage = `Emelitere amụma mkpuchi ahụike ${enrollee.hmoProviderName} (${tier.toUpperCase()}) gị nke ọma ruo ${endDate.toISOString().split("T")[0]}. Nọmba kaadị dijitalụ gị bụ ${digitalCard.digitalCardNumber}.`;
    }

    return {
      success: true,
      data: {
        renewed: true,
        nhiaNumber: enrollee.nhiaNumber,
        enrolleeName: enrollee.enrolleeName,
        tier,
        hmoProviderName: enrollee.hmoProviderName,
        primaryHcpName: input.primaryHcpName || enrollee.primaryHcpName,
        digitalCard,
        coverageStartDate: startDate.toISOString(),
        coverageEndDate: endDate.toISOString(),
        premiumPaid,
        currency: "NGN",
        transaction: transactionRecord,
        hmoDocument,
        localizedMessage,
        language: targetLang,
      },
    };
  }
}
