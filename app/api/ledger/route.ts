import { NextResponse } from "next/server";
import { getRepositoryContainer } from "@/lib/repositories";
import { resolveExecutionContext, AuthContextError } from "@/lib/security/auth-context";
import { verifyLedgerIntegrity } from "@/lib/actionos/crypto-ledger";
import type { ActionLedgerEvent } from "@/types/actionos";

const BENCHMARK_EVENTS: ActionLedgerEvent[] = [
  {
    id: "ev_001_intent",
    sessionId: "act_benchmark_camry_001",
    timestamp: "2026-10-08T20:00:01.120Z",
    action: "intent_detection",
    description: "Input received via web: 'My car insurance expires next week. Check it and renew it for me.'",
    status: "verified",
    actor: "User",
    tool: "n_atlas_multilingual_parser",
    hash: "a1c7f4281352e8d99c43831885994f1c1f5139049a463ad258416d231b48901a",
    previousHash: "0000000000000000000000000000000000000000000000000000000000000000",
    signature: "hmac_sha256_sig_genesis_001_valid",
  },
  {
    id: "ev_002_customer",
    sessionId: "act_benchmark_camry_001",
    timestamp: "2026-10-08T20:00:01.350Z",
    action: "customer_lookup",
    description: "Retrieved customer Demo Customer (CUS-000001) in tenant a0000000-0000-0000-0000-000000000001",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "get_customer",
    hash: "b2d8e5392463f9e00d54942996005e2d2e6240150b574be369527e342c59012b",
    previousHash: "a1c7f4281352e8d99c43831885994f1c1f5139049a463ad258416d231b48901a",
    signature: "hmac_sha256_sig_cust_002_valid",
  },
  {
    id: "ev_003_policy",
    sessionId: "act_benchmark_camry_001",
    timestamp: "2026-10-08T20:00:01.580Z",
    action: "policy_lookup",
    description: "Retrieved policy AUTO-2026-00182 for Toyota Camry (ABC-123-XY). Expiration: 2026-10-14",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "get_policy",
    hash: "c3e9f64035740af11e65053007116f3e3f7351261c685cf470638f453d60123c",
    previousHash: "b2d8e5392463f9e00d54942996005e2d2e6240150b574be369527e342c59012b",
    signature: "hmac_sha256_sig_pol_003_valid",
  },
  {
    id: "ev_004_niid",
    sessionId: "act_benchmark_camry_001",
    timestamp: "2026-10-08T20:00:01.810Z",
    action: "regulatory_verification",
    description: "Statutory FRSC & NIID database query verified plate ABC-123-XY legitimacy with Leadway Assurance",
    status: "verified",
    actor: "Policy Guardrail",
    tool: "verify_niid_statutory",
    hash: "d4fa075146851ba22f7616411822704f408462372d796da5817490564e71234d",
    previousHash: "c3e9f64035740af11e65053007116f3e3f7351261c685cf470638f453d60123c",
    signature: "hmac_sha256_sig_niid_004_valid",
  },
  {
    id: "ev_005_quote",
    sessionId: "act_benchmark_camry_001",
    timestamp: "2026-10-08T20:00:02.040Z",
    action: "underwriting_quote",
    description: "Marketplace underwriting quote generated from Leadway Assurance for ₦87,500 NGN (Comprehensive Motor)",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "generate_renewal_quote",
    hash: "e5ab186257962cb33f8727522933815f519573483e8a7eb6928501675f82345e",
    previousHash: "d4fa075146851ba22f7616411822704f408462372d796da5817490564e71234d",
    signature: "hmac_sha256_sig_quote_005_valid",
  },
  {
    id: "ev_006_consent",
    sessionId: "act_benchmark_camry_001",
    timestamp: "2026-10-08T20:00:05.400Z",
    action: "authorization_gate",
    description: "Explicit customer consent granted via web dialog for quote ₦87,500 under Leadway Assurance",
    status: "verified",
    actor: "User",
    tool: "require_explicit_confirmation",
    hash: "f6bc297368a73dc44a9838633a44926a62a684594f9b8fc7a39612786a93456f",
    previousHash: "e5ab186257962cb33f8727522933815f519573483e8a7eb6928501675f82345e",
    signature: "hmac_sha256_sig_gate_006_valid",
  },
  {
    id: "ev_007_payment",
    sessionId: "act_benchmark_camry_001",
    timestamp: "2026-10-08T20:00:07.150Z",
    action: "payment_settled",
    description: "₦87,500 NGN debited via Paystack Gateway rail (Ref: pay_demo_20261008200007)",
    status: "verified",
    actor: "Payment Gateway",
    tool: "request_payment",
    hash: "07cd3a8479b84ed55ba949744b55a37b73b7956a50ac9ad8b40723897ba45670",
    previousHash: "f6bc297368a73dc44a9838633a44926a62a684594f9b8fc7a39612786a93456f",
    signature: "hmac_sha256_sig_pay_007_valid",
  },
  {
    id: "ev_008_renewal",
    sessionId: "act_benchmark_camry_001",
    timestamp: "2026-10-08T20:00:08.920Z",
    action: "policy_extended",
    description: "Policy AUTO-2026-00182 expiration rolled forward 365 days to 2027-10-14 under Leadway Assurance",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "renew_policy",
    hash: "18de4b958ac95fe66cb050855c66b48c84c8a67b61bdabe9c518349a8cb56781",
    previousHash: "07cd3a8479b84ed55ba949744b55a37b73b7956a50ac9ad8b40723897ba45670",
    signature: "hmac_sha256_sig_renew_008_valid",
  },
  {
    id: "ev_009_certificate",
    sessionId: "act_benchmark_camry_001",
    timestamp: "2026-10-08T20:00:10.110Z",
    action: "certificate_issued",
    description: "Official NAICOM statutory certificate generated: NAICOM-CERT-2026-00182 with QR verification",
    status: "verified",
    actor: "Policy Guardrail",
    tool: "generate_certificate",
    hash: "29ef5ca69bd060f77dc161966d77c59d95d9b78c72cebcf0d62945ab9dc67892",
    previousHash: "18de4b958ac95fe66cb050855c66b48c84c8a67b61bdabe9c518349a8cb56781",
    signature: "hmac_sha256_sig_cert_009_valid",
  },
  {
    id: "ev_010_notification",
    sessionId: "act_benchmark_camry_001",
    timestamp: "2026-10-08T20:00:11.450Z",
    action: "statutory_dispatch",
    description: "SMS and Email dispatched to +234 800 000 0001 / demo.customer@actionos.ng with NAICOM certificate",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "send_notification",
    hash: "3af06db7ace171088ed272a77e88d60ea6eac89d83dfcdf1e73056bcaed78903",
    previousHash: "29ef5ca69bd060f77dc161966d77c59d95d9b78c72cebcf0d62945ab9dc67892",
    signature: "hmac_sha256_sig_notif_010_valid",
  },
];

