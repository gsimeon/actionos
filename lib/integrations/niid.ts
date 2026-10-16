import crypto from "node:crypto";
import { isProductionMode } from "@/lib/runtime/mode";
import { normalizePlateNumber, validatePlateNumber } from "./frsc";

export interface NiidPolicyVerificationResult {
  found: boolean;
  verified: boolean;
  policyNumber?: string;
  vehiclePlate: string;
  chassisNumber: string;
  engineNumber: string;
  underwriterName?: string;
  underwriterId?: string;
  insuredName?: string;
  policyType?: "comprehensive" | "third_party" | "commercial";
  coverageStartDate?: string;
  coverageEndDate?: string;
  activePolicy: boolean;
  daysUntilExpiry?: number;
  eStickerNumber?: string;
  naicomPolicyUid?: string;
  preclearanceToken: string;
  isSimulated: boolean;
  registryAuthority: string;
  statutoryNotice: string;
  timestamp: string;
}

export interface NiidCertificateRegistrationRequest {
  policyNumber: string;
  vehiclePlate: string;
  chassisNumber: string;
  engineNumber?: string;
  customerName: string;
  underwriterId: string;
  underwriterName: string;
  policyType?: "comprehensive" | "third_party" | "commercial";
  coverageStartDate: string;
  coverageEndDate: string;
  premiumPaid: number;
  currency?: string;
}

export interface NiidCertificateRegistrationResult {
  success: boolean;
  registrationNumber: string;
  eStickerNumber: string;
  naicomPolicyUid: string;
  verificationHash: string;
  qrVerificationUrl: string;
  registeredAt: string;
  isSimulated: boolean;
  authority: string;
  statutoryNotice: string;
}

export class NiidGatewayError extends Error {
  constructor(
    public readonly code:
      | "NIID_CONFIGURATION_ERROR"
      | "NIID_INVALID_INPUT"
      | "NIID_POLICY_NOT_FOUND"
      | "NIID_ACTIVE_POLICY_CONFLICT"
      | "NIID_NETWORK_ERROR"
      | "NIID_API_ERROR"
      | "NIID_REGISTRATION_FAILED",
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "NiidGatewayError";
  }
}

export class NiidGatewayClient {
  private apiUrl: string;
  private apiKey: string;
  private insurerCode: string;

  constructor(options?: { apiUrl?: string; apiKey?: string; insurerCode?: string }) {
    this.apiUrl =
      options?.apiUrl ||
      process.env.NIID_API_BASE_URL ||
      process.env.NIID_API_URL ||
      "https://niid.nigeriainsurers.org/api/v2";
    this.apiKey = options?.apiKey || process.env.NIID_API_KEY || "";
    this.insurerCode = options?.insurerCode || process.env.NIID_INSURER_CODE || "NIA-INS-042";
  }

