import crypto from "node:crypto";
import { isProductionMode } from "@/lib/runtime/mode";

export interface DemographicQuery {
  firstname?: string;
  surname?: string;
  dateOfBirth?: string; // YYYY-MM-DD
  gender?: "M" | "F";
  phone?: string;
}

export interface BiometricQuery {
  faceImageBase64?: string;
  fingerprintMinutiae?: string;
}

export interface NinVerificationOptions {
  demographics?: DemographicQuery;
  biometrics?: BiometricQuery;
  minimumMatchScore?: number; // 0 - 100, default 80
}

export interface NimcVerificationResult {
  found: boolean;
  verified: boolean;
  identityType: "raw_nin" | "vnin";
  ninOrVnin: string;
  maskedNin: string;
  enrollee: {
    firstname: string;
    surname: string;
    middlename?: string;
    dateOfBirth: string;
    gender: "M" | "F";
    phone: string;
    stateOfOrigin: string;
    lgaOfOrigin: string;
    residenceState: string;
    photoUrl?: string;
  };
  demographicMatch: {
    matched: boolean;
    confidenceScore: number; // 0 - 100
    matchedFields: string[];
    mismatchedFields: string[];
  };
  biometricMatch?: {
    verified: boolean;
    matchScore: number; // 0 - 100
    modality: "facial" | "fingerprint" | "none";
  };
  trackingId: string;
  verificationHash: string;
  timestamp: string;
  isSimulated: boolean;
  authority: string;
  statutoryAct: string;
}

export class NimcGatewayError extends Error {
  constructor(
    public readonly code:
      | "NIMC_CONFIGURATION_ERROR"
      | "NIMC_AUTHENTICATION_FAILED"
      | "NIMC_INVALID_FORMAT"
      | "NIMC_RECORD_NOT_FOUND"
      | "NIMC_SUSPENDED_IDENTITY"
      | "NIMC_BIOMETRIC_MISMATCH"
      | "NIMC_RATE_LIMITED"
      | "NIMC_UPSTREAM_UNAVAILABLE",
    message: string
  ) {
    super(`[NIMC-GATEWAY] ${code}: ${message}`);
    this.name = "NimcGatewayError";
  }
}

