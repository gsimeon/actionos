import crypto from "node:crypto";
import { isProductionMode } from "@/lib/runtime/mode";

export interface FrscPlateVerificationResult {
  plate: string;
  found: boolean;
  make?: string;
  model?: string;
  year?: number;
  color?: string;
  chassisNumber?: string;
  vin?: string;
  engineNumber?: string;
  ownerName?: string;
  registrationState?: string;
  licenseExpiry?: string;
  theftFlag: boolean;
  isSimulated: boolean;
  authority: string;
  timestamp: string;
}

export interface FrscDriverLicenseVerificationResult {
  dlNumber: string;
  valid: boolean;
  holderName?: string;
  dateOfBirth?: string;
  classOfVehicle?: string;
  expiryDate?: string;
  stateOfIssue?: string;
  isSimulated: boolean;
  authority: string;
}

export class FrscGatewayError extends Error {
  constructor(
    public readonly code:
      | "FRSC_CONFIGURATION_ERROR"
      | "FRSC_INVALID_PLATE_FORMAT"
      | "FRSC_INVALID_DL_FORMAT"
      | "FRSC_PLATE_NOT_FOUND"
      | "FRSC_DL_NOT_FOUND"
      | "FRSC_THEFT_FLAG_ALERT"
      | "FRSC_NETWORK_ERROR"
      | "FRSC_API_ERROR",
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "FrscGatewayError";
  }
}

/**
 * Standard Nigerian vehicle license plate pattern:
 * e.g. ABC-123-XY, KJA-821-AA, LAG-440-BD, ABC123XY
 */
export const NIGERIAN_PLATE_REGEX = /^[A-Z]{2,3}-?\d{2,3}-?[A-Z]{2}$/i;

/**
 * Standard Nigerian Driver's License pattern:
 * Alphanumeric 8 to 16 characters (e.g. ABC12345678, KJA987654321A)
 */
export const NIGERIAN_DL_REGEX = /^[A-Z]{2,3}[A-Z0-9]{6,14}$/i;

/**
 * Normalizes vehicle license plate strings into the standard AAA-123-AA format
 */
export function normalizePlateNumber(plate: string): string {
  const cleaned = plate.trim().toUpperCase().replace(/[\s_.]+/g, "-");
  const unhyphenated = cleaned.replace(/-/g, "");
  const match = unhyphenated.match(/^([A-Z]{2,3})(\d{2,3})([A-Z]{2})$/i);
  if (match) {
    return `${match[1].toUpperCase()}-${match[2]}-${match[3].toUpperCase()}`;
  }
  return cleaned;
}

export const SANDBOX_STOLEN_PLATES = new Set([
  "STOLEN-999-XX",
  "THFT-404-NG",
  "WNTD-000-PO",
  "STL-999-XX",
]);

/**
 * Validates a vehicle license plate number against standard Nigerian regulatory formats
 */
export function validatePlateNumber(plate: string): {
  valid: boolean;
  error?: string;
  normalized?: string;
} {
  if (!plate || typeof plate !== "string" || !plate.trim()) {
    return { valid: false, error: "Plate number cannot be empty." };
  }
  const normalized = normalizePlateNumber(plate);
  // Permit recognized sandbox test fixture plates in demo/test environments
  if (
    SANDBOX_STOLEN_PLATES.has(normalized) ||
    normalized.startsWith("STOLEN-") ||
    normalized === "NOT-404-NF" ||
    normalized.startsWith("NOT-FOUND") ||
    normalized.startsWith("FAIL-")
  ) {
    return { valid: true, normalized };
  }

  if (!NIGERIAN_PLATE_REGEX.test(normalized)) {
    return {
      valid: false,
      error: `Invalid Nigerian plate format '${plate}'. Expected format like 'ABC-123-XY' or 'KJA-821-AA'.`,
      normalized,
    };
  }
  return { valid: true, normalized };
}

/**
 * Normalizes driver's license numbers by removing whitespace and converting to uppercase
 */
export function normalizeDriverLicense(dl: string): string {
  return dl.trim().toUpperCase().replace(/[\s-]+/g, "");
}

/**
 * Validates a driver's license number format
 */
export function validateDriverLicense(dl: string): {
  valid: boolean;
  error?: string;
  normalized?: string;
} {
  if (!dl || typeof dl !== "string" || !dl.trim()) {
    return { valid: false, error: "Driver's license number cannot be empty." };
  }
  const normalized = normalizeDriverLicense(dl);
  if (!NIGERIAN_DL_REGEX.test(normalized)) {
    return {
      valid: false,
      error: `Invalid Driver's License format '${dl}'. Expected alphanumeric format between 8 and 16 characters.`,
      normalized,
    };
  }
  return { valid: true, normalized };
}

