import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetStore } from "@/lib/actionos/mock-store";
import { getRepositoryContainer, resetRepositoryContainer } from "@/lib/repositories";
import { GET as getTransactions } from "@/app/api/transactions/route";
import { GET as getDocuments } from "@/app/api/documents/route";
import { GET as getSingleDocument } from "@/app/api/documents/[id]/route";
import { GET as getNotifications, POST as postNotification } from "@/app/api/notifications/route";

describe("Live Data Unification: Repositories & API Endpoints", () => {
  beforeEach(() => {
    resetStore();
    resetRepositoryContainer();
  });

  describe("DemoTransactionRepository findAll & findById", () => {
    it("should retrieve transactions and support status and limit filtering", async () => {
      const repos = getRepositoryContainer();
      const customerId = "f0000000-0000-0000-0000-000000000001";

      await repos.transactions.create({
        customer_id: customerId,
        amount: 87500,
        currency: "NGN",
        reference: "ref_succ_01",
        status: "succeeded",
      });

      await repos.transactions.create({
        customer_id: customerId,
        amount: 50000,
        currency: "NGN",
        reference: "ref_pend_01",
        status: "pending",
      });

      const all = await repos.transactions.findAll();
      assert.ok(all.length >= 2);

      const succeededOnly = await repos.transactions.findAll({ status: "succeeded" });
      assert.ok(succeededOnly.every((t) => t.status === "succeeded"));
      assert.ok(succeededOnly.some((t) => t.reference === "ref_succ_01"));
      assert.ok(!succeededOnly.some((t) => t.reference === "ref_pend_01"));

      const limited = await repos.transactions.findAll({ limit: 1 });
      assert.equal(limited.length, 1);
    });

    it("should enforce tenant boundaries on transactions", async () => {
      const repos = getRepositoryContainer();
      const orgA = "a0000000-0000-0000-0000-000000000001";
      const orgB = "b0000000-0000-0000-0000-000000000002";
      const customerA = "f0000000-0000-0000-0000-000000000001"; // belongs to Org A

      const txA = await repos.transactions.create({
        customer_id: customerA,
        amount: 87500,
        currency: "NGN",
        reference: "ref_tenant_a",
        status: "succeeded",
      });

      // Tenant Org A can see it
      const foundA = await repos.transactions.findById(txA.id, { organizationId: orgA });
      assert.ok(foundA);
      assert.equal(foundA?.id, txA.id);

      // Tenant Org B CANNOT see it
      const foundB = await repos.transactions.findById(txA.id, { organizationId: orgB });
      assert.equal(foundB, null);

      // Listing from Org B returns empty
      const listB = await repos.transactions.findAll({ tenant: { organizationId: orgB } });
      assert.ok(!listB.some((t) => t.id === txA.id));
    });
  });

  describe("DemoDocumentRepository findAll & findById", () => {
    it("should retrieve documents and filter by documentType and renewalId", async () => {
      const repos = getRepositoryContainer();
      const customerId = "f0000000-0000-0000-0000-000000000001";
      const renewalId = "ren_12345";

      const cert = await repos.documents.create({
        customer_id: customerId,
        renewal_id: renewalId,
        document_type: "certificate",
        file_path: "/certs/cert_1.pdf",
        file_name: "cert_1.pdf",
      });

      const receipt = await repos.documents.create({
        customer_id: customerId,
        renewal_id: renewalId,
        document_type: "receipt",
        file_path: "/receipts/rec_1.pdf",
        file_name: "rec_1.pdf",
      });

      const all = await repos.documents.findAll();
      assert.ok(all.some((d) => d.id === cert.id));
      assert.ok(all.some((d) => d.id === receipt.id));

      const certsOnly = await repos.documents.findAll({ documentType: "certificate" });
      assert.ok(certsOnly.every((d) => d.document_type === "certificate"));
      assert.ok(certsOnly.some((d) => d.id === cert.id));
      assert.ok(!certsOnly.some((d) => d.id === receipt.id));

      const byRenewal = await repos.documents.findAll({ renewalId });
      assert.equal(byRenewal.length, 2);

      const single = await repos.documents.findById(cert.id);
      assert.ok(single);
      assert.equal(single?.file_name, "cert_1.pdf");
    });

    it("should enforce tenant boundaries on documents", async () => {
      const repos = getRepositoryContainer();
      const orgA = "a0000000-0000-0000-0000-000000000001";
      const orgB = "b0000000-0000-0000-0000-000000000002";
      const customerA = "f0000000-0000-0000-0000-000000000001";

      const doc = await repos.documents.create({
        customer_id: customerA,
        document_type: "certificate",
        file_path: "/certs/cert_tenant.pdf",
        file_name: "cert_tenant.pdf",
      });

      const foundA = await repos.documents.findById(doc.id, { organizationId: orgA });
      assert.ok(foundA);

      const foundB = await repos.documents.findById(doc.id, { organizationId: orgB });
      assert.equal(foundB, null);
    });
  });

  describe("DemoNotificationRepository findAll & findById", () => {
    it("should retrieve notifications and filter by channel", async () => {
      const repos = getRepositoryContainer();
      const customerId = "f0000000-0000-0000-0000-000000000001";

      const sms = await repos.notifications.create({
        customer_id: customerId,
        type: "certificate_issued",
        channel: "sms",
        title: "SMS Title",
        message: "SMS Body",
        scheduled_for: new Date().toISOString(),
      });

      const email = await repos.notifications.create({
        customer_id: customerId,
        type: "certificate_issued",
        channel: "email",
        title: "Email Title",
        message: "Email Body",
        scheduled_for: new Date().toISOString(),
      });

      const all = await repos.notifications.findAll();
      assert.ok(all.some((n) => n.id === sms.id));
      assert.ok(all.some((n) => n.id === email.id));

      const smsOnly = await repos.notifications.findAll({ channel: "sms" });
      assert.ok(smsOnly.every((n) => n.channel === "sms"));
      assert.ok(smsOnly.some((n) => n.id === sms.id));
      assert.ok(!smsOnly.some((n) => n.id === email.id));

      const single = await repos.notifications.findById(sms.id);
      assert.ok(single);
      assert.equal(single?.title, "SMS Title");
    });
  });

  describe("HTTP API Routes (/api/transactions, /api/documents, /api/notifications)", () => {
    it("GET /api/transactions should return status 200 with list of transactions", async () => {
      const repos = getRepositoryContainer();
      const customerId = "f0000000-0000-0000-0000-000000000001";
      await repos.transactions.create({
        customer_id: customerId,
        amount: 87500,
        currency: "NGN",
        reference: "ref_http_tx_1",
        status: "succeeded",
      });

      const req = new Request("http://localhost:3000/api/transactions");
      const res = await getTransactions(req);
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.equal(json.success, true);
      assert.ok(Array.isArray(json.data));
      assert.ok(json.data.some((t: { reference: string }) => t.reference === "ref_http_tx_1"));
    });

    it("GET /api/documents should return status 200 and filter by type", async () => {
      const repos = getRepositoryContainer();
      const customerId = "f0000000-0000-0000-0000-000000000001";
      await repos.documents.create({
        customer_id: customerId,
        document_type: "certificate",
        file_path: "/certs/http_doc.pdf",
        file_name: "http_doc.pdf",
      });

      const req = new Request("http://localhost:3000/api/documents?type=certificate");
      const res = await getDocuments(req);
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.equal(json.success, true);
      assert.ok(Array.isArray(json.data));
      assert.ok(json.data.some((d: { file_name: string }) => d.file_name === "http_doc.pdf"));
    });

    it("GET /api/documents/[id] should return 200 for valid doc and 404 for missing", async () => {
      const repos = getRepositoryContainer();
      const customerId = "f0000000-0000-0000-0000-000000000001";
      const doc = await repos.documents.create({
        customer_id: customerId,
        document_type: "receipt",
        file_path: "/receipts/doc_single.pdf",
        file_name: "doc_single.pdf",
      });

      const reqFound = new Request(`http://localhost:3000/api/documents/${doc.id}`);
      const resFound = await getSingleDocument(reqFound, { params: Promise.resolve({ id: doc.id }) });
      assert.equal(resFound.status, 200);
      const jsonFound = await resFound.json();
      assert.equal(jsonFound.success, true);
      assert.equal(jsonFound.data.id, doc.id);

      const reqMissing = new Request("http://localhost:3000/api/documents/non_existent_id");
      const resMissing = await getSingleDocument(reqMissing, { params: Promise.resolve({ id: "non_existent_id" }) });
      assert.equal(resMissing.status, 404);
    });

    it("GET & POST /api/notifications should list and dispatch live notifications", async () => {
      // POST new notification
      const postReq = new Request("http://localhost:3000/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: "whatsapp",
          type: "certificate_issued",
          title: "WhatsApp Test Alert",
          message: "Certificate generated successfully.",
        }),
      });

      const postRes = await postNotification(postReq);
      assert.equal(postRes.status, 200);
      const postJson = await postRes.json();
      assert.equal(postJson.success, true);
      assert.equal(postJson.data.channel, "whatsapp");
      assert.equal(postJson.data.title, "WhatsApp Test Alert");

      // GET notifications filtered by channel
      const getReq = new Request("http://localhost:3000/api/notifications?channel=whatsapp");
      const getRes = await getNotifications(getReq);
      assert.equal(getRes.status, 200);
      const getJson = await getRes.json();
      assert.equal(getJson.success, true);
      assert.ok(getJson.data.some((n: { title: string }) => n.title === "WhatsApp Test Alert"));
    });
  });
});
