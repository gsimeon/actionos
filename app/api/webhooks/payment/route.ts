import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getRepositoryContainer } from "@/lib/repositories";
import { isProductionMode } from "@/lib/runtime/mode";
import type { PaymentWebhookPayload } from "@/types/api";

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();

    // 1. Authoritative Gateway Cryptographic Signature Verification in Production
    if (isProductionMode()) {
      const secret = process.env.PAYSTACK_SECRET_KEY;
      const signature = req.headers.get("x-paystack-signature");

      if (!secret || !signature) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "UNAUTHORIZED_WEBHOOK",
              message: "Missing PAYSTACK_SECRET_KEY or x-paystack-signature header in production mode",
            },
          },
          { status: 401 }
        );
      }

      const computedHash = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
      const computedBuf = Buffer.from(computedHash, "utf8");
      const sigBuf = Buffer.from(signature, "utf8");

      if (computedBuf.length !== sigBuf.length || !crypto.timingSafeEqual(computedBuf, sigBuf)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "INVALID_WEBHOOK_SIGNATURE",
              message: "Authoritative gateway webhook signature verification failed",
            },
          },
          { status: 401 }
        );
      }
    }

    let payload: PaymentWebhookPayload;
    try {
      payload = JSON.parse(rawBody) as PaymentWebhookPayload;
    } catch {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_JSON", message: "Malformed webhook payload" } },
        { status: 400 }
      );
    }

    const repos = getRepositoryContainer();

    if (!payload?.event || !payload?.data?.reference) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_WEBHOOK", message: "Missing event or reference" } },
        { status: 400 }
      );
    }

    const txStatus = payload.event === "charge.success" ? "succeeded" : "failed";
    const existingTx = await repos.transactions.findByReference(payload.data.reference).catch(() => null);

    // 2. Idempotent Retry Deduplication Guard
    if (existingTx && existingTx.status === txStatus) {
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
