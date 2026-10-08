import { NextResponse } from "next/server";
import { getStore } from "@/lib/actionos/mock-store";
import type { PaymentWebhookPayload } from "@/types/api";

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as PaymentWebhookPayload;
    const store = getStore();

    if (!payload?.event || !payload?.data?.reference) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_WEBHOOK", message: "Missing event or reference" } },
        { status: 400 }
      );
    }

    const tx = store.transactions.find((t) => t.reference === payload.data.reference);
    if (tx) {
      tx.status = payload.event === "charge.success" ? "succeeded" : "failed";
      tx.updated_at = new Date().toISOString();
    }

    return NextResponse.json({
      success: true,
      data: { acknowledged: true, reference: payload.data.reference },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Webhook processing failed";
    return NextResponse.json(
      { success: false, error: { code: "WEBHOOK_ERROR", message } },
      { status: 500 }
    );
  }
}
