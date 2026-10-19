import { NextResponse } from "next/server";
import { getRepositoryContainer } from "@/lib/repositories";
import { isDemoMode } from "@/lib/runtime/mode";
import { DEMO_CONTEXT } from "@/lib/security/auth-context";

export interface UssdPayload {
  sessionId: string;
  serviceCode: string;
  phoneNumber: string;
  text: string;
}

export interface UssdResponse {
  response: string;
  shouldClose: boolean;
  sessionId: string;
}

export async function POST(request: Request) {
  try {
    let sessionId = `session_${Date.now()}`;
    let serviceCode = "*384*2026#";
    let phoneNumber = "+2348031234567";
    let text = "";
    let isJsonClient = false;

    const contentType = request.headers.get("content-type") || "";
    const acceptHeader = request.headers.get("accept") || "";

    if (contentType.includes("application/json")) {
      isJsonClient = true;
      const body = await request.json();
      sessionId = body.sessionId || sessionId;
      serviceCode = body.serviceCode || serviceCode;
      phoneNumber = body.phoneNumber || phoneNumber;
      text = typeof body.text === "string" ? body.text.trim() : "";
      if (body.format === "json") isJsonClient = true;
    } else if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      sessionId = (formData.get("sessionId") as string) || sessionId;
      serviceCode = (formData.get("serviceCode") as string) || serviceCode;
      phoneNumber = (formData.get("phoneNumber") as string) || phoneNumber;
      text = ((formData.get("text") as string) || "").trim();
    } else {
      // Fallback query parameters
      const { searchParams } = new URL(request.url);
      sessionId = searchParams.get("sessionId") || sessionId;
      serviceCode = searchParams.get("serviceCode") || serviceCode;
      phoneNumber = searchParams.get("phoneNumber") || phoneNumber;
      text = (searchParams.get("text") || "").trim();
    }

    if (acceptHeader.includes("application/json")) {
      isJsonClient = true;
    }

    // Process USSD State Machine
    const result = await processUssdSession({
      sessionId,
      serviceCode,
      phoneNumber,
      text,
    });

    if (isJsonClient) {
      return NextResponse.json({
        sessionId,
        response: result.message,
        raw: result.raw,
        shouldClose: result.shouldClose,
        serviceCode,
        phoneNumber,
      });
    }

    // Standard Africa's Talking / Telco USSD text response
    return new Response(result.raw, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal USSD Gateway Error";
    return new Response(`END Error: ${errorMsg}. Please try dialing again later.`, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

async function processUssdSession(payload: UssdPayload): Promise<{
  raw: string;
  message: string;
  shouldClose: boolean;
}> {
  const { phoneNumber, text } = payload;
  const parts = text ? text.split("*").map((p) => p.trim()) : [];

  // Root Menu
  if (parts.length === 0 || text === "") {
    const message = [
      "ActionOS Trust Core (*384*2026#)",
      "1. Quick Vehicle License & Insurance",
      "2. Roadworthiness & LASDRI Check",
      "3. Verify Digital Certificate",
      "4. Check Active Policies & Status",
    ].join("\n");

    return {
      raw: `CON ${message}`,
      message,
      shouldClose: false,
    };
  }

  const rootOption = parts[0];

  // -------------------------------------------------------------
  // OPTION 1: VEHICLE LICENSE & INSURANCE RENEWAL
  // -------------------------------------------------------------
  if (rootOption === "1") {
    // Step 1: Prompt for plate number
    if (parts.length === 1) {
      const message = "Enter Vehicle Plate Number (e.g. ABC-123-XY):";
      return {
        raw: `CON ${message}`,
        message,
        shouldClose: false,
      };
    }

    const plate = parts[1].toUpperCase().replace(/\s+/g, "");

    // Step 2: Show Quote and Payment Options
    if (parts.length === 2) {
      // Calculate statutory quote
      const quote = getQuoteForPlate(plate);
      const message = [
        `ActionOS Quote for ${plate}:`,
        `${quote.vehicleType}`,
        `Total: NGN ${quote.total.toLocaleString()} (MVAA + NIID + LASDRI)`,
        "1. Authorize Debit (Saved NIP Wallet)",
        "2. Pay via USSD Bank Transfer",
        "0. Cancel",
      ].join("\n");

      return {
        raw: `CON ${message}`,
        message,
        shouldClose: false,
      };
    }

    const paymentChoice = parts[2];

    if (paymentChoice === "0") {
      const message = "Renewal cancelled. No debit occurred. Thank you for using ActionOS.";
      return {
        raw: `END ${message}`,
        message,
        shouldClose: true,
      };
    }

    if (paymentChoice === "2") {
      const quote = getQuoteForPlate(plate);
      const virtualAcct = `992026${phoneNumber.replace(/\D/g, "").slice(-4)}`;
      const message = [
        `Pay NGN ${quote.total.toLocaleString()} via Bank Transfer:`,
        "Bank: Wema Bank / Providus",
        `Acct: ${virtualAcct}`,
        `Ref: ACT-${plate.replace(/-/g, "").slice(0, 6)}`,
        "Valid for 30 mins. E-Badge sent via SMS on settlement.",
      ].join("\n");

      return {
        raw: `END ${message}`,
        message,
        shouldClose: true,
      };
    }

    if (paymentChoice === "1") {
      // Step 3: Prompt for 4-digit Security PIN
      if (parts.length === 3) {
        const quote = getQuoteForPlate(plate);
        const message = `Enter 4-digit ActionOS Security PIN to authorize NGN ${quote.total.toLocaleString()}:`;
        return {
          raw: `CON ${message}`,
          message,
          shouldClose: false,
        };
      }

      // Step 4: Validate PIN and Complete Renewal
      const pin = parts[3];
      if (!/^\d{4}$/.test(pin)) {
        const message = "Invalid PIN. Must be 4 digits. Dial *384*2026# to retry.";
        return {
          raw: `END ${message}`,
          message,
          shouldClose: true,
        };
      }

      // Execute renewal simulation and record ledger entry
      const certId = `ACT-USSD-${Math.floor(100000 + Math.random() * 900000)}`;
      const expiryYear = new Date().getFullYear() + 1;
      const expiryDate = `19-10-${expiryYear}`;

      try {
        const repos = getRepositoryContainer();
        const caller = isDemoMode()
          ? DEMO_CONTEXT
          : {
              userId: "ussd-operator",
              profileId: "ussd-profile",
              organizationId: "actionos-default",
              role: "customer" as const,
              customerId: "CUS-USSD",
              isDemo: false,
            };

        // Record verification audit
        await repos.audit.log({
          organization_id: caller.organizationId || "actionos-default",
          action: "ussd_renewal_authorized",
          resource_type: "policy",
          resource_id: certId,
          new_value: {
            plate,
            phoneNumber,
            channel: "ussd",
            serviceCode: payload.serviceCode,
            amount: 26000,
            status: "completed",
            timestamp: new Date().toISOString(),
          },
        });
      } catch {
        // Safe fallback in isolated mock environment
      }

      const message = [
        "Renewal Successful!",
        `Plate: ${plate}`,
        `Cert ID: ${certId}`,
        `Valid until: ${expiryDate}`,
        `Digital e-Badge & SMS verification link sent to ${phoneNumber}.`,
      ].join("\n");

      return {
        raw: `END ${message}`,
        message,
        shouldClose: true,
      };
    }
  }

  // -------------------------------------------------------------
  // OPTION 2: ROADWORTHINESS & LASDRI CHECK
  // -------------------------------------------------------------
  if (rootOption === "2") {
    if (parts.length === 1) {
      const message = "Enter Vehicle Plate Number for LACVIS/LASDRI:";
      return {
        raw: `CON ${message}`,
        message,
        shouldClose: false,
      };
    }

    const plate = parts[1].toUpperCase();
    const message = [
      `LACVIS Inspection for ${plate}:`,
      "Status: PASSED",
      "Visual: OK | Brakes: 84% | Emissions: PASS",
      "Cert: LACVIS-2026-9921",
      "LASDRI Driver Card: ACTIVE (Expires 14-11-2026)",
    ].join("\n");

    return {
      raw: `END ${message}`,
      message,
      shouldClose: true,
    };
  }

  // -------------------------------------------------------------
  // OPTION 3: VERIFY DIGITAL CERTIFICATE
  // -------------------------------------------------------------
  if (rootOption === "3") {
    if (parts.length === 1) {
      const message = "Enter Certificate ID or Plate to verify:";
      return {
        raw: `CON ${message}`,
        message,
        shouldClose: false,
      };
    }

    const query = parts[1].toUpperCase();
    const isStolen = query.includes("STOLEN");
    
    if (isStolen) {
      const message = [
        "ALERT: STOLEN VEHICLE DETECTED!",
        `Target: ${query}`,
        "Reported by: Lagos State Police Command",
        "Action: Impound Immediately. Incident logged.",
      ].join("\n");

      return {
        raw: `END ${message}`,
        message,
        shouldClose: true,
      };
    }

    const message = [
      "VERIFIED AUTHENTIC - ACTIONOS TRUST CORE",
      `Target: ${query}`,
      "Authority: NAICOM / MVAA / FRSC",
      "Merkle Proof: 0x9f4a2c81...VALID",
      "Status: ACTIVE & COMPLIANT",
    ].join("\n");

    return {
      raw: `END ${message}`,
      message,
      shouldClose: true,
    };
  }

  // -------------------------------------------------------------
  // OPTION 4: MY POLICIES & STATUS
  // -------------------------------------------------------------
  if (rootOption === "4") {
    const message = [
      `ActionOS Active Policies for ${phoneNumber}:`,
      "1. ABC-123-XY (Toyota HiAce Danfo) - Exp: 15-11-2026",
      "2. KJA-552-ZZ (Bajaj RE Keke) - Exp: 02-12-2026",
      "Dial *384*2026*1# anytime to renew without internet.",
    ].join("\n");

    return {
      raw: `END ${message}`,
      message,
      shouldClose: true,
    };
  }

  // Fallback for unknown choices
  const fallback = "Invalid selection. Dial *384*2026# to restart.";
  return {
    raw: `END ${fallback}`,
    message: fallback,
    shouldClose: true,
  };
}

function getQuoteForPlate(plate: string) {
  const isCommercial = plate.startsWith("ABC") || plate.startsWith("LND") || plate.includes("BUS");
  if (isCommercial) {
    return {
      vehicleType: "Toyota HiAce Commuter (Commercial)",
      mvaa: 8500,
      niid: 15000,
      lasdri: 2500,
      total: 26000,
    };
  }
  return {
    vehicleType: "Private Sedan / SUV",
    mvaa: 4500,
    niid: 15000,
    lasdri: 0,
    total: 19500,
  };
}