export class NimcGatewayClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly agentCode: string;

  constructor() {
    this.baseUrl = process.env.NIMC_API_URL || "https://api.nimc.gov.ng/v2";
    this.apiKey = process.env.NIMC_API_KEY || "";
    this.agentCode = process.env.NIMC_AGENT_CODE || "";
  }

  /**
   * Validate NIN format: 11 numeric digits, or 16-character alphanumeric vNIN
   */
  public validateIdentifierFormat(identifier: string): { isValid: boolean; type: "raw_nin" | "vnin" | "invalid" } {
    const cleaned = identifier.trim().replace(/[-\s]/g, "");

    // Raw 11-digit NIN
    if (/^\d{11}$/.test(cleaned)) {
      return { isValid: true, type: "raw_nin" };
    }

    // 16-character alphanumeric vNIN token
    if (/^[A-Za-z0-9]{16}$/.test(cleaned)) {
      return { isValid: true, type: "vnin" };
    }

    return { isValid: false, type: "invalid" };
  }

  /**
   * Verify NIN or vNIN against NIMC statutory database
   */
  public async verifyIdentity(
    identifier: string,
    options?: NinVerificationOptions
  ): Promise<NimcVerificationResult> {
    const format = this.validateIdentifierFormat(identifier);
    if (!format.isValid) {
      throw new NimcGatewayError(
        "NIMC_INVALID_FORMAT",
        `Identifier "${identifier}" must be an 11-digit numeric NIN or a 16-character alphanumeric vNIN.`
      );
    }

    const cleanedId = identifier.trim().replace(/[-\s]/g, "");

    // Fail-closed enforcement in production mode
    if (isProductionMode()) {
      if (!this.apiKey || !this.agentCode) {
        throw new NimcGatewayError(
          "NIMC_CONFIGURATION_ERROR",
          "Production NIMC integration requires valid NIMC_API_KEY and NIMC_AGENT_CODE."
        );
      }
      return this.executeLiveNimcCall(cleanedId, format.type as "raw_nin" | "vnin", options);
    }

    // Simulation / Sandbox Mode
    return this.executeSimulatedVerification(cleanedId, format.type as "raw_nin" | "vnin", options);
  }

  private async executeLiveNimcCall(
    identifier: string,
    type: "raw_nin" | "vnin",
    options?: NinVerificationOptions
  ): Promise<NimcVerificationResult> {
    try {
      const endpoint = type === "vnin" ? `${this.baseUrl}/vnin/verify` : `${this.baseUrl}/nin/verify`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Nimc-Api-Key": this.apiKey,
          "X-Nimc-Agent-Code": this.agentCode,
          "User-Agent": "ActionOS-NIMC-Client/2026.1",
        },
        body: JSON.stringify({
          identifier,
          demographics: options?.demographics,
          biometrics: options?.biometrics,
        }),
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new NimcGatewayError("NIMC_RECORD_NOT_FOUND", `NIN/vNIN ${identifier} not found in NIMC registry.`);
        }
        if (response.status === 401 || response.status === 403) {
          throw new NimcGatewayError("NIMC_AUTHENTICATION_FAILED", "NIMC credentials rejected by statutory gateway.");
        }
        if (response.status === 429) {
          throw new NimcGatewayError("NIMC_RATE_LIMITED", "NIMC gateway rate limit exceeded.");
        }
        throw new NimcGatewayError("NIMC_UPSTREAM_UNAVAILABLE", `NIMC gateway returned HTTP ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (err) {
      if (err instanceof NimcGatewayError) throw err;
      throw new NimcGatewayError("NIMC_UPSTREAM_UNAVAILABLE", "Failed to reach NIMC National Verification Service.");
    }
  }

  private executeSimulatedVerification(
    identifier: string,
    type: "raw_nin" | "vnin",
    options?: NinVerificationOptions
  ): NimcVerificationResult {
    // Known test cases
    if (identifier === "00000000000") {
      throw new NimcGatewayError(
        "NIMC_SUSPENDED_IDENTITY",
        "This National Identity Number is flagged for security audit and suspended by NIMC."
      );
    }

    if (identifier === "99999999999") {
      throw new NimcGatewayError(
        "NIMC_RECORD_NOT_FOUND",
        "The requested NIN is not registered in the National Identity Database."
      );
    }

    const maskedNin =
      type === "raw_nin"
        ? `${identifier.slice(0, 3)}*****${identifier.slice(8)}`
        : `${identifier.slice(0, 4)}-****-****-${identifier.slice(12)}`;

    // Generate demographic fixture based on input
    const isFemale = identifier.endsWith("2") || identifier.endsWith("4") || identifier.endsWith("8");
    const firstname = isFemale ? "Amina" : "Aliko";
    const surname = isFemale ? "Abdullahi" : "Bello";
    const gender: "M" | "F" = isFemale ? "F" : "M";
    const dateOfBirth = "1988-06-14";
    const phone = "+2348031234567";

    // Compare demographics if provided
    const matchedFields: string[] = [];
    const mismatchedFields: string[] = [];

    if (options?.demographics) {
      const d = options.demographics;
      if (d.firstname) {
        if (d.firstname.toLowerCase() === firstname.toLowerCase()) matchedFields.push("firstname");
        else mismatchedFields.push("firstname");
      }
      if (d.surname) {
        if (d.surname.toLowerCase() === surname.toLowerCase()) matchedFields.push("surname");
        else mismatchedFields.push("surname");
      }
      if (d.gender) {
        if (d.gender.toUpperCase() === gender) matchedFields.push("gender");
        else mismatchedFields.push("gender");
      }
      if (d.dateOfBirth) {
        if (d.dateOfBirth === dateOfBirth) matchedFields.push("dateOfBirth");
        else mismatchedFields.push("dateOfBirth");
      }
    }

    const totalQueried = matchedFields.length + mismatchedFields.length;
    const confidenceScore = totalQueried > 0 ? Math.round((matchedFields.length / totalQueried) * 100) : 100;
    const minScore = options?.minimumMatchScore ?? 80;

    const trackingId = `NIMC-TRK-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const timestamp = new Date().toISOString();

    const verificationHash = crypto
      .createHash("sha256")
      .update(`${identifier}:${trackingId}:${timestamp}:actionos_nimc_verified`)
      .digest("hex");

    let biometricMatch: NimcVerificationResult["biometricMatch"] = undefined;
    if (options?.biometrics?.faceImageBase64) {
      biometricMatch = {
        verified: true,
        matchScore: 94.6,
        modality: "facial",
      };
    } else if (options?.biometrics?.fingerprintMinutiae) {
      biometricMatch = {
        verified: true,
        matchScore: 98.2,
        modality: "fingerprint",
      };
    }

    return {
      found: true,
      verified: confidenceScore >= minScore,
      identityType: type,
      ninOrVnin: identifier,
      maskedNin,
      enrollee: {
        firstname,
        surname,
        middlename: isFemale ? "Fatima" : "Danjuma",
        dateOfBirth,
        gender,
        phone,
        stateOfOrigin: "Kano",
        lgaOfOrigin: "Nassarawa",
        residenceState: "Lagos",
      },
      demographicMatch: {
        matched: confidenceScore >= minScore,
        confidenceScore,
        matchedFields,
        mismatchedFields,
      },
      biometricMatch,
      trackingId,
      verificationHash,
      timestamp,
      isSimulated: true,
      authority: "National Identity Management Commission (NIMC)",
      statutoryAct: "NIMC Act No. 23 of 2007 (Mandatory Use of the National Identification Number)",
    };
  }
}

export const nimcGatewayClient = new NimcGatewayClient();
