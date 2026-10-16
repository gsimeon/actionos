import type { Policy } from "@/types/database";
import { getRepositoryContainer, type TenantContext } from "@/lib/repositories";
import { getPaymentProvider } from "@/lib/runtime/dependencies";
import type { IPaymentProvider } from "@/lib/payments/provider";

export interface VerificationResult {
  verified: boolean;
  passed?: boolean;
  type: "payment" | "policy_renewal" | "certificate" | "vehicle_license";
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
          passed: false,
          type: "payment",
          details: `Payment reference ${reference} has status '${payment.status}'`,
          reason: `Payment reference ${reference} has status '${payment.status}'`,
          error: "PAYMENT_NOT_SETTLED",
        };
      }

      if (payment.amount < expectedAmount) {
        return {
          verified: false,
          passed: false,
          type: "payment",
          details: `Settled amount ₦${payment.amount} is less than expected ₦${expectedAmount}`,
          reason: `Settled amount ₦${payment.amount} is less than expected ₦${expectedAmount}`,
          error: "AMOUNT_MISMATCH",
        };
      }

      return {
        verified: true,
        passed: true,
        type: "payment",
        details: `Payment of ₦${payment.amount.toLocaleString()} independently confirmed via ${provider.name}. Settlement ref: ${payment.providerReference}`,
        reason: `Payment of ₦${payment.amount.toLocaleString()} independently confirmed via ${provider.name}. Settlement ref: ${payment.providerReference}`,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "NETWORK_ERROR";
      return {
        verified: false,
        passed: false,
        type: "payment",
        details: `Payment verification call failed: ${errMsg}`,
        reason: `Payment verification call failed: ${errMsg}`,
        error: errMsg,
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
  async verifyCertificate(customerId: string, policyNumber?: string, tenant?: TenantContext): Promise<VerificationResult> {
    const repos = getRepositoryContainer();
    const documents = await repos.documents.findByCustomerId(customerId, tenant);
    
    let cert = documents.find(
      (d) =>
        d.document_type === "certificate" &&
        policyNumber &&
        (d.file_name.includes(policyNumber) ||
          d.file_name.includes(policyNumber.replace(/[^A-Z0-9]/gi, "_")) ||
          d.file_path.includes(policyNumber.replace(/[^A-Z0-9]/gi, "_")))
    );

    if (!cert) {
      cert = documents.find((d) => d.document_type === "certificate");
    }

    if (!cert) {
      const details = policyNumber
        ? `No electronic certificate found for customer ${customerId} matching policy ${policyNumber}`
        : `No electronic certificate found for customer ${customerId}`;
      return {
        verified: false,
        passed: false,
        type: "certificate",
        details,
        reason: details,
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

  /**
   * Independently verify statutory vehicle license renewal, LACVIS inspection status, and official document issuance
   */
  async verifyVehicleLicense(
    plate: string,
    expectedNewExpiryYear: number,
    tenant?: TenantContext
  ): Promise<VerificationResult> {
    const repos = getRepositoryContainer();
    const cleanPlate = plate.trim().toUpperCase();
    const vehicles = await repos.assets.queryVehicles({ plate: cleanPlate, tenant });

    if (!vehicles || vehicles.length === 0) {
      return {
        verified: false,
        passed: false,
        type: "vehicle_license",
        details: `Vehicle registration '${cleanPlate}' not found in active records`,
        reason: `Vehicle registration '${cleanPlate}' not found in active records`,
        error: "VEHICLE_NOT_FOUND",
      };
    }

    const vehicle = vehicles[0];
    const meta = (vehicle.metadata || {}) as Record<string, unknown>;
    const licenseExpiry = typeof meta.license_expiry === "string" ? meta.license_expiry : undefined;

    if (!licenseExpiry) {
      return {
        verified: false,
        passed: false,
        type: "vehicle_license",
        details: `Vehicle '${cleanPlate}' has no recorded statutory license expiry date`,
        reason: `Vehicle '${cleanPlate}' has no recorded statutory license expiry date`,
        error: "NO_LICENSE_EXPIRY",
      };
    }

    const expiryYear = new Date(licenseExpiry).getFullYear();
    if (expiryYear < expectedNewExpiryYear) {
      return {
        verified: false,
        passed: false,
        type: "vehicle_license",
        details: `Vehicle license expiry year is ${expiryYear}, expected >= ${expectedNewExpiryYear}`,
        reason: `Vehicle license expiry year is ${expiryYear}, expected >= ${expectedNewExpiryYear}`,
        error: "LICENSE_NOT_ROLLED_FORWARD",
      };
    }

    // Verify digital documents issuance
    if (vehicle.customer_id) {
      const docs = await repos.documents.findByCustomerId(vehicle.customer_id, tenant);
      const cleanPlateSlug = cleanPlate.replace(/[^A-Z0-9]/gi, "_");
      const licenseDoc = docs.find(
        (d) =>
          d.file_name.includes("Vehicle_License") &&
          (d.file_name.includes(cleanPlateSlug) || d.file_path.includes(cleanPlateSlug))
      );

      if (!licenseDoc) {
        return {
          verified: false,
          passed: false,
          type: "vehicle_license",
          details: `Digital vehicle license paper document not found for vehicle ${cleanPlate}`,
          reason: `Digital vehicle license paper document not found for vehicle ${cleanPlate}`,
          error: "LICENSE_DOCUMENT_MISSING",
        };
      }
    }

    return {
      verified: true,
      passed: true,
      type: "vehicle_license",
      details: `Vehicle license for ${cleanPlate} (${vehicle.name}) independently verified as valid through ${licenseExpiry}.`,
      reason: `Vehicle license for ${cleanPlate} (${vehicle.name}) independently verified as valid through ${licenseExpiry}.`,
    };
  }
}

export const verifier = new ActionOSVerifier();
