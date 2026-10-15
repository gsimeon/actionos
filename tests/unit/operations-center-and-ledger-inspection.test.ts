import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getRepositoryContainer } from "@/lib/repositories";
import { resetStore } from "@/lib/actionos/mock-store";
import { GET as getLedger } from "@/app/api/ledger/route";
import { GET as getReconcile, POST as postReconcile } from "@/app/api/recovery/reconcile/route";
import {
  signLedgerEvent,
  verifyLedgerIntegrity,
  GENESIS_LEDGER_HASH,
} from "@/lib/actionos/crypto-ledger";
import type { ActionLedgerEvent } from "@/types/actionos";

const DEMO_TENANT = {
  organizationId: "a0000000-0000-0000-0000-000000000001",
  customerId: "f0000000-0000-0000-0000-000000000001",
  role: "manager" as const,
};

describe("Sprint 2: Operations Center & Cryptographic Ledger Inspection", () => {
  beforeEach(() => {
    resetStore();
  });

  describe("ILedgerRepository.getAllEvents", () => {
    it("should retrieve all ledger events sorted chronologically descending", async () => {
      const repos = getRepositoryContainer();
      const events = await repos.ledger.getAllEvents(DEMO_TENANT);

      assert.ok(Array.isArray(events), "getAllEvents must return an array");
      assert.ok(events.length >= 2, "Expected seeded demo ledger events");

      // Verify descending sort by timestamp
      for (let i = 0; i < events.length - 1; i++) {
        const t1 = new Date(events[i].timestamp).getTime();
        const t2 = new Date(events[i + 1].timestamp).getTime();
        assert.ok(t1 >= t2, "Events must be ordered descending by timestamp");
      }
    });

    it("should support query options for session, actor, and status filtering", async () => {
      const repos = getRepositoryContainer();
      const gatewayEvents = await repos.ledger.getAllEvents(DEMO_TENANT, {
        actor: "Payment Gateway",
      });

      assert.ok(gatewayEvents.length > 0, "Expected at least one gateway event");
      for (const ev of gatewayEvents) {
        assert.equal(ev.actor, "Payment Gateway");
      }
    });

    it("should support filtering by compensating Saga reversals", async () => {
      const repos = getRepositoryContainer();
      const compensatingEvents = await repos.ledger.getAllEvents(DEMO_TENANT, {
        isCompensating: true,
      });

      assert.ok(compensatingEvents.length >= 1, "Expected at least one compensating reversal event");
      for (const ev of compensatingEvents) {
        assert.equal(ev.isCompensating, true);
      }
    });

    it("should respect limit option", async () => {
      const repos = getRepositoryContainer();
      const singleEvent = await repos.ledger.getAllEvents(DEMO_TENANT, { limit: 1 });
      assert.equal(singleEvent.length, 1);
    });
  });

  describe("GET /api/ledger Endpoint", () => {
    it("should return ledger events with verified cryptographic integrity", async () => {
      const req = new Request("http://localhost:3000/api/ledger?verify=true", {
        headers: {
          "x-organization-id": DEMO_TENANT.organizationId,
          "x-customer-id": DEMO_TENANT.customerId,
          "x-role": DEMO_TENANT.role,
        },
      });

      const res = await getLedger(req);
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.equal(json.success, true);
      assert.ok(Array.isArray(json.data.events));
      assert.ok(json.data.total >= 2);
      assert.ok(json.data.integrity !== undefined);
      assert.equal(json.data.integrity.chainValid, true);
      assert.equal(json.data.integrity.signaturesValid, true);
    });

    it("should filter by sessionId via query parameters", async () => {
      const req = new Request(
        "http://localhost:3000/api/ledger?sessionId=act_recon_gateway_001",
        {
          headers: {
            "x-organization-id": DEMO_TENANT.organizationId,
            "x-customer-id": DEMO_TENANT.customerId,
            "x-role": DEMO_TENANT.role,
          },
        }
      );

      const res = await getLedger(req);
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.equal(json.success, true);
      for (const ev of json.data.events) {
        assert.equal(ev.sessionId, "act_recon_gateway_001");
      }
    });

    it("should filter by free-text search across descriptions and actions", async () => {
      const req = new Request(
        "http://localhost:3000/api/ledger?search=Paystack",
        {
          headers: {
            "x-organization-id": DEMO_TENANT.organizationId,
            "x-customer-id": DEMO_TENANT.customerId,
            "x-role": DEMO_TENANT.role,
          },
        }
      );

      const res = await getLedger(req);
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.equal(json.success, true);
      assert.ok(json.data.events.length > 0);
      for (const ev of json.data.events) {
        const matches =
          ev.description?.toLowerCase().includes("paystack") ||
          ev.action?.toLowerCase().includes("paystack") ||
          ev.actor?.toLowerCase().includes("paystack");
        assert.ok(matches, "Every returned event must match search query");
      }
    });
  });

  describe("GET and POST /api/recovery/reconcile Endpoint", () => {
    it("should return pending reconciliation queue with retryable and deadLettered counts", async () => {
      const req = new Request("http://localhost:3000/api/recovery/reconcile", {
        headers: {
          "x-organization-id": DEMO_TENANT.organizationId,
          "x-customer-id": DEMO_TENANT.customerId,
          "x-role": DEMO_TENANT.role,
        },
      });

      const res = await getReconcile(req);
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.equal(json.success, true);
      assert.ok(json.data.totalPending >= 1);
      assert.ok(Array.isArray(json.data.retryQueue));
      assert.ok(Array.isArray(json.data.deadLetterQueue));
    });

    it("should execute background sweep via POST /api/recovery/reconcile", async () => {
      const req = new Request("http://localhost:3000/api/recovery/reconcile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": DEMO_TENANT.organizationId,
          "x-customer-id": DEMO_TENANT.customerId,
          "x-role": DEMO_TENANT.role,
        },
        body: JSON.stringify({ limit: 10, force: true }),
      });

      const res = await postReconcile(req);
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.equal(json.success, true);
      assert.ok(json.data.totalScanned !== undefined);
      assert.ok(json.data.executedAt !== undefined);
      assert.ok(Array.isArray(json.data.results));
    });

    it("should execute single session reconciliation via POST /api/recovery/reconcile", async () => {
      const req = new Request("http://localhost:3000/api/recovery/reconcile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": DEMO_TENANT.organizationId,
          "x-customer-id": DEMO_TENANT.customerId,
          "x-role": DEMO_TENANT.role,
        },
        body: JSON.stringify({ sessionId: "act_recon_gateway_001", force: true }),
      });

      const res = await postReconcile(req);
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.ok(json.data.sessionId === "act_recon_gateway_001");
      assert.ok(json.data.outcome !== undefined);
    });
  });

  describe("Cryptographic Merkle Chaining & Non-Repudiation Invariants", () => {
    it("should verify valid sequential ledger events", () => {
      const ev1 = signLedgerEvent(
        {
          id: "ev_test_001",
          sessionId: "act_test_001",
          sequenceNumber: 1,
          timestamp: "2026-10-15T10:00:00.000Z",
          action: "intent_detection",
          description: "Customer requested motor insurance renewal",
          status: "verified",
          actor: "User",
        },
        GENESIS_LEDGER_HASH
      );

      const ev2 = signLedgerEvent(
        {
          id: "ev_test_002",
          sessionId: "act_test_001",
          sequenceNumber: 2,
          timestamp: "2026-10-15T10:00:01.000Z",
          action: "payment_settlement",
          description: "Settled ₦87,500 via Paystack Gateway",
          status: "verified",
          actor: "Payment Gateway",
        },
        ev1.hash
      );

      const result = verifyLedgerIntegrity([ev1, ev2], { verifySignatures: true });
      assert.equal(result.valid, true);
    });

    it("should detect historical tampering in the event chain", () => {
      const ev1 = signLedgerEvent(
        {
          id: "ev_test_tamper_001",
          sessionId: "act_test_tamper",
          sequenceNumber: 1,
          timestamp: "2026-10-15T10:00:00.000Z",
          action: "payment_initiation",
          description: "Authorized ₦87,500",
          status: "verified",
          actor: "User",
        },
        GENESIS_LEDGER_HASH
      );

      const ev2 = signLedgerEvent(
        {
          id: "ev_test_tamper_002",
          sessionId: "act_test_tamper",
          sequenceNumber: 2,
          timestamp: "2026-10-15T10:00:02.000Z",
          action: "payment_settlement",
          description: "Settled ₦87,500",
          status: "verified",
          actor: "Payment Gateway",
        },
        ev1.hash
      );

      // Maliciously modify ev1's description without recomputing cryptographic signature
      const tamperedEv1: ActionLedgerEvent = {
        ...ev1,
        description: "Maliciously modified: Authorized ₦10,000",
      };

      const result = verifyLedgerIntegrity([tamperedEv1, ev2], { verifySignatures: true });
      assert.equal(result.valid, false, "Tampered chain must be detected as invalid");
      assert.ok(result.reason !== undefined);
    });
  });
});
