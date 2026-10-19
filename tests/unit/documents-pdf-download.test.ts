import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { generateStatutoryPdf, extractPdfMetadata } from "@/lib/documents/pdf-generator";
import { GET as downloadRoute } from "@/app/api/documents/[id]/download/route";
import type { Document } from "@/types/database";

describe("Statutory Document PDF Generation & Download Suite", () => {
  const motorDoc: Document = {
    id: "doc_test_motor_001",
    customer_id: "c0000000-0000-0000-0000-000000000001",
    renewal_id: "ren_demo_motor_001",
    document_type: "certificate",
    file_name: "NIID_Insurance_Certificate_NAICOM-2026-00812.pdf",
    file_path: "/documents/insurance/NIID_Insurance_Certificate_NAICOM-2026-00812.pdf",
    mime_type: "application/pdf",
    status: "generated",
    created_at: new Date().toISOString(),
    ...({
      metadata: {
        assetName: "Toyota Camry 2.5L",
        assetIdentifier: "ABC-123-XY",
        underwriter: "Leadway Assurance Company Limited",
        statutoryAuthority: "National Insurance Commission (NAICOM)",
        policyNumber: "AUTO-2026-00182",
        eStickerNumber: "NAICOM-STK-2026-00812",
        amount: 87500,
        expiryDate: "2027-10-14",
        verificationHash: "a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0",
        qrVerificationUrl: "https://niid.nigeriainsurers.org/verify?cert=NAICOM-2026-00812",
      },
    } as unknown as Record<string, unknown>),
  };

  test("extractPdfMetadata accurately classifies NAICOM motor insurance certificate", () => {
    const meta = extractPdfMetadata(motorDoc);
    assert.match(meta.authority, /NAICOM/i);
    assert.equal(meta.assetIdentifier, "ABC-123-XY");
    assert.equal(meta.policyNumber, "AUTO-2026-00182");
    assert.equal(meta.certificateNumber, "NAICOM-STK-2026-00812");
    assert.equal(meta.amountFormatted, "NGN 87,500");
    assert.ok(meta.verificationHash.length >= 32);
  });

  test("extractPdfMetadata accurately classifies MVAA vehicle license", () => {
    const mvaaDoc: Document = {
      ...motorDoc,
      file_name: "Vehicle_License_MVAA-LAG-2026-99182.pdf",
    };
    const meta = extractPdfMetadata(mvaaDoc);
    assert.match(meta.authority, /MVAA/i);
    assert.match(meta.documentTitle, /MOTOR VEHICLE LICENSE/i);
  });

  test("extractPdfMetadata accurately classifies NHIA Health HMO enrollee card", () => {
    const hmoDoc: Document = {
      ...motorDoc,
      file_name: "NHIA_HMO_Card_NHIA-00829104.pdf",
    };
    const meta = extractPdfMetadata(hmoDoc);
    assert.match(meta.authority, /NATIONAL HEALTH INSURANCE AUTHORITY/i);
    assert.match(meta.documentTitle, /HEALTH INSURANCE/i);
  });

  test("extractPdfMetadata accurately classifies FRSC driver's permit", () => {
    const frscDoc: Document = {
      ...motorDoc,
      file_name: "FRSC_Permit_FRSC-TMP-2026-91823.pdf",
    };
    const meta = extractPdfMetadata(frscDoc);
    assert.match(meta.authority, /FEDERAL ROAD SAFETY CORPS/i);
    assert.match(meta.documentTitle, /DRIVER'S PERMIT/i);
  });

  test("generateStatutoryPdf generates valid PDF-1.4 binary structure", () => {
    const pdfBytes = generateStatutoryPdf(motorDoc);
    assert.ok(pdfBytes instanceof Uint8Array);
    assert.ok(pdfBytes.byteLength > 500, "PDF should have substantial byte content");

    const pdfString = Buffer.from(pdfBytes).toString("utf8");
    assert.ok(pdfString.startsWith("%PDF-1.4"), "Must start with %PDF-1.4 magic bytes");
    assert.ok(pdfString.includes("%%EOF"), "Must terminate with %%EOF");
    assert.ok(pdfString.includes("/Type /Catalog"), "Must contain PDF Catalog");
    assert.ok(pdfString.includes("/Type /Pages"), "Must contain PDF Pages dictionary");
    assert.ok(pdfString.includes("xref"), "Must contain xref table");
    assert.ok(pdfString.includes("ABC-123-XY"), "Must contain vehicle plate in stream");
    assert.ok(pdfString.includes("AUTO-2026-00182"), "Must contain policy number in stream");
  });

  test("GET /api/documents/[id]/download serves benchmark document as PDF stream", async () => {
    const req = new Request("http://localhost:3000/api/documents/doc_niid_2026_001/download");
    const res = await downloadRoute(req, {
      params: Promise.resolve({ id: "doc_niid_2026_001" }),
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Content-Type"), "application/pdf");
    assert.match(res.headers.get("Content-Disposition") || "", /attachment; filename=".*\.pdf"/);
    const body = await res.arrayBuffer();
    assert.ok(body.byteLength > 500);

    const magic = Buffer.from(body.slice(0, 8)).toString("utf8");
    assert.ok(magic.startsWith("%PDF-1.4"));
  });

  test("GET /api/documents/[id]/download supports inline viewing", async () => {
    const req = new Request("http://localhost:3000/api/documents/doc_niid_2026_001/download?inline=true");
    const res = await downloadRoute(req, {
      params: Promise.resolve({ id: "doc_niid_2026_001" }),
    });

    assert.equal(res.status, 200);
    assert.match(res.headers.get("Content-Disposition") || "", /inline; filename=".*\.pdf"/);
  });

  test("GET /api/documents/[id]/download supports JSON format inspection", async () => {
    const req = new Request("http://localhost:3000/api/documents/doc_niid_2026_001/download?format=json");
    const res = await downloadRoute(req, {
      params: Promise.resolve({ id: "doc_niid_2026_001" }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as { success: boolean; data: Document };
    assert.equal(json.success, true);
    assert.equal(json.data.id, "doc_niid_2026_001");
  });

  test("GET /api/documents/[id]/download returns 404 for unknown document", async () => {
    const req = new Request("http://localhost:3000/api/documents/non_existent_doc_id/download");
    const res = await downloadRoute(req, {
      params: Promise.resolve({ id: "non_existent_doc_id" }),
    });

    assert.equal(res.status, 404);
    const json = (await res.json()) as { success: boolean; error: { code: string } };
    assert.equal(json.success, false);
    assert.equal(json.error.code, "NOT_FOUND");
  });
});
