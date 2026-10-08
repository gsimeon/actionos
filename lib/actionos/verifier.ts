import type { Policy } from "@/types/database";
import { getStore } from "./mock-store";
import { mockPaymentProvider } from "@/lib/payments/mock";

export interface VerificationResult {
  verified: boolean;
  passed?: boolean;
  type: "payment" | "policy_renewal" | "certificate";
  details: string;
  reason?: string;
  error?: string;
}

export class ActionOSVerifier {
  /**
   * Independently verify payment status directly from payment rails
   */
  async verifyPayment(reference: string, expectedAmount: number): Promise<VerificationResult> {
    try {
      const payment = await mockPaymentProvider.verifyPayment(reference);
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
        details: `Payment of ₦${payment.amount.toLocaleString()} independently confirmed. Settlement ref: ${payment.providerReference}`,
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
  async verifyRenewal(policyNumber: string, expectedNewExpiryYear: number): Promise<VerificationResult> {
    const store = getStore();
    const policy: Policy | undefined = store.policies.find(
      (p) => p.policy_number.toLowerCase() === policyNumber.toLowerCase()
    );

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
}