  /**
   * Authoritative lookup of vehicle insurance coverage on Nigerian Insurance Industry Database (NIID)
   */
  async verifyPolicy(query: {
    plateNumber?: string;
    chassisNumber?: string;
    policyNumber?: string;
  }): Promise<NiidPolicyVerificationResult> {
    const rawPlate = (query.plateNumber || "").trim();
    const rawChassis = (query.chassisNumber || "").trim().toUpperCase();
    const rawPolicy = (query.policyNumber || "").trim().toUpperCase();

    if (!rawPlate && !rawChassis && !rawPolicy) {
      throw new NiidGatewayError(
        "NIID_INVALID_INPUT",
        "At least one lookup parameter (plateNumber, chassisNumber, or policyNumber) must be provided."
      );
    }

    let normalizedPlate = rawPlate;
    if (rawPlate) {
      const plateValidation = validatePlateNumber(rawPlate);
      if (!plateValidation.valid) {
        throw new NiidGatewayError(
          "NIID_INVALID_INPUT",
          plateValidation.error || `Invalid vehicle plate number format: '${rawPlate}'`
        );
      }
      normalizedPlate = plateValidation.normalized || normalizePlateNumber(rawPlate);
    }

    // Fail-closed production mode guardrail
    if (isProductionMode()) {
      if (!this.apiKey) {
        throw new NiidGatewayError(
          "NIID_CONFIGURATION_ERROR",
          "Production mode requires NIID_API_KEY for statutory insurance verification against Nigerian Insurance Industry Database. Zero silent fallback permitted."
        );
      }

      try {
        const response = await fetch(`${this.apiUrl}/policies/verify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
            "X-Insurer-Code": this.insurerCode,
            "User-Agent": "ActionOS-NIID-Gateway/1.0",
          },
          body: JSON.stringify({
            plateNumber: normalizedPlate || undefined,
            chassisNumber: rawChassis || undefined,
            policyNumber: rawPolicy || undefined,
          }),
          signal: AbortSignal.timeout(6000),
        });

        if (!response.ok) {
          const errBody = await response.text().catch(() => "");
          throw new NiidGatewayError(
            "NIID_API_ERROR",
            `NIID Central Portal HTTP error ${response.status}: ${errBody || response.statusText}`
          );
        }

        const data = await response.json();
        return this.mapProductionPolicyResponse(data, normalizedPlate, rawChassis);
      } catch (err: unknown) {
        if (err instanceof NiidGatewayError) throw err;
        throw new NiidGatewayError(
          "NIID_NETWORK_ERROR",
          `Failed to reach NIID Central Portal at ${this.apiUrl}: ${err instanceof Error ? err.message : String(err)}`,
          err
        );
      }
    }

    // Sandbox / Simulation Fixtures
    return this.resolveSandboxPolicy(normalizedPlate, rawChassis, rawPolicy);
  }

  /**
   * Registers a newly issued or renewed insurance certificate on the NIID central registry
   */
  async registerCertificate(
    request: NiidCertificateRegistrationRequest
  ): Promise<NiidCertificateRegistrationResult> {
    if (!request.policyNumber || !request.vehiclePlate || !request.chassisNumber || !request.underwriterId) {
      throw new NiidGatewayError(
        "NIID_INVALID_INPUT",
        "policyNumber, vehiclePlate, chassisNumber, and underwriterId are mandatory for NIID certificate registration."
      );
    }

    const plateValidation = validatePlateNumber(request.vehiclePlate);
    if (!plateValidation.valid) {
      throw new NiidGatewayError(
        "NIID_INVALID_INPUT",
        plateValidation.error || `Invalid vehicle plate number format: '${request.vehiclePlate}'`
      );
    }
    const normalizedPlate = plateValidation.normalized || normalizePlateNumber(request.vehiclePlate);

    if (isProductionMode()) {
      if (!this.apiKey) {
        throw new NiidGatewayError(
          "NIID_CONFIGURATION_ERROR",
          "Production mode requires NIID_API_KEY for statutory certificate upload and e-sticker issuance. Zero silent fallback permitted."
        );
      }

      try {
        const response = await fetch(`${this.apiUrl}/certificates/register`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
            "X-Insurer-Code": this.insurerCode,
            "User-Agent": "ActionOS-NIID-Gateway/1.0",
          },
          body: JSON.stringify({
            ...request,
            vehiclePlate: normalizedPlate,
          }),
          signal: AbortSignal.timeout(6000),
        });

        if (!response.ok) {
          const errBody = await response.text().catch(() => "");
          throw new NiidGatewayError(
            "NIID_REGISTRATION_FAILED",
            `NIID Certificate Registration failed with HTTP ${response.status}: ${errBody || response.statusText}`
          );
        }

        const data = await response.json();
        return {
          success: true,
          registrationNumber: data.registrationNumber,
          eStickerNumber: data.eStickerNumber,
          naicomPolicyUid: data.naicomPolicyUid,
          verificationHash: data.verificationHash,
          qrVerificationUrl: data.qrVerificationUrl,
          registeredAt: data.registeredAt || new Date().toISOString(),
          isSimulated: false,
          authority: "Nigerian Insurance Industry Database (NIID) & NAICOM Central Portal",
          statutoryNotice: "STATUTORY DOCUMENT: Registered on the National Insurance Commission (NAICOM) portal.",
        };
      } catch (err: unknown) {
        if (err instanceof NiidGatewayError) throw err;
        throw new NiidGatewayError(
          "NIID_NETWORK_ERROR",
          `Failed to transmit certificate to NIID Central Portal: ${err instanceof Error ? err.message : String(err)}`,
          err
        );
      }
    }

    // Sandbox / Simulation Certificate Registration
    const year = new Date().getFullYear();
    const digest = crypto
      .createHash("sha256")
      .update(`${request.policyNumber}:${normalizedPlate}:${request.chassisNumber}:${request.premiumPaid}`)
      .digest("hex");

    const eStickerNumber = `NAICOM-STK-${year}-${digest.slice(0, 8).toUpperCase()}`;
    const naicomPolicyUid = `NAICOM-UID-${digest.slice(8, 16).toUpperCase()}`;
    const registrationNumber = `NIID-REG-${year}-${digest.slice(16, 24).toUpperCase()}`;

    return {
      success: true,
      registrationNumber,
      eStickerNumber,
      naicomPolicyUid,
      verificationHash: digest,
      qrVerificationUrl: `https://niid.nigeriainsurers.org/verify?policy=${encodeURIComponent(request.policyNumber)}&sticker=${encodeURIComponent(eStickerNumber)}`,
      registeredAt: new Date().toISOString(),
      isSimulated: true,
      authority: "ActionOS Regulatory Simulation Sandbox (NIID / NAICOM Portal)",
      statutoryNotice: "DEMO SIMULATION: Non-statutory sandbox certificate registration for demonstration and testing.",
    };
  }

  private mapProductionPolicyResponse(
    data: Record<string, unknown>,
    plate: string,
    chassis: string
  ): NiidPolicyVerificationResult {
    return {
      found: Boolean(data.found),
      verified: Boolean(data.verified),
      policyNumber: (data.policyNumber as string) || undefined,
      vehiclePlate: (data.vehiclePlate as string) || plate,
      chassisNumber: (data.chassisNumber as string) || chassis,
      engineNumber: (data.engineNumber as string) || "UNKNOWN",
      underwriterName: (data.underwriterName as string) || undefined,
      underwriterId: (data.underwriterId as string) || undefined,
      insuredName: (data.insuredName as string) || undefined,
      policyType: (data.policyType as "comprehensive" | "third_party" | "commercial") || "third_party",
      coverageStartDate: (data.coverageStartDate as string) || undefined,
      coverageEndDate: (data.coverageEndDate as string) || undefined,
      activePolicy: Boolean(data.activePolicy),
      daysUntilExpiry: typeof data.daysUntilExpiry === "number" ? data.daysUntilExpiry : undefined,
      eStickerNumber: (data.eStickerNumber as string) || undefined,
      naicomPolicyUid: (data.naicomPolicyUid as string) || undefined,
      preclearanceToken: (data.preclearanceToken as string) || `NIID-STATUTORY-${Date.now()}`,
      isSimulated: false,
      registryAuthority: "Nigerian Insurance Industry Database (NIID) Central Portal",
      statutoryNotice: "STATUTORY VERIFICATION: Verified against official Nigerian Insurance Industry Database (NIID).",
      timestamp: new Date().toISOString(),
    };
  }

  private resolveSandboxPolicy(
    plate: string,
    chassis: string,
    policy: string
  ): NiidPolicyVerificationResult {
    const year = new Date().getFullYear();
    const digest = crypto
      .createHash("sha256")
      .update(`${plate || policy || chassis}:NIID-SANDBOX`)
      .digest("hex")
      .slice(0, 8)
      .toUpperCase();

    const timestamp = new Date().toISOString();
    const preclearanceToken = `NIID-SANDBOX-${year}-${digest}`;
    const authority = "ActionOS Regulatory Simulation Sandbox (Non-Statutory NIID Test Registry)";
    const statutoryNotice =
      "DEMO SIMULATION: Pre-clearance verified against local sandbox data. Does not query live NAICOM/NIID servers.";

    // Unregistered / Not-Found fixture
    if (plate === "NOT-404-NF" || plate.startsWith("NOT-FOUND") || policy === "NOT-FOUND") {
      return {
        found: false,
        verified: false,
        vehiclePlate: plate,
        chassisNumber: chassis || `CHASSIS-${digest}`,
        engineNumber: `ENG-${digest}`,
        activePolicy: false,
        preclearanceToken,
        isSimulated: true,
        registryAuthority: authority,
        statutoryNotice,
        timestamp,
      };
    }

    // Active Policy Conflict fixture (e.g. policy not yet up for renewal)
    if (plate === "ACTIVE-999-OK" || plate.startsWith("ACTIVE-") || policy.startsWith("POL-ACTIVE")) {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 240); // 8 months remaining
      return {
        found: true,
        verified: true,
        policyNumber: policy || `POL-ACT-ACTIVE-${digest}`,
        vehiclePlate: plate,
        chassisNumber: chassis || `VIN-ACTIVE-${digest}`,
        engineNumber: `ENG-ACTIVE-${digest}`,
        underwriterName: "AIICO Insurance Plc",
        underwriterId: "aiico",
        insuredName: "Dr. Ngozi Eze",
        policyType: "comprehensive",
        coverageStartDate: new Date(Date.now() - 120 * 86400000).toISOString().split("T")[0],
        coverageEndDate: futureDate.toISOString().split("T")[0],
        activePolicy: true,
        daysUntilExpiry: 240,
        eStickerNumber: `NAICOM-STK-${year}-ACT-${digest}`,
        naicomPolicyUid: `NAICOM-UID-ACT-${digest}`,
        preclearanceToken,
        isSimulated: true,
        registryAuthority: authority,
        statutoryNotice,
        timestamp,
      };
    }

    // Benchmark Toyota Camry fixture (ABC-123-XY) expiring soon / eligible for renewal
    return {
      found: true,
      verified: true,
      policyNumber: policy || "AUTO-2026-00182",
      vehiclePlate: plate || "ABC-123-XY",
      chassisNumber: chassis || "DEMO-VIN-000001",
      engineNumber: `ENGINE-${digest.slice(0, 6)}`,
      underwriterName: "Leadway Assurance Company Limited",
      underwriterId: "leadway",
      insuredName: "Chief Babatunde Adeleke",
      policyType: "comprehensive",
      coverageStartDate: "2025-10-14",
      coverageEndDate: "2026-10-14",
      activePolicy: false, // Expired or in renewal window
      daysUntilExpiry: 0,
      eStickerNumber: `NAICOM-STK-2025-${digest}`,
      naicomPolicyUid: `NAICOM-UID-2025-${digest}`,
      preclearanceToken,
      isSimulated: true,
      registryAuthority: authority,
      statutoryNotice,
      timestamp,
    };
  }
}

export const niidGateway = new NiidGatewayClient();
