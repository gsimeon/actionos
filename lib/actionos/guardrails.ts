import type { Customer, Policy } from "@/types/database";
import type { GuardrailCheckResult } from "@/types/actionos";

export interface GuardrailConfig {
  maxDaysBeforeExpiry: number;
  maxGracePeriodDays: number;
  maxTransactionAmount: number;
  allowedCurrencies: string[];
}

export const DEFAULT_GUARDRAIL_CONFIG: GuardrailConfig = {
  maxDaysBeforeExpiry: 30,
  maxGracePeriodDays: 30,
  maxTransactionAmount: 1_000_000, // ₦1,000,000 default max for automated self-service
  allowedCurrencies: ["NGN", "USD"],
};

export class ActionOSGuardrails {
  private config: GuardrailConfig;

  constructor(config: Partial<GuardrailConfig> = {}) {
    this.config = { ...DEFAULT_GUARDRAIL_CONFIG, ...config };
  }

  /**
   * 1. Customer Context Validation
   */
  validateCustomer(
    customer: Customer | null | undefined,
    expectedOrgId: string
  ): GuardrailCheckResult {
    if (!customer) {
      return {
        passed: false,
        rule: "CUSTOMER_EXISTENCE",
        reason: "Customer record could not be found or identified.",
        code: "CUSTOMER_NOT_FOUND",
      };
    }

    if (customer.organization_id !== expectedOrgId) {
      return {
        passed: false,
        rule: "CUSTOMER_ORG_MEMBERSHIP",
        reason: "Customer does not belong to the active organization tenant.",
        code: "ORGANIZATION_MISMATCH",
      };
    }

    if (customer.status !== "active") {
      return {
        passed: false,
        rule: "CUSTOMER_STATUS",
        reason: `Customer account is currently '${customer.status}'.`,
        code: "CUSTOMER_INACTIVE",
      };
    }

    return {
      passed: true,
      rule: "CUSTOMER_VALIDATION",
    };
  }

  /**
   * 2. Policy Ownership & Status Validation
   */
  validatePolicyOwnership(policy: Policy, customerId: string): GuardrailCheckResult {
    if (policy.customer_id !== customerId) {
      return {
        passed: false,
        rule: "POLICY_OWNERSHIP",
        reason: "Security Guardrail: Policy does not belong to this customer.",
        code: "UNAUTHORIZED_POLICY_ACCESS",
      };
    }

    if (policy.status === "cancelled") {
      return {
        passed: false,
        rule: "POLICY_STATUS_ACTIVE",
        reason: "Cancelled policies cannot be renewed automatically. Requires underwriter reactivation.",
        code: "POLICY_CANCELLED",
      };
    }

    if (policy.status === "suspended") {
      return {
        passed: false,
        rule: "POLICY_STATUS_ACTIVE",
        reason: "Policy is currently suspended due to underwriting flags.",
        code: "POLICY_SUSPENDED",
      };
    }

    return {
      passed: true,
      rule: "POLICY_OWNERSHIP",
    };
  }

  /**
   * 3. Renewal Eligibility & Expiry Window
   */
  validateRenewalEligibility(
    policy: Policy,
    referenceDate: Date = new Date()
  ): GuardrailCheckResult {
    const expiryDate = new Date(policy.expiry_date);
    const diffTime = expiryDate.getTime() - referenceDate.getTime();
    const daysUntilExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (policy.status === "renewed") {
      return {
        passed: false,
        rule: "ALREADY_RENEWED",
        reason: `Policy has already been renewed. Valid through ${policy.expiry_date}.`,
        code: "POLICY_ALREADY_RENEWED",
      };
    }

    if (daysUntilExpiry > this.config.maxDaysBeforeExpiry) {
      return {
        passed: false,
        rule: "RENEWAL_WINDOW_EARLY",
        reason: `Policy expires in ${daysUntilExpiry} days. Automated renewal is only open within ${this.config.maxDaysBeforeExpiry} days of expiry.`,
        code: "RENEWAL_TOO_EARLY",
      };
    }

    if (daysUntilExpiry < -this.config.maxGracePeriodDays) {
      return {
        passed: false,
        rule: "RENEWAL_WINDOW_EXPIRED",
        reason: `Policy expired ${Math.abs(daysUntilExpiry)} days ago, exceeding the ${this.config.maxGracePeriodDays}-day grace period. New vehicle physical inspection required.`,
        code: "EXPIRED_BEYOND_GRACE",
      };
    }

    return {
      passed: true,
      rule: "RENEWAL_WINDOW_ELIGIBLE",
    };
  }

  /**
   * 4. Quote and Financial Limits
   */
  validateQuote(amount: number, currency: string = "NGN"): GuardrailCheckResult {
    if (amount <= 0) {
      return {
        passed: false,
        rule: "QUOTE_POSITIVE",
        reason: "Quote amount must be greater than zero.",
        code: "INVALID_QUOTE_AMOUNT",
      };
    }

    if (!this.config.allowedCurrencies.includes(currency)) {
      return {
        passed: false,
        rule: "CURRENCY_ALLOWED",
        reason: `Currency '${currency}' is not supported for automated renewals.`,
        code: "UNSUPPORTED_CURRENCY",
      };
    }

    if (amount > this.config.maxTransactionAmount) {
      return {
        passed: false,
        rule: "TRANSACTION_LIMIT",
        reason: `Quote amount ₦${amount.toLocaleString()} exceeds the maximum automated threshold of ₦${this.config.maxTransactionAmount.toLocaleString()}. Staff approval required.`,
        code: "EXCEEDS_TRANSACTION_LIMIT",
      };
    }

    return {
      passed: true,
      rule: "QUOTE_VALID",
    };
  }

  /**
   * 5. Explicit User Authorization Check
   */
  validateAuthorization(
    isAuthorized: boolean,
    quoteAmount: number,
    authorizedAmount?: number
  ): GuardrailCheckResult {
    if (!isAuthorized) {
      return {
        passed: false,
        rule: "EXPLICIT_AUTHORIZATION",
        reason: "Explicit customer authorization is required before processing payment or policy renewal.",
        code: "AUTHORIZATION_REQUIRED",
      };
    }

    if (authorizedAmount !== undefined && authorizedAmount !== quoteAmount) {
      return {
        passed: false,
        rule: "AMOUNT_INTEGRITY",
        reason: `Authorized amount (₦${authorizedAmount}) differs from active quote amount (₦${quoteAmount}). Renewal aborted.`,
        code: "QUOTE_AMOUNT_MISMATCH",
      };
    }

    return {
      passed: true,
      rule: "AUTHORIZATION_VALID",
    };
  }

  /**
   * 6. Independent Payment Verification
   */
  validatePaymentSettlement(paymentStatus: string, expectedAmount: number, actualAmount: number): GuardrailCheckResult {
    if (paymentStatus !== "succeeded") {
      return {
        passed: false,
        rule: "PAYMENT_SETTLEMENT",
        reason: `Payment is not settled. Current status is '${paymentStatus}'. Policies cannot be renewed without verified settlement.`,
        code: "PAYMENT_UNVERIFIED",
      };
    }

    if (actualAmount < expectedAmount) {
      return {
        passed: false,
        rule: "PAYMENT_AMOUNT_MATCH",
        reason: `Settled payment amount (₦${actualAmount}) is less than required premium (₦${expectedAmount}).`,
        code: "UNDERPAID_PAYMENT",
      };
    }

    return {
      passed: true,
      rule: "PAYMENT_SETTLEMENT_VERIFIED",
    };
  }
}