export async function GET(req: Request) {
  try {
    const authContext = await resolveExecutionContext(req);
    const tenantContext = {
      organizationId: authContext.organizationId,
      customerId: authContext.customerId,
      role: authContext.role,
    };

    const url = new URL(req.url);
    const sessionId = url.searchParams.get("sessionId");
    const actor = url.searchParams.get("actor");
    const status = url.searchParams.get("status");
    const isCompensatingStr = url.searchParams.get("isCompensating");
    const search = url.searchParams.get("search")?.toLowerCase().trim();
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 100)));
    const verifyChain = url.searchParams.get("verify") === "true";

    const repos = getRepositoryContainer();
    let events: ActionLedgerEvent[] = [];

    if (sessionId) {
      events = await repos.ledger.getEventsBySessionId(sessionId, tenantContext);
    } else {
      events = await repos.ledger.getAllEvents(tenantContext, { limit: 200 });
    }

    // In demo mode, if database has no events for this session/tenant, merge benchmark events
    if (events.length === 0 && authContext.isDemo) {
      events = [...BENCHMARK_EVENTS];
    }

    // Filter by actor
    if (actor && actor !== "all") {
      events = events.filter((e) => e.actor.toLowerCase() === actor.toLowerCase());
    }

    // Filter by status
    if (status && status !== "all") {
      events = events.filter((e) => e.status.toLowerCase() === status.toLowerCase());
    }

    // Filter by compensating
    if (isCompensatingStr !== null && isCompensatingStr !== undefined && isCompensatingStr !== "all") {
      const isComp = isCompensatingStr === "true";
      events = events.filter((e) => Boolean(e.isCompensating) === isComp);
    }

    // Free text search
    if (search) {
      events = events.filter((e) =>
        e.description.toLowerCase().includes(search) ||
        e.action.toLowerCase().includes(search) ||
        (e.tool && e.tool.toLowerCase().includes(search)) ||
        (e.sessionId && e.sessionId.toLowerCase().includes(search)) ||
        (e.referenceId && e.referenceId.toLowerCase().includes(search))
      );
    }

    // Apply limit
    const total = events.length;
    events = events.slice(0, limit);

    // Cryptographic chain integrity check
    let integrity = {
      checked: false,
      valid: true,
      chainValid: true,
      signaturesValid: true,
      reason: undefined as string | undefined,
      algorithm: "Ed25519 & SHA-256 Hash Chaining",
      count: events.length,
    };

    if (verifyChain && events.length > 0) {
      if (sessionId) {
        const sorted = [...events].sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));
        const verifyRes = verifyLedgerIntegrity(sorted, { verifySignatures: true });
        integrity = {
          checked: true,
          valid: verifyRes.valid,
          chainValid: verifyRes.valid,
          signaturesValid: verifyRes.valid,
          reason: verifyRes.reason,
          algorithm: "Ed25519 & SHA-256 Hash Chaining",
          count: events.length,
        };
      } else {
        const bySession: Record<string, ActionLedgerEvent[]> = {};
        for (const ev of events) {
          const sid = ev.sessionId || "default";
          if (!bySession[sid]) bySession[sid] = [];
          bySession[sid].push(ev);
        }
        let allValid = true;
        let chainValid = true;
        let signaturesValid = true;
        let failureReason: string | undefined;

        for (const [sid, sessEvs] of Object.entries(bySession)) {
          const sorted = [...sessEvs].sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));
          const res = verifyLedgerIntegrity(sorted, { verifySignatures: true });
          if (!res.valid) {
            allValid = false;
            chainValid = false;
            signaturesValid = false;
            failureReason = `Session ${sid}: ${res.reason}`;
            break;
          }
        }

        integrity = {
          checked: true,
          valid: allValid,
          chainValid,
          signaturesValid,
          reason: failureReason,
          algorithm: "Ed25519 & SHA-256 Hash Chaining",
          count: events.length,
        };
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        events,
        total,
        integrity,
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthContextError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.code === "UNAUTHORIZED" ? 401 : 403 }
      );
    }
    const message = error instanceof Error ? error.message : "Failed to load ledger events";
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "LEDGER_QUERY_FAILED",
          message,
        },
      },
      { status: 500 }
    );
  }
}