export class FrscGatewayClient {
  private apiUrl: string;
  private apiKey: string;
  private clientId: string;

  constructor(options?: { apiUrl?: string; apiKey?: string; clientId?: string }) {
    this.apiUrl =
      options?.apiUrl ||
      process.env.FRSC_API_BASE_URL ||
      process.env.FRSC_API_URL ||
      "https://nvis.frsc.gov.ng/api/v1";
    this.apiKey = options?.apiKey || process.env.FRSC_API_KEY || "";
    this.clientId = options?.clientId || process.env.FRSC_CLIENT_ID || "";
  }

  /**
   * Authoritative lookup against FRSC National Vehicle Identification System (NVIS)
   */
  async verifyPlate(plateNumber: string): Promise<FrscPlateVerificationResult> {
    const val = validatePlateNumber(plateNumber);
    if (!val.valid || !val.normalized) {
      throw new FrscGatewayError("FRSC_INVALID_PLATE_FORMAT", val.error || "Invalid plate format");
    }

    const normalizedPlate = val.normalized;
    const inProduction = isProductionMode();
    const hasLiveCredentials = Boolean(
      this.apiKey &&
      this.apiKey.trim() &&
      this.apiKey !== "demo-key" &&
      this.apiUrl &&
      !this.apiUrl.includes("demo")
    );

    // Fail-closed invariant in production mode:
    // If running in production mode, credentials are required and network errors fail closed.
    if (inProduction) {
      if (!hasLiveCredentials) {
        throw new FrscGatewayError(
          "FRSC_CONFIGURATION_ERROR",
          "Production mode error: FRSC_API_KEY must be configured with valid production credentials."
        );
      }

      try {
        const response = await fetch(
          `${this.apiUrl}/plates/verify/${encodeURIComponent(normalizedPlate)}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              "X-Client-Id": this.clientId,
              Accept: "application/json",
            },
          }
        );

        if (!response.ok) {
          if (response.status === 404) {
            return {
              plate: normalizedPlate,
              found: false,
              theftFlag: false,
              isSimulated: false,
              authority:
                "Federal Road Safety Corps (FRSC) National Vehicle Identification System",
              timestamp: new Date().toISOString(),
            };
          }
          if (response.status === 401 || response.status === 403) {
            throw new FrscGatewayError(
              "FRSC_CONFIGURATION_ERROR",
              "FRSC NVIS API authentication failed: invalid credentials or unauthorized client."
            );
          }
          throw new FrscGatewayError(
            "FRSC_API_ERROR",
            `FRSC NVIS gateway returned HTTP ${response.status}: ${response.statusText}`
          );
        }

        const json = await response.json();
        const data = json.data;

        return {
          plate: normalizedPlate,
          found: true,
          make: data.make,
          model: data.model,
          year: data.year ? Number(data.year) : undefined,
          color: data.color,
          chassisNumber: data.chassisNumber || data.vin,
          vin: data.vin || data.chassisNumber,
          engineNumber: data.engineNumber,
          ownerName: data.ownerName,
          registrationState: data.state || "Lagos",
          licenseExpiry: data.licenseExpiry,
          theftFlag: Boolean(data.theftFlag),
          isSimulated: false,
          authority:
            "Federal Road Safety Corps (FRSC) National Vehicle Identification System",
          timestamp: new Date().toISOString(),
        };
      } catch (err: unknown) {
        if (err instanceof FrscGatewayError) {
          throw err;
        }
        throw new FrscGatewayError(
          "FRSC_NETWORK_ERROR",
          `FRSC NVIS live query failed: ${err instanceof Error ? err.message : "Network error"}`,
          err
        );
      }
    }

    // Demo / Sandbox Simulation Fixtures
    if (normalizedPlate === "NOT-404-NF" || normalizedPlate.startsWith("NOT-FOUND")) {
      return {
        plate: normalizedPlate,
        found: false,
        theftFlag: false,
        isSimulated: true,
        authority:
          "ActionOS Regulatory Simulation Sandbox (Simulated FRSC NVIS Gateway)",
        timestamp: new Date().toISOString(),
      };
    }

    const isStolen = SANDBOX_STOLEN_PLATES.has(normalizedPlate);
    const isBenchmarkCamry = normalizedPlate === "ABC-123-XY";
    const digest = crypto.createHash("sha256").update(normalizedPlate).digest("hex");

    return {
      plate: normalizedPlate,
      found: true,
      make: isBenchmarkCamry ? "Toyota" : "Honda",
      model: isBenchmarkCamry ? "Camry" : "Accord",
      year: isBenchmarkCamry ? 2022 : 2021,
      color: isBenchmarkCamry ? "Midnight Black" : "Silver Metallic",
      chassisNumber: isBenchmarkCamry
        ? "DEMO-VIN-000001"
        : `CHASSIS-${digest.slice(0, 10).toUpperCase()}`,
      vin: isBenchmarkCamry ? "DEMO-VIN-000001" : `VIN-${digest.slice(0, 10).toUpperCase()}`,
      engineNumber: isBenchmarkCamry
        ? "DEMO-ENGINE-000001"
        : `ENGINE-${digest.slice(10, 18).toUpperCase()}`,
      ownerName: isBenchmarkCamry ? "Demo Customer" : "Registered Vehicle Owner",
      registrationState: "Lagos",
      licenseExpiry: isBenchmarkCamry ? "2026-10-14" : "2026-11-20",
      theftFlag: isStolen,
      isSimulated: true,
      authority:
        "ActionOS Regulatory Simulation Sandbox (Simulated FRSC NVIS Gateway)",
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Authoritative lookup against FRSC National Driver's License scheme
   */
  async verifyDriverLicense(
    dlNumber: string,
    dateOfBirth?: string
  ): Promise<FrscDriverLicenseVerificationResult> {
    const val = validateDriverLicense(dlNumber);
    if (!val.valid || !val.normalized) {
      throw new FrscGatewayError(
        "FRSC_INVALID_DL_FORMAT",
        val.error || "Invalid Driver's License format"
      );
    }

    const rawTrimmed = dlNumber.trim().toUpperCase();
    const cleanDl = val.normalized;
    const inProduction = isProductionMode();
    const hasLiveCredentials = Boolean(
      this.apiKey &&
      this.apiKey.trim() &&
      this.apiKey !== "demo-key" &&
      this.apiUrl &&
      !this.apiUrl.includes("demo")
    );

    // Fail-closed invariant in production mode
    if (inProduction) {
      if (!hasLiveCredentials) {
        throw new FrscGatewayError(
          "FRSC_CONFIGURATION_ERROR",
          "Production mode error: FRSC_API_KEY must be configured with valid production credentials."
        );
      }

      try {
        const response = await fetch(`${this.apiUrl}/drivers-license/verify`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            licenseNumber: cleanDl,
            dob: dateOfBirth,
          }),
        });

        if (!response.ok) {
          if (response.status === 404) {
            return {
              dlNumber: rawTrimmed,
              valid: false,
              isSimulated: false,
              authority:
                "Federal Road Safety Corps (FRSC) National Driver License Registry",
            };
          }
          if (response.status === 401 || response.status === 403) {
            throw new FrscGatewayError(
              "FRSC_CONFIGURATION_ERROR",
              "FRSC Driver License API authentication failed: invalid credentials."
            );
          }
          throw new FrscGatewayError(
            "FRSC_API_ERROR",
            `FRSC Driver License gateway returned HTTP ${response.status}: ${response.statusText}`
          );
        }

        const json = await response.json();
        const data = json.data;

        return {
          dlNumber: rawTrimmed,
          valid: true,
          holderName: data.fullName,
          dateOfBirth: data.dob,
          classOfVehicle: data.class,
          expiryDate: data.expiryDate,
          stateOfIssue: data.state,
          isSimulated: false,
          authority:
            "Federal Road Safety Corps (FRSC) National Driver License Registry",
        };
      } catch (err: unknown) {
        if (err instanceof FrscGatewayError) {
          throw err;
        }
        throw new FrscGatewayError(
          "FRSC_NETWORK_ERROR",
          `FRSC Driver License live query failed: ${err instanceof Error ? err.message : "Network error"}`,
          err
        );
      }
    }

    // Demo / Sandbox Mode
    const isRevoked = cleanDl.includes("REVOKED") || cleanDl.includes("INVALID");

    return {
      dlNumber: rawTrimmed,
      valid: !isRevoked,
      holderName: "Demo Customer",
      dateOfBirth: dateOfBirth || "1988-06-15",
      classOfVehicle: "Class E (Private & Light Commercial)",
      expiryDate: "2028-06-15",
      stateOfIssue: "Lagos",
      isSimulated: true,
      authority:
        "ActionOS Simulation Sandbox (Simulated FRSC Registry)",
    };
  }
}

export const frscGateway = new FrscGatewayClient();
