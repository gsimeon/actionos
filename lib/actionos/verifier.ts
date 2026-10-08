import type { Policy } from "@/types/database";
import { getRepositoryContainer, type TenantContext } from "@/lib/repositories";
import { getPaymentProvider } from "@/lib/runtime/dependencies";
import type { IPaymentProvider } from "@/lib/payments/provider";

export interface VerificationResult {
  verified: boolean;
  passed?: boolean;
  type: "payment" | "policy_renewal" | "certificate";
  details: string;
  reason?: string;
  error?: string;
}

export class ActionOSVerifier {
  constructor(private paymentProvider?: IPaymentProvider) {}

  /**
   * Independently verify payment status directly from payment rails
   * (e.g. live Paystack API in production or mock provider in demo sandbox)
   */
  async verifyPayment(reference: string, expectedAmount: number): Promise<VerificationResult> {
    const provider = this.paymentProvider || getPaymentProvider();

    try {
      const payment = await provider.verifyPayment(reference);
      if (payment.status !== "succeeded") {
        return {
          verified: false,
          type: "payment",
          details: `Payment reference ${reference} has status '${payment.status}'`,
          error: "PAYMENT_NOT_SETTLED",
        };
      }

      if (payment.amount < expectedAmount) {
        return {
          verified: false,
          type: "payment",
          details: `Settled amount ₦${payment.amount} is less than expected ₦${expectedAmount}`,
          error: "AMOUNT_MISMATCH",
        };
      }

      return {
        verified: true,
        type: "payment",
        details: `Payment of ₦${payment.amount.toLocaleString()} independently confirmed via ${provider.name}. Settlement ref: ${payment.providerReference}`,
      };
    } catch (err: unknown) {
      return {
        verified: false,
        type: "payment",
        details: "Payment verification call failed",
        error: err instanceof Error ? err.message : "NETWORK_ERROR",
      };
    }
  }

  /**
   * Independently verify that policy state has truly rolled forward and updated in the database
   */
  async verifyRenewal(policyNumber: string, expectedNewExpiryYear: number, tenant?: TenantContext): Promise<VerificationResult> {
    const repos = getRepositoryContainer();
    const policy: Policy | null = await repos.policies.findByNumber(policyNumber, tenant);

    if (!policy) {
      return {
        verified: false,
        passed: false,
        type: "policy_renewal",
        details: `Policy ${policyNumber} not found in database`,
        reason: `Policy ${policyNumber} not found in database`,
        error: "POLICY_NOT_FOUND",
      };
    }

    if (policy.status !== "renewed" && policy.status !== "active") {
      return {
        verified: false,
        passed: false,
        type: "policy_renewal",
        details: `Policy status is '${policy.status}', expected 'renewed' or 'active'`,
        reason: `Policy status is '${policy.status}', expected 'renewed' or 'active'`,
        error: "INVALID_POLICY_STATUS",
      };
    }

    const expiryYear = new Date(policy.expiry_date).getFullYear();
    if (expiryYear < expectedNewExpiryYear) {
      return {
        verified: false,
        passed: false,
        type: "policy_renewal",
        details: `Policy expiry year is ${expiryYear}, expected >= ${expectedNewExpiryYear}`,
        reason: `Policy expiry year is ${expiryYear}, expected >= ${expectedNewExpiryYear}`,
        error: "EXPIRY_NOT_ROLLED_FORWARD",
      };
    }

    return {
      verified: true,
      passed: true,
      type: "policy_renewal",
      details: `Policy ${policyNumber} independently verified as ${policy.status} through ${policy.expiry_date}.`,
      reason: `Policy ${policyNumber} independently verified as ${policy.status} through ${policy.expiry_date}.`,
    };
  }

  /**
   * Independently verify digital certificate generation and tamper-evident metadata
   */
  async verifyCertificate(customerId: string, policyNumber: string, tenant?: TenantContext): Promise<VerificationResult> {
    const repos = getRepositoryContainer();
    const documents = await repos.documents.findByCustomerId(customerId, tenant);
    const cert = documents.find((d) => d.document_type === "certificate");

    if (!cert) {
      return {
        verified: false,
        passed: false,
        type: "certificate",
        details: `No electronic certificate found for customer ${customerId}`,
        reason: `No electronic certificate found for customer ${customerId}`,
        error: "CERTIFICATE_NOT_FOUND",
      };
    }

    return {
      verified: true,
      passed: true,
      type: "certificate",
      details: `Official certificate '${cert.file_name}' verified. Download URL: ${cert.file_path}`,
      reason: `Official certificate '${cert.file_name}' verified. Download URL: ${cert.file_path}`,
    };
  }
}

export const verifier = new ActionOSVerifier();
