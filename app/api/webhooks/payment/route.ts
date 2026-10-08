import { NextResponse } from "next/server";
import { getRepositoryContainer } from "@/lib/repositories";
import type { PaymentWebhookPayload } from "@/types/api";

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as PaymentWebhookPayload;
    const repos = getRepositoryContainer();

    if (!payload?.event || !payload?.data?.reference) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_WEBHOOK", message: "Missing event or reference" } },
        { status: 400 }
      );
    }

    const txStatus = payload.event === "charge.success" ? "succeeded" : "failed";
    const existingTx = await repos.transactions.findByReference(payload.data.reference).catch(() => null);

    if (existingTx && existingTx.status === txStatus) {
      // Idempotent retry acknowledgement
      return NextResponse.json({
        success: true,
        data: { acknowledged: true, duplicate: true, reference: payload.data.reference },
      });
    }

    if (existingTx) {
      await repos.transactions.updateStatus(existingTx.id, txStatus).catch(() => {});
    } else {
      await repos.transactions.updateStatus(payload.data.reference, txStatus).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      data: { acknowledged: true, duplicate: false, reference: payload.data.reference },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Webhook processing failed";
    return NextResponse.json(
      { success: false, error: { code: "WEBHOOK_ERROR", message } },
      { status: 500 }
    );
  }
}
