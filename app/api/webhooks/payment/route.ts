import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getRepositoryContainer } from "@/lib/repositories";
import { isProductionMode } from "@/lib/runtime/mode";
import type { PaymentWebhookPayload } from "@/types/api";

// In-memory deduplication cache for sub-second concurrent webhook deliveries
const processedWebhookMemoryCache = new Set<string>();

/**
 * Resets the in-memory processed webhook cache (useful for test isolation).
 */
export function resetProcessedWebhookMemoryCache(): void {
  processedWebhookMemoryCache.clear();
}

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

    if (!payload || typeof payload !== "object" || !payload.event || !payload.data || typeof payload.data !== "object") {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_WEBHOOK", message: "Missing event or data object in webhook payload" } },
        { status: 400 }
      );
    }

    const ref = typeof payload.data.reference === "string" ? payload.data.reference.trim() : "";
    if (!ref) {
      return NextResponse.json(
        { success: false, error: { code: "MISSING_REFERENCE", message: "Missing required transaction reference in webhook payload" } },
        { status: 400 }
      );
    }

    const repos = getRepositoryContainer();
    const existingTx = await repos.transactions.findByReference(ref).catch(() => null);

    // 2. Validate transaction reference exists in persisted ActionOS records
    if (!existingTx) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "TRANSACTION_NOT_FOUND",
            message: `Transaction reference '${ref}' was not found in ActionOS records. Webhooks for uninitiated transactions are rejected.`,
          },
        },
        { status: 404 }
      );
    }

    // 3. Durable Idempotency & Deduplication Check (Provider Event ID + State Invariant)
    const providerEventId =
      payload.data.id !== undefined && payload.data.id !== null
        ? String(payload.data.id)
        : undefined;

    const dedupeKey = providerEventId
      ? `${payload.event}:${providerEventId}`
      : `${payload.event}:${ref}:${payload.data.amount ?? ""}:${payload.data.status ?? ""}:${payload.data.paid_at ?? ""}`;

    const txMeta = (existingTx.metadata && typeof existingTx.metadata === "object"
      ? { ...existingTx.metadata }
      : {}) as Record<string, unknown>;

    const processedEvents: string[] = Array.isArray(txMeta.processed_webhook_events)
      ? [...(txMeta.processed_webhook_events as string[])]
      : [];

    const isDuplicateEvent =
      processedEvents.includes(dedupeKey) ||
      (providerEventId !== undefined && processedEvents.some((k) => k.endsWith(`:${providerEventId}`))) ||
      processedWebhookMemoryCache.has(dedupeKey);

    if (isDuplicateEvent) {
      return NextResponse.json({
        success: true,
        data: {
          acknowledged: true,
          duplicate: true,
          reference: ref,
          eventId: providerEventId,
          status: existingTx.status,
        },
      });
    }

    // 4. Map Event & Validate Provider Status (Never trust event name alone)
    let txStatus: "succeeded" | "failed" | "refunded" | "pending";
    const rawStatus = typeof payload.data.status === "string" ? payload.data.status.toLowerCase().trim() : "";

    if (payload.event === "charge.success") {
      // Validate that provider status does NOT contradict success event
      if (rawStatus && rawStatus !== "success" && rawStatus !== "succeeded") {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "PROVIDER_STATUS_MISMATCH",
              message: `Webhook event 'charge.success' contradicts provider status '${payload.data.status}'. Refusing to confirm payment settlement.`,
            },
          },
          { status: 422 }
        );
      }
      txStatus = "succeeded";
    } else if (payload.event === "refund.processed") {
      txStatus = "refunded";
    } else if (payload.event === "refund.pending" || payload.event === "refund.processing") {
      txStatus = "pending";
    } else {
      txStatus = "failed";
    }

    // 5. Amount and Currency Integrity Verification on charge.success
    if (payload.event === "charge.success") {
      const rawAmount = typeof payload.data.amount === "number" ? payload.data.amount : undefined;
      if (rawAmount === undefined || isNaN(rawAmount)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "AMOUNT_REQUIRED",
              message: "Missing or invalid amount in charge.success payload",
            },
          },
          { status: 422 }
        );
      }

      const expectedAmount = existingTx.amount;
      const webhookCurrency = (payload.data.currency || "NGN").toUpperCase().trim();
      const expectedCurrency = (existingTx.currency || "NGN").toUpperCase().trim();

      // Paystack delivers amounts in minor units (kobo, e.g. 8750000 for ₦87,500.00); tests may send direct Naira
      const isKoboMatch = Math.abs(rawAmount / 100 - expectedAmount) <= 0.01;
      const isNairaMatch = Math.abs(rawAmount - expectedAmount) <= 0.01;

      if (!isKoboMatch && !isNairaMatch) {
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

      // If transaction is linked to a persisted quote, verify quote amount and currency
      const quoteId =
        (existingTx.metadata?.quote_id as string | undefined) ||
        (existingTx.metadata?.quoteId as string | undefined);
      if (quoteId) {
        const linkedQuote = await repos.quotes.findById(quoteId).catch(() => null);
        if (linkedQuote) {
          const isQuoteKoboMatch = Math.abs(rawAmount / 100 - linkedQuote.amount) <= 0.01;
          const isQuoteNairaMatch = Math.abs(rawAmount - linkedQuote.amount) <= 0.01;
          if (!isQuoteKoboMatch && !isQuoteNairaMatch) {
            return NextResponse.json(
              {
                success: false,
                error: {
                  code: "AMOUNT_MISMATCH",
                  message: `Webhook amount (${rawAmount}) does not match persisted quote amount (${linkedQuote.amount})`,
                },
              },
              { status: 422 }
            );
          }
          if ((linkedQuote.currency || "NGN").toUpperCase() !== webhookCurrency) {
            return NextResponse.json(
              {
                success: false,
                error: {
                  code: "CURRENCY_MISMATCH",
                  message: `Webhook currency (${webhookCurrency}) does not match persisted quote currency (${linkedQuote.currency})`,
                },
              },
              { status: 422 }
            );
          }
        }
      }
    }

    // 6. Out-of-Order Webhook Protection: Never regress terminal or settled states
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

    // Rule C: Idempotent duplicate check: already in target status
    if (existingTx.status === txStatus) {
      return NextResponse.json({
        success: true,
        data: { acknowledged: true, duplicate: true, reference: ref, status: txStatus },
      });
    }

    // 7. Persist Updated Status & Durable Event Metadata (Do NOT swallow database errors)
    processedEvents.push(dedupeKey);

    const updatedMetadata: Record<string, unknown> = {
      ...txMeta,
      processed_webhook_events: processedEvents,
      last_webhook_event: payload.event,
      last_webhook_at: new Date().toISOString(),
      webhook_verified_at: new Date().toISOString(),
    };
    if (providerEventId) {
      updatedMetadata.provider_event_id = providerEventId;
    }
    if (payload.data.paid_at) {
      updatedMetadata.provider_paid_at = payload.data.paid_at;
    }

    try {
      await repos.transactions.updateStatus(existingTx.id, txStatus, undefined, {
        metadata: updatedMetadata,
      });
      // In-memory cache is committed ONLY after successful database persistence
      processedWebhookMemoryCache.add(dedupeKey);
    } catch (dbError) {
      // Return HTTP 500 so gateway recognizes persistence failure and retries delivery
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "DATABASE_UPDATE_FAILED",
            message: `Failed to persist transaction update for reference '${ref}'. Provider retry requested.`,
            details: dbError instanceof Error ? dbError.message : String(dbError),
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        acknowledged: true,
        duplicate: false,
        reference: ref,
        status: txStatus,
        eventId: providerEventId,
      },
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
