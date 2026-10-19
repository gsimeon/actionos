import { NextResponse } from "next/server";
import { getRepositoryContainer } from "@/lib/repositories";
import { generateStatutoryPdf } from "@/lib/documents/pdf-generator";
import type { Document } from "@/types/database";

// In-memory benchmark fallback fixtures for dashboard demonstration
const BENCHMARK_FIXTURES: Record<string, Document> = {
  doc_niid_2026_001: {
    id: "doc_niid_2026_001",
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
  },
  doc_mvaa_2026_002: {
    id: "doc_mvaa_2026_002",
    customer_id: "c0000000-0000-0000-0000-000000000001",
    renewal_id: "ren_demo_veh_002",
    document_type: "certificate",
    file_name: "Vehicle_License_MVAA-LAG-2026-99182.pdf",
    file_path: "/documents/vehicles/Vehicle_License_MVAA-LAG-2026-99182.pdf",
    mime_type: "application/pdf",
    status: "generated",
    created_at: new Date().toISOString(),
    ...({
      metadata: {
        assetName: "Toyota Camry 2.5L",
        assetIdentifier: "ABC-123-XY",
        underwriter: "Lagos State Motor Vehicle Administration Agency (MVAA)",
        statutoryAuthority: "Lagos State MVAA & LACVIS",
        policyNumber: "MVAA-LAG-2026-99182",
        mvaaLicenseNumber: "MVAA-LAG-2026-99182",
        roadworthinessNumber: "LACVIS-ABC123XY",
        amount: 24550,
        expiryDate: "2027-10-14",
        verificationHash: "b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef01",
        qrVerificationUrl: "https://mvaa.lagosstate.gov.ng/verify?license=MVAA-LAG-2026-99182",
      },
    } as unknown as Record<string, unknown>),
  },
  doc_nhia_2026_003: {
    id: "doc_nhia_2026_003",
    customer_id: "c0000000-0000-0000-0000-000000000001",
    renewal_id: null,
    document_type: "certificate",
    file_name: "NHIA_HMO_Card_NHIA-00829104.pdf",
    file_path: "/documents/health/NHIA_HMO_Card_NHIA-00829104.pdf",
    mime_type: "application/pdf",
    status: "generated",
    created_at: new Date().toISOString(),
    ...({
      metadata: {
        assetName: "Hygeia HMO Platinum Enrollee Cover",
        assetIdentifier: "NHIA-00829104",
        underwriter: "Hygeia HMO & National Health Insurance Authority",
        statutoryAuthority: "National Health Insurance Authority (NHIA)",
        policyNumber: "NHIA-00829104",
        amount: 145000,
        expiryDate: "2027-10-14",
        verificationHash: "c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef012",
        qrVerificationUrl: "https://nhia.gov.ng/verify-enrollee?nhia=NHIA-00829104",
      },
    } as unknown as Record<string, unknown>),
  },
  doc_frsc_2026_004: {
    id: "doc_frsc_2026_004",
    customer_id: "c0000000-0000-0000-0000-000000000001",
    renewal_id: null,
    document_type: "certificate",
    file_name: "FRSC_Permit_FRSC-TMP-2026-91823.pdf",
    file_path: "/documents/licensing/FRSC_Permit_FRSC-TMP-2026-91823.pdf",
    mime_type: "application/pdf",
    status: "generated",
    created_at: new Date().toISOString(),
    ...({
      metadata: {
        assetName: "National Driver's License (Class B)",
        assetIdentifier: "FRSC-LA-2024-009182",
        underwriter: "Federal Road Safety Corps (FRSC)",
        statutoryAuthority: "Federal Road Safety Corps (FRSC)",
        policyNumber: "FRSC-TMP-2026-91823",
        temporaryPermitNumber: "FRSC-TMP-2026-91823",
        amount: 15450,
        expiryDate: "2031-10-14",
        verificationHash: "d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0123",
        qrVerificationUrl: "https://frsc.gov.ng/verify-permit?permit=FRSC-TMP-2026-91823",
      },
    } as unknown as Record<string, unknown>),
  },
  doc_receipt_2026_005: {
    id: "doc_receipt_2026_005",
    customer_id: "c0000000-0000-0000-0000-000000000001",
    renewal_id: "ren_demo_motor_001",
    document_type: "receipt",
    file_name: "Payment_Receipt_PAY-REF-2026-88192.pdf",
    file_path: "/documents/receipts/Receipt_PAY_87500_AUTO_00182.pdf",
    mime_type: "application/pdf",
    status: "generated",
    created_at: new Date().toISOString(),
    ...({
      metadata: {
        assetName: "Motor Insurance Renewal Settlement",
        assetIdentifier: "PAY-REF-2026-88192",
        underwriter: "Paystack Gateway Rail",
        statutoryAuthority: "Central Bank of Nigeria (CBN) Licensed Rail",
        policyNumber: "AUTO-2026-00182",
        amount: 87500,
        expiryDate: "2027-10-14",
        verificationHash: "e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef01234",
        qrVerificationUrl: "https://checkout.paystack.com/receipt/PAY-REF-2026-88192",
      },
    } as unknown as Record<string, unknown>),
  },
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { resolveExecutionContext, DEMO_CONTEXT } = await import("@/lib/security/auth-context");
    const { isDemoMode } = await import("@/lib/runtime/mode");

    let context;
    try {
      context = await resolveExecutionContext(req);
    } catch {
      if (isDemoMode()) {
        context = DEMO_CONTEXT;
      } else {
        return NextResponse.json(
          { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
          { status: 401 }
        );
      }
    }

    const { id } = await params;
    const repos = getRepositoryContainer();

    const tenant = {
      organizationId: context.organizationId,
      customerId: context.customerId,
      role: context.role,
    };

    let doc = await repos.documents.findById(id, tenant);

    // Fallback to benchmark fixtures if not in DB (for demo exploration)
    if (!doc && BENCHMARK_FIXTURES[id]) {
      doc = BENCHMARK_FIXTURES[id];
    }

    if (!doc) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: `Document '${id}' was not found.` } },
        { status: 404 }
      );
    }

    const url = new URL(req.url);
    const inline = url.searchParams.get("inline") === "true";
    const format = url.searchParams.get("format");

    if (format === "json") {
      return NextResponse.json({ success: true, data: doc });
    }

    const pdfBuffer = generateStatutoryPdf(doc);
    const fileName = doc.file_name.endsWith(".pdf") ? doc.file_name : `${doc.file_name}.pdf`;

    return new Response(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${fileName}"`,
        "Content-Length": pdfBuffer.byteLength.toString(),
        "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to generate document download";
    return NextResponse.json(
      { success: false, error: { code: "DOWNLOAD_FAILED", message } },
      { status: 500 }
    );
  }
}
