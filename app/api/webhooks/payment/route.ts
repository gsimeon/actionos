import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getRepositoryContainer } from "@/lib/repositories";
import { isProductionMode } from "@/lib/runtime/mode";
import {
  getPaymentProvider,
  verifyFlutterwaveWebhookSignature,
  FlutterwavePaymentProvider,
} from "@/lib/payments";
import type { CanonicalRefundState } from "@/lib/payments/provider";
import type { PaymentWebhookPayload } from "@/types/api";
import type { Transaction, Quote } from "@/types/database";

export { verifyFlutterwaveWebhookSignature };

// In-memory deduplication cache for settled webhook events
const processedWebhookMemoryCache = new Set<string>();

// Concurrency coordinator: track currently in-flight webhook processing promises
const inFlightWebhookPromises = new Map<string, Promise<NextResponse>>();

/**
 * Resets the in-memory processed webhook cache and concurrency locks (useful for test isolation).
 */
export function resetProcessedWebhookMemoryCache(): void {
  processedWebhookMemoryCache.clear();
  inFlightWebhookPromises.clear();
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

    const flwSignature = req.headers.get("verif-hash");
    const paystackSignature = req.headers.get("x-paystack-signature");
    const isFlutterwave =
      Boolean(flwSignature) ||
      (!paystackSignature && process.env.PAYMENT_PROVIDER === "flutterwave");

    // 1. Authoritative Gateway Cryptographic Signature Verification in Production
    if (isProductionMode()) {
      if (isFlutterwave) {
        const flwSecret =
          process.env.FLUTTERWAVE_SECRET_HASH || process.env.FLUTTERWAVE_WEBHOOK_HASH;

        if (!flwSecret || !flwSignature) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: "UNAUTHORIZED_WEBHOOK",
                message:
                  "Missing FLUTTERWAVE_SECRET_HASH or verif-hash header in production mode",
              },
            },
            { status: 401 }
          );
        }

        if (!verifyFlutterwaveWebhookSignature(flwSignature, flwSecret)) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: "INVALID_WEBHOOK_SIGNATURE",
                message:
                  "Authoritative Flutterwave gateway webhook signature verification failed",
              },
            },
            { status: 401 }
          );
        }
      } else {
        const secret = process.env.PAYSTACK_SECRET_KEY;
        const signature = paystackSignature;

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

    // 2. Allowlist Supported Webhook Events
    // Only verified payment and refund events are processed. Unrelated event types (e.g., transfer.success,
    // subscription.create, invoice.create) are safely acknowledged and ignored immediately without corrupting
    // transaction financial status or triggering unneeded database lookups.
    const SUPPORTED_WEBHOOK_EVENTS = new Set([
      "charge.success",
      "charge.completed",
      "charge.failed",
      "charge.declined",
      "refund.processed",
      "refund.completed",
      "refund.successful",
      "refund.pending",
      "refund.processing",
      "refund.failed",
    ]);

    if (!SUPPORTED_WEBHOOK_EVENTS.has(payload.event)) {
      return NextResponse.json({
        success: true,
        data: {
          acknowledged: true,
          ignored: true,
          reason: "unrecognized_event",
          event: payload.event,
          reference: typeof payload.data?.reference === "string" ? payload.data.reference.trim() : undefined,
        },
      });
    }

    const isRefundWebhook =
      typeof payload.event === "string" &&
      (payload.event.startsWith("refund.") || payload.event.includes("refund"));
    const payloadTxObj =
      payload.data.transaction && typeof payload.data.transaction === "object"
        ? (payload.data.transaction as Record<string, unknown>)
        : undefined;
    const rawData = payload.data as unknown as Record<string, unknown>;
    const payloadTxRef =
      (typeof payload.data.transaction_reference === "string"
        ? payload.data.transaction_reference.trim()
        : "") ||
      (typeof rawData.tx_ref === "string" ? String(rawData.tx_ref).trim() : "") ||
      (payloadTxObj && typeof payloadTxObj.reference === "string"
        ? payloadTxObj.reference.trim()
        : "");
    const payloadRef =
      (typeof payload.data.reference === "string" ? payload.data.reference.trim() : "") ||
      (typeof rawData.tx_ref === "string" ? String(rawData.tx_ref).trim() : "");

    const ref = (isRefundWebhook && payloadTxRef) ? payloadTxRef : (payloadRef || payloadTxRef);
    if (!ref) {
      return NextResponse.json(
        { success: false, error: { code: "MISSING_REFERENCE", message: "Missing required transaction reference in webhook payload" } },
        { status: 400 }
      );
    }

    const providerName = isFlutterwave ? "flutterwave" : "paystack";

    // 2. Durable Idempotency & Deduplication Check (Provider Event ID + State Invariant)
    const providerEventId =
      payload.data.id !== undefined && payload.data.id !== null
        ? String(payload.data.id)
        : undefined;

    const dedupeKey = providerEventId
      ? `${payload.event}:${providerEventId}`
      : `${payload.event}:${ref}:${payload.data.amount ?? ""}:${payload.data.status ?? ""}:${payload.data.paid_at ?? ""}`;

    // Concurrency guard: if an identical event delivery is currently in-flight, await its completion.
    // Do NOT return premature 'acknowledged' status before the initial delivery has durably persisted.
    const inFlightPromise = inFlightWebhookPromises.get(dedupeKey);
    if (inFlightPromise) {
      try {
        const firstRes = await inFlightPromise;
        if (firstRes.ok) {
          const firstJson = (await firstRes.clone().json().catch(() => ({}))) as {
            data?: { status?: string };
          };
          return NextResponse.json({
            success: true,
            data: {
              acknowledged: true,
              duplicate: true,
              concurrency_in_flight: true,
              reference: ref,
              eventId: providerEventId,
              status: firstJson?.data?.status || "succeeded",
            },
          });
        }
        // First delivery failed to persist: do NOT acknowledge duplicate. Return failure so gateway retries.
        return firstRes.clone();
      } catch (err) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "CONCURRENT_PROCESSING_FAILED",
              message: "Concurrent webhook delivery processing failed. Gateway retry requested.",
              details: err instanceof Error ? err.message : String(err),
            },
          },
          { status: 500 }
        );
      }
    }

    // Concurrency coordination: acquire in-flight lock immediately to coordinate any concurrent deliveries
    let resolveProcessing!: (res: NextResponse) => void;
    let resolved = false;
    const processingPromise = new Promise<NextResponse>((resolve) => {
      resolveProcessing = resolve;
    });
    inFlightWebhookPromises.set(dedupeKey, processingPromise);

    const respond = (res: NextResponse): NextResponse => {
      if (!resolved) {
        resolved = true;
        resolveProcessing(res);
      }
      return res;
    };

    try {
      const repos = getRepositoryContainer();
      let existingTx: Transaction | null = null;
      try {
        existingTx = await repos.transactions.findByReference(ref);
      } catch (dbErr) {
        // Do not swallow database lookup failures into 404; return retryable 500
        return respond(
          NextResponse.json(
            {
              success: false,
              error: {
                code: "DATABASE_LOOKUP_FAILED",
                message: `Database error querying transaction reference '${ref}'. Gateway retry requested.`,
                details: dbErr instanceof Error ? dbErr.message : String(dbErr),
              },
            },
            { status: 500 }
          )
        );
      }

      // 3. Validate transaction reference exists in persisted ActionOS records
      if (!existingTx) {
        return respond(
          NextResponse.json(
            {
              success: false,
              error: {
                code: "TRANSACTION_NOT_FOUND",
                message: `Transaction reference '${ref}' was not found in ActionOS records. Webhooks for uninitiated transactions are rejected.`,
              },
            },
            { status: 404 }
          )
        );
      }

      // If transaction reference resolved to a reversing refund record, link to the parent payment transaction
      if (isRefundWebhook && existingTx && existingTx.transaction_type === "refund") {
        const origRef =
          (existingTx.metadata?.originalReference as string | undefined) ||
          (existingTx.metadata?.original_reference as string | undefined);
        if (origRef) {
          const parentTx = await repos.transactions.findByReference(origRef);
          if (parentTx) {
            existingTx = parentTx;
          }
        }
      }

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
        return respond(
          NextResponse.json({
            success: true,
            data: {
              acknowledged: true,
              duplicate: true,
              reference: ref,
              eventId: providerEventId,
              status: existingTx.status,
            },
          })
        );
      }

      // Database uniqueness constraint deduplication check
      const eventRecordId = providerEventId || dedupeKey;
      if (repos.webhookEvents) {
        try {
          const existingRecorded = await repos.webhookEvents.findByEventId(providerName, eventRecordId);
          if (existingRecorded) {
            return respond(
              NextResponse.json({
                success: true,
                data: {
                  acknowledged: true,
                  duplicate: true,
                  reference: ref,
                  eventId: providerEventId,
                  status: existingTx.status,
                },
              })
            );
          }
        } catch (err) {
          return respond(
            NextResponse.json(
              {
                success: false,
                error: {
                  code: "DATABASE_LOOKUP_FAILED",
                  message: "Database error during webhook deduplication lookup. Gateway retry requested.",
                  details: err instanceof Error ? err.message : String(err),
                },
              },
              { status: 500 }
            )
          );
        }
      }
      // 4. Map Event & Validate Provider Status
      // Recognize only defined payment/refund events; never map unrelated events (e.g. transfer.success) to payment failure
      let txStatus: Transaction["status"];
      let refundLifecycleState: CanonicalRefundState | undefined;
      let verifiedProviderTxId: string | undefined;
      let verifiedRefundId: string | undefined;
      let verifiedRefundReference: string | undefined;
      let verifiedRefundAmount: number | undefined;
      const expectedAmount = existingTx.amount;
      const expectedCurrency = (existingTx.currency || "NGN").toUpperCase().trim();
      const isRefundEvent = payload.event.startsWith("refund.");
      const rawStatus = typeof payload.data.status === "string" ? payload.data.status.toLowerCase().trim() : "";

      // Extract refund identifiers from payload early so they are accessible throughout refund resolution
      const webhookRefundReference =
        (typeof payload.data.refund_reference === "string" ? payload.data.refund_reference.trim() : "") ||
        (typeof payload.data.reference === "string" && payload.data.reference.trim() !== ref
          ? payload.data.reference.trim()
          : "");

      const webhookRefundId =
        typeof (payload.data as Record<string, unknown>).refund_id === "string" ||
        typeof (payload.data as Record<string, unknown>).refund_id === "number"
          ? String((payload.data as Record<string, unknown>).refund_id).trim()
          : "";

      const refundRef = webhookRefundReference || webhookRefundId;

      // Resolve expected refund amount:
      // Legitimate partial refunds can be smaller than original payment.
      // 1. Check if transaction metadata has explicitly persisted expected refund amount (e.g. from Saga compensation or refund initiation tool)
      const persistedExpectedRefund =
        typeof existingTx.metadata?.expected_refund_amount === "number"
          ? (existingTx.metadata.expected_refund_amount as number)
          : undefined;

      // 2. Extract webhook payload reported refund amount (converted from minor units / kobo to Naira for Paystack; directly in Naira for Flutterwave)
      const rawRefundField =
        typeof (payload.data as Record<string, unknown>).amount_refunded === "number"
          ? ((payload.data as Record<string, unknown>).amount_refunded as number)
          : payload.data.amount;

      let webhookRefundAmount: number | undefined;
      if (typeof rawRefundField === "number" && !isNaN(rawRefundField) && rawRefundField > 0) {
        if (isFlutterwave) {
          webhookRefundAmount = rawRefundField;
        } else if (isProductionMode()) {
          webhookRefundAmount = rawRefundField / 100;
        } else {
          webhookRefundAmount =
            rawRefundField >= 100 && (rawRefundField > existingTx.amount || rawRefundField % 100 === 0)
              ? rawRefundField / 100
              : rawRefundField;
        }
      }

      // If both persisted expected refund amount and webhook reported amount exist, verify they match
      if (
        isRefundEvent &&
        persistedExpectedRefund !== undefined &&
        webhookRefundAmount !== undefined &&
        Math.abs(persistedExpectedRefund - webhookRefundAmount) > 0.01
      ) {
        return respond(
          NextResponse.json(
            {
              success: false,
              error: {
                code: "PROVIDER_REFUND_AMOUNT_MISMATCH",
                message: `Webhook reported refund amount (${webhookRefundAmount}) does not match expected persisted refund amount (${persistedExpectedRefund}). Refusing refund settlement.`,
              },
            },
            { status: 422 }
          )
        );
      }

      // 3. Expected refund amount for this specific refund event (falls back to webhook amount or full transaction amount)
      const expectedRefundAmount =
        persistedExpectedRefund !== undefined
          ? persistedExpectedRefund
          : webhookRefundAmount !== undefined
          ? webhookRefundAmount
          : expectedAmount;

      // Existing cumulative refunded amount from prior settled partial/full refunds
      const existingRefundHistory: Array<{
        refund_reference?: string;
        refund_id?: string;
        amount: number;
        currency?: string;
        settled_at: string;
      }> = Array.isArray(existingTx.metadata?.refund_history)
        ? (existingTx.metadata.refund_history as Array<{
            refund_reference?: string;
            refund_id?: string;
            amount: number;
            currency?: string;
            settled_at: string;
          }>)
        : [];

      const previousCumulativeRefunded: number =
        typeof existingTx.metadata?.cumulative_refund_amount === "number"
          ? (existingTx.metadata.cumulative_refund_amount as number)
          : existingTx.status === "refunded"
          ? existingTx.amount
          : existingRefundHistory.reduce(
              (sum, item) => sum + (typeof item.amount === "number" ? item.amount : 0),
              0
            );

      const isSuccessEvent =
        payload.event === "charge.success" || payload.event === "charge.completed";
      const isRefundProcessedEvent =
        payload.event === "refund.processed" ||
        payload.event === "refund.completed" ||
        payload.event === "refund.successful";

      if (isSuccessEvent) {
        // Validate that provider status does NOT contradict success event
        if (
          rawStatus &&
          rawStatus !== "success" &&
          rawStatus !== "succeeded" &&
          rawStatus !== "successful"
        ) {
          return respond(
            NextResponse.json(
              {
                success: false,
                error: {
                  code: "PROVIDER_STATUS_MISMATCH",
                  message: `Webhook event '${payload.event}' contradicts provider status '${payload.data.status}'. Refusing to confirm payment settlement.`,
                },
              },
              { status: 422 }
            )
          );
        }
        txStatus = "succeeded";
      } else if (payload.event === "charge.failed" || payload.event === "charge.declined") {
        txStatus = "failed";
      } else if (isRefundProcessedEvent) {
        // Initially set to 'refunded', will be adjusted if partial refund below
        txStatus = "refunded";
        refundLifecycleState = "refund_confirmed";
      } else if (payload.event === "refund.pending" || payload.event === "refund.processing") {
        // Pending refund lifecycle: preserve original payment settlement (e.g. 'succeeded'), do NOT regress to 'pending'
        txStatus = existingTx.status === "refunded" ? "refunded" : existingTx.status;
        refundLifecycleState = "refund_pending";
      } else if (payload.event === "refund.failed") {
        // Failed refund: original payment settlement remains intact (e.g. 'succeeded'), do NOT mark payment failed
        txStatus = existingTx.status === "refunded" ? "refunded" : existingTx.status;
        refundLifecycleState = "refund_failed";
      } else if (isRefundEvent) {
        txStatus = existingTx.status === "refunded" ? "refunded" : existingTx.status;
        refundLifecycleState = "refund_unknown";
      } else {
        // Unrecognized or unrelated event type: acknowledge receipt safely without corrupting transaction financial status
        return respond(
          NextResponse.json({
            success: true,
            data: {
              acknowledged: true,
              ignored: true,
              reason: "unrecognized_event",
              event: payload.event,
              reference: ref,
              status: existingTx.status,
            },
          })
        );
      }

      // 5. Amount and Currency Integrity Verification on charge.success / charge.completed
      if (isSuccessEvent) {
        const rawAmount = typeof payload.data.amount === "number" ? payload.data.amount : undefined;
        if (rawAmount === undefined || isNaN(rawAmount)) {
          return respond(
            NextResponse.json(
              {
                success: false,
                error: {
                  code: "AMOUNT_REQUIRED",
                  message: `Missing or invalid amount in ${payload.event} payload`,
                },
              },
              { status: 422 }
            )
          );
        }

        const webhookCurrency = (payload.data.currency || "NGN").toUpperCase().trim();

        // Paystack delivers amounts in minor units (kobo, e.g. 8750000 for ₦87,500.00)
        // Flutterwave delivers amounts in major units (Naira, e.g. 87500 for ₦87,500.00)
        const isKoboMatch = Math.abs(rawAmount / 100 - expectedAmount) <= 0.01;
        const isNairaMatch = Math.abs(rawAmount - expectedAmount) <= 0.01;

        if (isProductionMode()) {
          const isValidAmount = isFlutterwave ? isNairaMatch : isKoboMatch;
          if (!isValidAmount) {
            return respond(
              NextResponse.json(
                {
                  success: false,
                  error: {
                    code: "AMOUNT_MISMATCH",
                    message: isFlutterwave
                      ? `Production Flutterwave webhook requires exact major units (NGN). Received raw amount ${rawAmount} does not match expected transaction ${expectedAmount} NGN.`
                      : `Production webhook requires strict provider minor units (kobo). Received raw amount ${rawAmount} does not match expected transaction ${expectedAmount} NGN (${expectedAmount * 100} kobo).`,
                  },
                },
                { status: 422 }
              )
            );
          }
        } else {
          if (!isKoboMatch && !isNairaMatch) {
            return respond(
              NextResponse.json(
                {
                  success: false,
                  error: {
                    code: "AMOUNT_MISMATCH",
                    message: `Webhook amount (${rawAmount}) does not match transaction record (${expectedAmount})`,
                  },
                },
                { status: 422 }
              )
            );
          }
        }

        if (isProductionMode()) {
          if (!payload.data.currency || typeof payload.data.currency !== "string" || !payload.data.currency.trim()) {
            return respond(
              NextResponse.json(
                {
                  success: false,
                  error: {
                    code: "CURRENCY_REQUIRED",
                    message: "Production webhook payloads must explicitly supply a valid currency code",
                  },
                },
                { status: 422 }
              )
            );
          }
        }

        if (webhookCurrency !== expectedCurrency) {
          return respond(
            NextResponse.json(
              {
                success: false,
                error: {
                  code: "CURRENCY_MISMATCH",
                  message: `Webhook currency (${webhookCurrency}) does not match expected (${expectedCurrency})`,
                },
              },
              { status: 422 }
            )
          );
        }

        // If transaction is linked to a persisted quote, verify quote amount and currency
        const quoteId =
          (existingTx.metadata?.quote_id as string | undefined) ||
          (existingTx.metadata?.quoteId as string | undefined);
        const isQuoteRequired =
          Boolean(quoteId) ||
          existingTx.metadata?.requires_quote === true ||
          existingTx.metadata?.requiresQuote === true;

        if (isQuoteRequired && !quoteId) {
          return respond(
            NextResponse.json(
              {
                success: false,
                error: {
                  code: "QUOTE_REQUIRED",
                  message: `Transaction '${existingTx.id}' requires a bound quote, but no quoteId is present in transaction metadata. Settlement rejected.`,
                },
              },
              { status: 422 }
            )
          );
        }

        let linkedQuote: Quote | null = null;
        if (quoteId) {
          try {
            linkedQuote = await repos.quotes.findById(quoteId);
          } catch (dbErr) {
            return respond(
              NextResponse.json(
                {
                  success: false,
                  error: {
                    code: "DATABASE_LOOKUP_FAILED",
                    message: `Database error querying quote '${quoteId}'. Gateway retry requested.`,
                    details: dbErr instanceof Error ? dbErr.message : String(dbErr),
                  },
                },
                { status: 500 }
              )
            );
          }

          // FAIL CLOSED: If transaction is bound to a quoteId, the quote MUST exist and be accessible
          if (!linkedQuote) {
            return respond(
              NextResponse.json(
                {
                  success: false,
                  error: {
                    code: "QUOTE_NOT_FOUND",
                    message: `Transaction is bound to quoteId '${quoteId}', but the quote was not found or has been deleted. Settlement rejected.`,
                  },
                },
                { status: 422 }
              )
            );
          }

          if (linkedQuote.expires_at && new Date(linkedQuote.expires_at).getTime() < Date.now()) {
            return respond(
              NextResponse.json(
                {
                  success: false,
                  error: {
                    code: "QUOTE_EXPIRED",
                    message: `Linked authorized quote '${linkedQuote.id}' has expired. Cannot settle payment against an expired quote.`,
                  },
                },
                { status: 422 }
              )
            );
          }

          // Invariant: Transaction amount and quote amount must be mutually consistent
          if (Math.abs(existingTx.amount - linkedQuote.amount) > 0.01) {
            return respond(
              NextResponse.json(
                {
                  success: false,
                  error: {
                    code: "QUOTE_AMOUNT_MISMATCH",
                    message: `Transaction amount (${existingTx.amount}) does not match bound quote amount (${linkedQuote.amount}). Settlement rejected.`,
                  },
                },
                { status: 422 }
              )
            );
          }

          if ((linkedQuote.currency || "NGN").toUpperCase().trim() !== expectedCurrency) {
            return respond(
              NextResponse.json(
                {
                  success: false,
                  error: {
                    code: "QUOTE_CURRENCY_MISMATCH",
                    message: `Transaction currency (${expectedCurrency}) does not match bound quote currency (${linkedQuote.currency}). Settlement rejected.`,
                  },
                },
                { status: 422 }
              )
            );
          }

          const isQuoteKoboMatch = Math.abs(rawAmount / 100 - linkedQuote.amount) <= 0.01;
          const isQuoteNairaMatch = Math.abs(rawAmount - linkedQuote.amount) <= 0.01;
          if (isProductionMode()) {
            const isQuoteValid = isFlutterwave ? isQuoteNairaMatch : isQuoteKoboMatch;
            if (!isQuoteValid) {
              return respond(
                NextResponse.json(
                  {
                    success: false,
                    error: {
                      code: "AMOUNT_MISMATCH",
                      message: isFlutterwave
                        ? `Production Flutterwave webhook requires exact major units (NGN). Received raw amount ${rawAmount} does not match persisted quote amount ${linkedQuote.amount} NGN.`
                        : `Production webhook requires strict provider minor units (kobo). Received raw amount ${rawAmount} does not match persisted quote amount ${linkedQuote.amount} NGN (${linkedQuote.amount * 100} kobo).`,
                    },
                  },
                  { status: 422 }
                )
              );
            }
          } else {
            if (!isQuoteKoboMatch && !isQuoteNairaMatch) {
              return respond(
                NextResponse.json(
                  {
                    success: false,
                    error: {
                      code: "AMOUNT_MISMATCH",
                      message: `Webhook amount (${rawAmount}) does not match persisted quote amount (${linkedQuote.amount})`,
                    },
                  },
                  { status: 422 }
                )
              );
            }
          }

          if ((linkedQuote.currency || "NGN").toUpperCase().trim() !== webhookCurrency) {
            return respond(
              NextResponse.json(
                {
                  success: false,
                  error: {
                    code: "CURRENCY_MISMATCH",
                    message: `Webhook currency (${webhookCurrency}) does not match persisted quote currency (${linkedQuote.currency})`,
                  },
                },
                { status: 422 }
              )
            );
          }
        }

        // Authoritative direct provider verification:
        // In production mode, direct authoritative payment verification is unconditionally MANDATORY.
        // Bypassing verification via environment flags is strictly prohibited in production.
        const shouldVerifyAuthoritatively =
          isProductionMode() ||
          (process.env.ACTIONOS_DISABLE_AUTHORITATIVE_VERIFICATION !== "true" &&
            (process.env.ACTIONOS_VERIFY_WEBHOOK_WITH_PROVIDER === "true" ||
              process.env.ACTIONOS_STRICT_PROVIDER_VERIFICATION === "true"));

        if (shouldVerifyAuthoritatively) {
          try {
            const provider =
              isFlutterwave && process.env.FLUTTERWAVE_SECRET_KEY
                ? new FlutterwavePaymentProvider(process.env.FLUTTERWAVE_SECRET_KEY)
                : getPaymentProvider();
            const verification = await provider.verifyPayment(ref);
            if (verification.status !== "succeeded" && verification.status !== "confirmed") {
              return respond(
                NextResponse.json(
                  {
                    success: false,
                    error: {
                      code: "PROVIDER_VERIFICATION_FAILED",
                      message: `Authoritative provider verification returned status '${verification.status}', refusing to settle transaction.`,
                    },
                  },
                  { status: 422 }
                )
              );
            }

            verifiedProviderTxId = verification.providerTransactionId;

            // Verify provider reference consistency:
            // Compare the provider's documented payment reference strictly with the transaction reference.
            // Strict equality is required; loose substring containment is rejected.
            const verifiedPaymentRef = (
              verification.reference ||
              (verification.providerReference && verification.providerReference !== verification.providerTransactionId
                ? verification.providerReference
                : "") ||
              ""
            ).trim();
            const normTxRef = ref.trim();

            if (!verifiedPaymentRef) {
              return respond(
                NextResponse.json(
                  {
                    success: false,
                    error: {
                      code: "PROVIDER_REFERENCE_REQUIRED",
                      message: "Authoritative provider verification must report a non-empty payment reference matching transaction reference. Refusing settlement.",
                    },
                  },
                  { status: 422 }
                )
              );
            }

            if (verifiedPaymentRef !== normTxRef) {
              return respond(
                NextResponse.json(
                  {
                    success: false,
                    error: {
                      code: "PROVIDER_REFERENCE_MISMATCH",
                      message: `Authoritative provider payment reference '${verifiedPaymentRef}' does not match transaction reference '${normTxRef}'. Strict equality required. Refusing settlement.`,
                    },
                  },
                  { status: 422 }
                )
              );
            }

            // Verify against stored provider reference if recorded
            const storedProvRef =
              (existingTx.metadata?.provider_reference as string) ||
              (existingTx.metadata?.providerReference as string);
            if (storedProvRef && storedProvRef.trim() !== normTxRef && storedProvRef.trim() !== verifiedPaymentRef) {
              return respond(
                NextResponse.json(
                  {
                    success: false,
                    error: {
                      code: "PROVIDER_REFERENCE_MISMATCH",
                      message: `Stored provider reference '${storedProvRef}' contradicts transaction reference '${normTxRef}'. Refusing settlement.`,
                    },
                  },
                  { status: 422 }
                )
              );
            }

            // Authoritative verification must independently validate financial details: amount and currency
            if (typeof verification.amount === "number") {
              if (Math.abs(verification.amount - expectedAmount) > 0.01) {
                return respond(
                  NextResponse.json(
                    {
                      success: false,
                      error: {
                        code: "PROVIDER_AMOUNT_MISMATCH",
                        message: `Authoritative provider verification amount (${verification.amount}) does not match expected transaction amount (${expectedAmount}). Refusing settlement.`,
                      },
                    },
                    { status: 422 }
                  )
                );
              }
              if (linkedQuote && Math.abs(verification.amount - linkedQuote.amount) > 0.01) {
                return respond(
                  NextResponse.json(
                    {
                      success: false,
                      error: {
                        code: "PROVIDER_AMOUNT_MISMATCH",
                        message: `Authoritative provider verification amount (${verification.amount}) does not match quote amount (${linkedQuote.amount}). Refusing settlement.`,
                      },
                    },
                    { status: 422 }
                  )
                );
              }
            } else {
              return respond(
                NextResponse.json(
                  {
                    success: false,
                    error: {
                      code: "PROVIDER_VERIFICATION_FAILED",
                      message: "Authoritative provider verification did not report a valid amount.",
                    },
                  },
                  { status: 422 }
                )
              );
            }

            if (
              !verification.currency ||
              typeof verification.currency !== "string" ||
              !verification.currency.trim()
            ) {
              return respond(
                NextResponse.json(
                  {
                    success: false,
                    error: {
                      code: "PROVIDER_CURRENCY_REQUIRED",
                      message: "Authoritative provider verification must report a valid, non-empty currency code. Refusing settlement.",
                    },
                  },
                  { status: 422 }
                )
              );
            }

            const verifiedCurrency = verification.currency.toUpperCase().trim();
            if (verifiedCurrency !== expectedCurrency) {
              return respond(
                NextResponse.json(
                  {
                    success: false,
                    error: {
                      code: "PROVIDER_CURRENCY_MISMATCH",
                      message: `Authoritative provider verification currency (${verifiedCurrency}) does not match expected currency (${expectedCurrency}). Refusing settlement.`,
                    },
                  },
                  { status: 422 }
                )
              );
            }
            if (linkedQuote) {
              const quoteCurrency = (linkedQuote.currency || "").toUpperCase().trim();
              if (quoteCurrency && verifiedCurrency !== quoteCurrency) {
                return respond(
                  NextResponse.json(
                    {
                      success: false,
                      error: {
                        code: "PROVIDER_CURRENCY_MISMATCH",
                        message: `Authoritative provider verification currency (${verifiedCurrency}) does not match quote currency (${quoteCurrency}). Refusing settlement.`,
                      },
                    },
                    { status: 422 }
                  )
                );
              }
            }
          } catch (provErr) {
            return respond(
              NextResponse.json(
                {
                  success: false,
                  error: {
                    code: "PROVIDER_VERIFICATION_ERROR",
                    message: `Failed to verify payment with provider: ${provErr instanceof Error ? provErr.message : String(provErr)}`,
                  },
                },
                { status: 500 }
              )
            );
          }
        }
      }

      // Authoritative direct provider refund verification:
      // Reconciles refund outcome with provider evidence.
      // In production mode, refund confirmation strictly requires an explicit refund identifier and authoritative provider evidence.
      if (isRefundEvent) {
        const shouldVerifyAuthoritatively =
          isProductionMode() ||
          (process.env.ACTIONOS_DISABLE_AUTHORITATIVE_VERIFICATION !== "true" &&
            (process.env.ACTIONOS_VERIFY_WEBHOOK_WITH_PROVIDER === "true" ||
              process.env.ACTIONOS_STRICT_PROVIDER_VERIFICATION === "true"));

        if (payload.event === "refund.processed") {
          // Rule: In production, require refund identifier before confirming refund
          if (isProductionMode() && !refundRef) {
            return respond(
              NextResponse.json(
                {
                  success: false,
                  error: {
                    code: "REFUND_IDENTIFIER_REQUIRED",
                    message: "Production refund confirmation requires an explicit refund identifier (refund_reference or reference). Refusing unverified refund settlement.",
                  },
                },
                { status: 422 }
              )
            );
          }

          if (shouldVerifyAuthoritatively) {
            const provider = getPaymentProvider();

            // In production, require provider to support refund verification
            if (isProductionMode() && typeof provider.verifyRefund !== "function") {
              return respond(
                NextResponse.json(
                  {
                    success: false,
                    error: {
                      code: "PROVIDER_REFUND_VERIFICATION_UNAVAILABLE",
                      message: "Authoritative provider refund verification capability is required in production runtime mode before settling a refund as confirmed.",
                    },
                  },
                  { status: 500 }
                )
              );
            }

            if (refundRef && typeof provider.verifyRefund === "function") {
              try {
                const refundVerification = await provider.verifyRefund(refundRef);
                if (
                  refundVerification.status !== "refund_confirmed" &&
                  refundVerification.status !== "refunded"
                ) {
                  return respond(
                    NextResponse.json(
                      {
                        success: false,
                        error: {
                          code: "PROVIDER_REFUND_VERIFICATION_FAILED",
                          message: `Authoritative provider refund verification returned status '${refundVerification.status}', refusing to mark transaction refunded.`,
                        },
                      },
                      { status: 422 }
                    )
                  );
                }

                const providerRefundRef = (refundVerification.refundReference || "").trim();
                const providerRefundId = (refundVerification.refundId || "").trim();

                // Explicit matching between webhook and provider refund identifiers:
                // - Matches if alphanumeric refundReference corresponds (e.g. data.refund_reference)
                // - Matches if numeric/gateway refundId corresponds (e.g. data.id or data.refund_id)
                // - Matches if query parameter matches either returned provider identifier
                const matchesRefundRef = Boolean(
                  (webhookRefundReference && providerRefundRef && webhookRefundReference === providerRefundRef) ||
                  (webhookRefundId && providerRefundId && webhookRefundId === providerRefundId) ||
                  (refundRef && (refundRef === providerRefundRef || refundRef === providerRefundId)) ||
                  (webhookRefundReference && providerRefundId && webhookRefundReference === providerRefundId)
                );

                if (!providerRefundRef && !providerRefundId) {
                  if (isProductionMode() || process.env.ACTIONOS_STRICT_PROVIDER_VERIFICATION === "true") {
                    return respond(
                      NextResponse.json(
                        {
                          success: false,
                          error: {
                            code: "PROVIDER_REFUND_REFERENCE_REQUIRED",
                            message: "Authoritative provider refund verification must report an explicit refund identifier (refundReference or refundId). Refusing refund settlement.",
                          },
                        },
                        { status: 422 }
                      )
                    );
                  }
                } else if (!matchesRefundRef) {
                  return respond(
                    NextResponse.json(
                      {
                        success: false,
                        error: {
                          code: "PROVIDER_REFUND_REFERENCE_MISMATCH",
                          message: `Authoritative provider refund reference '${providerRefundRef || providerRefundId}' does not match expected refund reference '${refundRef}'. Refusing to mark transaction refunded.`,
                        },
                      },
                      { status: 422 }
                    )
                  );
                }

                if (
                  !refundVerification.transactionReference ||
                  !refundVerification.transactionReference.trim()
                ) {
                  return respond(
                    NextResponse.json(
                      {
                        success: false,
                        error: {
                          code: "PROVIDER_REFUND_TRANSACTION_REFERENCE_REQUIRED",
                          message: "Authoritative provider refund verification must identify the original payment transaction reference. Missing evidence leaves refund unconfirmed until reconciliation.",
                        },
                      },
                      { status: 422 }
                    )
                  );
                } else if (
                  refundVerification.transactionReference.trim() !== ref.trim()
                ) {
                  return respond(
                    NextResponse.json(
                      {
                        success: false,
                        error: {
                          code: "PROVIDER_REFUND_TRANSACTION_MISMATCH",
                          message: `Authoritative provider refund transaction reference '${refundVerification.transactionReference}' does not match expected transaction reference '${ref}'. Refusing to mark transaction refunded.`,
                        },
                      },
                      { status: 422 }
                    )
                  );
                }

                if (typeof refundVerification.amount === "number" && refundVerification.amount > 0) {
                  if (Math.abs(refundVerification.amount - expectedRefundAmount) > 0.01) {
                    return respond(
                      NextResponse.json(
                        {
                          success: false,
                          error: {
                            code: "PROVIDER_REFUND_AMOUNT_MISMATCH",
                            message: `Authoritative provider refund verification amount (${refundVerification.amount}) does not match expected refund amount (${expectedRefundAmount}). Refusing refund settlement.`,
                          },
                        },
                        { status: 422 }
                      )
                    );
                  }
                  verifiedRefundAmount = refundVerification.amount;
                } else if (isProductionMode() || process.env.ACTIONOS_STRICT_PROVIDER_VERIFICATION === "true") {
                  return respond(
                    NextResponse.json(
                      {
                        success: false,
                        error: {
                          code: "PROVIDER_REFUND_AMOUNT_REQUIRED",
                          message: "Authoritative provider refund verification did not report a valid refund amount. Refusing refund settlement.",
                        },
                      },
                      { status: 422 }
                    )
                  );
                }

                if (
                  refundVerification.currency &&
                  typeof refundVerification.currency === "string" &&
                  refundVerification.currency.trim()
                ) {
                  const verifiedRefundCurrency = refundVerification.currency.toUpperCase().trim();
                  if (verifiedRefundCurrency !== expectedCurrency) {
                    return respond(
                      NextResponse.json(
                        {
                          success: false,
                          error: {
                            code: "PROVIDER_REFUND_CURRENCY_MISMATCH",
                            message: `Authoritative provider refund verification currency (${verifiedRefundCurrency}) does not match expected currency (${expectedCurrency}). Refusing refund settlement.`,
                          },
                        },
                        { status: 422 }
                      )
                    );
                  }
                } else if (isProductionMode() || process.env.ACTIONOS_STRICT_PROVIDER_VERIFICATION === "true") {
                  return respond(
                    NextResponse.json(
                      {
                        success: false,
                        error: {
                          code: "PROVIDER_REFUND_CURRENCY_REQUIRED",
                          message: "Authoritative provider refund verification did not report a valid currency code. Refusing refund settlement.",
                        },
                      },
                      { status: 422 }
                    )
                  );
                }

                verifiedRefundId = providerRefundId || webhookRefundId;
                verifiedRefundReference = providerRefundRef || webhookRefundReference;
              } catch (refErr) {
                if (isProductionMode() || process.env.ACTIONOS_STRICT_PROVIDER_VERIFICATION === "true") {
                  return respond(
                    NextResponse.json(
                      {
                        success: false,
                        error: {
                          code: "PROVIDER_REFUND_VERIFICATION_ERROR",
                          message: `Failed to verify refund with provider: ${refErr instanceof Error ? refErr.message : String(refErr)}`,
                        },
                      },
                      { status: 500 }
                    )
                  );
                }
              }
            } else if (isProductionMode()) {
              return respond(
                NextResponse.json(
                  {
                    success: false,
                    error: {
                      code: "UNVERIFIED_REFUND_SETTLEMENT_PROHIBITED",
                      message: "Production runtime requires authoritative evidence before marking a refund confirmed.",
                    },
                  },
                  { status: 422 }
                )
              );
            }
          }
        }
      }

      // 6. Out-of-Order Webhook Protection: Never regress terminal or settled states
      // Rule A: Terminal 'refunded' or 'partially_refunded' states must never be overwritten by stale charge events
      if (
        (existingTx.status === "refunded" || existingTx.status === "partially_refunded") &&
        !isRefundEvent
      ) {
        return respond(
          NextResponse.json({
            success: true,
            data: { acknowledged: true, duplicate: true, ignored: "out_of_order", reference: ref },
          })
        );
      }

      // Rule B: Already 'succeeded' or 'partially_refunded' transaction must never regress to 'failed' or 'pending' due to out-of-order delivery
      if (
        !isRefundEvent &&
        (existingTx.status === "succeeded" || existingTx.status === "partially_refunded") &&
        (txStatus === "failed" || txStatus === "pending")
      ) {
        return respond(
          NextResponse.json({
            success: true,
            data: { acknowledged: true, duplicate: true, ignored: "out_of_order", reference: ref },
          })
        );
      }

      const currentRefundState =
        (existingTx.metadata?.refund_state as string | undefined) ||
        (existingTx.metadata?.refundState as string | undefined);

      // Rule C: Out-of-order refund protection: confirmed or terminal refund state cannot be overwritten by stale pending/failed refund events
      if (
        isRefundEvent &&
        (currentRefundState === "refund_confirmed" || existingTx.status === "refunded" || existingTx.status === "partially_refunded") &&
        refundLifecycleState !== "refund_confirmed"
      ) {
        return respond(
          NextResponse.json({
            success: true,
            data: {
              acknowledged: true,
              duplicate: true,
              ignored: "out_of_order_refund",
              reference: ref,
              status: existingTx.status,
              refund_state: currentRefundState || "refund_confirmed",
            },
          })
        );
      }

      // Rule D: Idempotent duplicate check: already in target status and identical refund state
      const currentRefundIdentifier =
        verifiedRefundReference || webhookRefundReference || webhookRefundId || refundRef || providerEventId;
      const isAlreadyCountedInHistory =
        isRefundEvent &&
        existingRefundHistory.some(
          (entry) =>
            (entry.refund_reference && entry.refund_reference === currentRefundIdentifier) ||
            (entry.refund_id && entry.refund_id === currentRefundIdentifier)
        );

      const isDuplicateRefund =
        isRefundEvent &&
        isAlreadyCountedInHistory &&
        (currentRefundState === refundLifecycleState || existingTx.status === "refunded" || existingTx.status === "partially_refunded");

      if (
        (existingTx.status === txStatus && !isRefundEvent) ||
        isDuplicateRefund
      ) {
        return respond(
          NextResponse.json({
            success: true,
            data: { acknowledged: true, duplicate: true, reference: ref, status: txStatus },
          })
        );
      }

      // 7. Cumulative refund limit enforcement and partial vs full refund status determination
      const effectiveRefundAmount =
        verifiedRefundAmount !== undefined ? verifiedRefundAmount : expectedRefundAmount;

      const newCumulativeRefunded = isAlreadyCountedInHistory
        ? previousCumulativeRefunded
        : previousCumulativeRefunded + effectiveRefundAmount;

      if (isRefundEvent && refundLifecycleState === "refund_confirmed") {
        if (newCumulativeRefunded > existingTx.amount + 0.01) {
          return respond(
            NextResponse.json(
              {
                success: false,
                error: {
                  code: "CUMULATIVE_REFUND_LIMIT_EXCEEDED",
                  message: `Cumulative refund amount (${newCumulativeRefunded}) exceeds original payment transaction amount (${existingTx.amount}). Refusing refund settlement.`,
                },
              },
              { status: 422 }
            )
          );
        }

        if (newCumulativeRefunded >= existingTx.amount - 0.01) {
          txStatus = "refunded";
        } else {
          // Partial refund: distinguish partially_refunded from refunded
          txStatus = "partially_refunded";
        }
      }

      // 8. Atomic Settlement: Persist Updated Status & Durable Event Metadata
      processedEvents.push(dedupeKey);

      const originalPaymentStatus =
        (existingTx.metadata?.original_payment_status as string | undefined) ||
        (existingTx.metadata?.originalPaymentStatus as string | undefined) ||
        (existingTx.status !== "refunded" ? existingTx.status : "succeeded");

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
      if (verifiedProviderTxId) {
        updatedMetadata.provider_transaction_id = verifiedProviderTxId;
      }
      if (payload.data.paid_at) {
        updatedMetadata.provider_paid_at = payload.data.paid_at;
      }

      // Preserve payment settlement outcome and store refund lifecycle state separately
      if (payload.event === "charge.success") {
        updatedMetadata.original_payment_status = "succeeded";
        updatedMetadata.payment_settled_at = payload.data.paid_at || new Date().toISOString();
      }

      if (isRefundEvent && refundLifecycleState) {
        updatedMetadata.original_payment_status = originalPaymentStatus;
        updatedMetadata.refund_state = refundLifecycleState;
        updatedMetadata.refund_status = refundLifecycleState;
        updatedMetadata.refund_event = payload.event;
        updatedMetadata.refund_updated_at = new Date().toISOString();
        if (verifiedRefundReference || payload.data.refund_reference || payload.data.reference) {
          updatedMetadata.refund_reference = (verifiedRefundReference || payload.data.refund_reference || payload.data.reference) as string;
        }
        if (verifiedRefundId || (payload.data as Record<string, unknown>).refund_id) {
          updatedMetadata.refund_id = (verifiedRefundId || (payload.data as Record<string, unknown>).refund_id) as string;
        }
        updatedMetadata.refund_amount = effectiveRefundAmount;
        if (payload.data.currency) {
          updatedMetadata.refund_currency = payload.data.currency;
        }

        if (refundLifecycleState === "refund_confirmed") {
          updatedMetadata.cumulative_refund_amount = newCumulativeRefunded;
          updatedMetadata.remaining_balance = Math.max(0, existingTx.amount - newCumulativeRefunded);
          updatedMetadata.is_partial_refund = newCumulativeRefunded < existingTx.amount - 0.01;

          if (!isAlreadyCountedInHistory) {
            const newHistoryEntry = {
              refund_reference: (verifiedRefundReference || webhookRefundReference || payload.data.reference || "") as string,
              refund_id: (verifiedRefundId || webhookRefundId || "") as string,
              amount: effectiveRefundAmount,
              currency: (payload.data.currency || existingTx.currency || "NGN") as string,
              settled_at: new Date().toISOString(),
            };
            updatedMetadata.refund_history = [...existingRefundHistory, newHistoryEntry];
          }
        }
      }

      const eventMetadata: Record<string, unknown> = {
        amount: payload.data.amount,
        currency: payload.data.currency,
        provider_event_id: providerEventId,
        is_refund_event: isRefundEvent,
        refund_state: refundLifecycleState,
      };
      if (verifiedProviderTxId) {
        eventMetadata.provider_transaction_id = verifiedProviderTxId;
      }

      try {
        let isSettlementDuplicate = false;
        let settledTxStatus = txStatus;

        if (typeof repos.transactions.settleWithWebhookEvent === "function") {
          const settlementRes = await repos.transactions.settleWithWebhookEvent(
            existingTx.id,
            txStatus,
            {
              provider: providerName,
              eventId: eventRecordId,
              eventType: payload.event,
              reference: ref,
              status: txStatus,
              metadata: eventMetadata,
            },
            undefined,
            {
              metadata: updatedMetadata,
              refundAmount: isRefundEvent ? effectiveRefundAmount : undefined,
              refundReference: isRefundEvent ? currentRefundIdentifier : undefined,
              refundId: isRefundEvent ? (verifiedRefundId || webhookRefundId || undefined) : undefined,
              refundState: isRefundEvent ? refundLifecycleState : undefined,
            }
          );
          if (settlementRes?.isDuplicate) {
            isSettlementDuplicate = true;
            settledTxStatus = settlementRes.transaction?.status || txStatus;
          }
        } else {
          if (isProductionMode()) {
            throw new Error(
              "Production invariant violation: Atomic database settlement method 'settleWithWebhookEvent' is required in production runtime mode to prevent partial writes. Failing closed."
            );
          }

          // Fallback only allowed in demo/test mode if custom mock container did not implement atomic settlement
          await repos.transactions.updateStatus(existingTx.id, txStatus, undefined, {
            metadata: updatedMetadata,
          });
          if (repos.webhookEvents) {
            const recordRes = await repos.webhookEvents.recordEvent({
              provider: providerName,
              eventId: eventRecordId,
              eventType: payload.event,
              reference: ref,
              status: txStatus,
              metadata: eventMetadata,
            });
            if (recordRes?.isDuplicate) {
              isSettlementDuplicate = true;
            }
          }
          if (isRefundEvent && currentRefundIdentifier) {
            await repos.transactions.create({
              customer_id: existingTx.customer_id,
              organization_id: existingTx.organization_id,
              renewal_id: existingTx.renewal_id,
              amount: -Math.abs(effectiveRefundAmount),
              currency: (payload.data.currency || existingTx.currency || "NGN").toUpperCase().trim(),
              provider: existingTx.provider || providerName,
              reference: currentRefundIdentifier,
              status: refundLifecycleState === "refund_confirmed" ? "succeeded" : "pending",
              transaction_type: "refund",
              metadata: {
                original_transaction_id: existingTx.id,
                originalReference: ref,
                refund_reference: currentRefundIdentifier,
                refund_id: verifiedRefundId || webhookRefundId || null,
                refund_amount: effectiveRefundAmount,
                refund_state: refundLifecycleState,
                settled_at: new Date().toISOString(),
              },
            });
          }
        }

        // In-memory cache is committed ONLY after successful database persistence
        processedWebhookMemoryCache.add(dedupeKey);

        return respond(
          NextResponse.json({
            success: true,
            data: {
              acknowledged: true,
              duplicate: isSettlementDuplicate,
              reference: ref,
              status: settledTxStatus,
              eventId: providerEventId,
            },
          })
        );
      } catch (dbError) {
        // Return HTTP 500 so gateway recognizes persistence failure and retries delivery
        return respond(
          NextResponse.json(
            {
              success: false,
              error: {
                code: "DATABASE_UPDATE_FAILED",
                message: `Failed to persist transaction update for reference '${ref}'. Provider retry requested.`,
                details: dbError instanceof Error ? dbError.message : String(dbError),
              },
            },
            { status: 500 }
          )
        );
      }
    } catch (innerErr) {
      const errRes = NextResponse.json(
        {
          success: false,
          error: {
            code: "WEBHOOK_PROCESSING_FAILED",
            message: "Webhook event processing failed. Gateway retry requested.",
            details: innerErr instanceof Error ? innerErr.message : String(innerErr),
          },
        },
        { status: 500 }
      );
      return respond(errRes);
    } finally {
      // Release concurrency locks
      inFlightWebhookPromises.delete(dedupeKey);
    }
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
