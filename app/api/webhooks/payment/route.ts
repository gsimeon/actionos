import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getRepositoryContainer } from "@/lib/repositories";
import { isProductionMode } from "@/lib/runtime/mode";
import type { PaymentWebhookPayload } from "@/types/api";

/**
 * Cryptographically verifies Paystack webhook authenticity against the raw request body.
 * Uses HMAC-SHA512 with timingSafeEqual to prevent signature tampering or timing attacks.
 */
export function verifyPaystackWebhookSignature(
  rawBody: string,
  signature: string | null | undefined,
  secretKey?: string
): boolean {
  const secret = secretKey || process.env.PAYSTACK_SECRET_KEY;
  if (!secret || !signature) {
    return false;
  }
  try {
    const computedHash = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
    const computedBuf = Buffer.from(computedHash, "utf8");
    const sigBuf = Buffer.from(signature, "utf8");
    if (computedBuf.length !== sigBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(computedBuf, sigBuf);
  } catch {
    return false;
  }
}

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

      if (!verifyPaystackWebhookSignature(rawBody, signature, secret)) {
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

    const ref = payload.data.reference;
    const existingTx = await repos.transactions.findByReference(ref).catch(() => null);

    // Map Paystack events to canonical transaction statuses
    let txStatus: "succeeded" | "failed" | "refunded" | "pending";
    if (payload.event === "charge.success") {
      txStatus = "succeeded";
    } else if (payload.event === "refund.processed") {
      txStatus = "refunded";
    } else if (payload.event === "refund.pending" || payload.event === "refund.processing") {
      txStatus = "pending";
    } else {
      txStatus = "failed";
    }

    // 2. Amount and Currency Integrity Verification on charge.success
    if (payload.event === "charge.success" && existingTx) {
      const rawAmount = typeof payload.data.amount === "number" ? payload.data.amount : undefined;
      const expectedAmount = existingTx.amount;
      const webhookCurrency = (payload.data.currency || "NGN").toUpperCase();
      const expectedCurrency = (existingTx.currency || "NGN").toUpperCase();

      let amountMatches = false;
      if (rawAmount !== undefined) {
        if (Math.abs(rawAmount - expectedAmount) <= 0.01) {
          amountMatches = true;
        } else if (Math.abs(rawAmount / 100 - expectedAmount) <= 0.01) {
          amountMatches = true;
        }
      }

      if (rawAmount !== undefined && !amountMatches) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "AMOUNT_MISMATCH",
              message: `Webhook amount (${rawAmount}) does not match transaction record (${expectedAmount})`,
            },
          },
          { status: 422 }
        );
      }

      if (payload.data.currency && webhookCurrency !== expectedCurrency) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "CURRENCY_MISMATCH",
              message: `Webhook currency (${webhookCurrency}) does not match expected (${expectedCurrency})`,
            },
          },
          { status: 422 }
        );
      }
    }

    // 3. Out-of-Order Webhook Protection: Never regress terminal or advanced states
    if (existingTx) {
      // Rule A: Terminal 'refunded' state must never be overwritten by stale charge.success or failed
      if (existingTx.status === "refunded") {
        return NextResponse.json({
          success: true,
          data: { acknowledged: true, duplicate: true, ignored: "out_of_order", reference: ref },
        });
      }

      // Rule B: Already 'succeeded' transaction must never regress to 'failed' or 'pending' due to out-of-order delivery
      if (existingTx.status === "succeeded" && (txStatus === "failed" || txStatus === "pending")) {
        return NextResponse.json({
          success: true,
          data: { acknowledged: true, duplicate: true, ignored: "out_of_order", reference: ref },
        });
      }

      // 4. Idempotent Retry Deduplication Guard: Already in target state
      if (existingTx.status === txStatus) {
        return NextResponse.json({
          success: true,
          data: { acknowledged: true, duplicate: true, reference: ref },
        });
      }

      await repos.transactions.updateStatus(existingTx.id, txStatus).catch(() => {});
    } else {
      await repos.transactions.updateStatus(ref, txStatus).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      data: { acknowledged: true, duplicate: false, reference: ref, status: txStatus },
    });
  } catch (err: unknown) {
    const isProd = isProductionMode();
    const message = isProd
      ? "Webhook processing failed"
      : err instanceof Error
      ? err.message
      : "Webhook processing failed";
    return NextResponse.json(
      { success: false, error: { code: "WEBHOOK_ERROR", message } },
      { status: 500 }
    );
  }
}
