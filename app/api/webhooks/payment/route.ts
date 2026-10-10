import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getRepositoryContainer } from "@/lib/repositories";
import { isProductionMode } from "@/lib/runtime/mode";
import { getPaymentProvider } from "@/lib/payments";
import type { PaymentWebhookPayload } from "@/types/api";
import type { Transaction, Quote } from "@/types/database";

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

    // 2. Allowlist Supported Webhook Events
    // Only verified payment and refund events are processed. Unrelated event types (e.g., transfer.success,
    // subscription.create, invoice.create) are safely acknowledged and ignored immediately without corrupting
    // transaction financial status or triggering unneeded database lookups.
    const SUPPORTED_WEBHOOK_EVENTS = new Set([
      "charge.success",
      "charge.failed",
      "charge.declined",
      "refund.processed",
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

    const ref = typeof payload.data.reference === "string" ? payload.data.reference.trim() : "";
    if (!ref) {
      return NextResponse.json(
        { success: false, error: { code: "MISSING_REFERENCE", message: "Missing required transaction reference in webhook payload" } },
        { status: 400 }
      );
    }

    const repos = getRepositoryContainer();
    let existingTx: Transaction | null = null;
    try {
      existingTx = await repos.transactions.findByReference(ref);
    } catch (dbErr) {
      // Do not swallow database lookup failures into 404; return retryable 500
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "DATABASE_LOOKUP_FAILED",
            message: `Database error querying transaction reference '${ref}'. Gateway retry requested.`,
            details: dbErr instanceof Error ? dbErr.message : String(dbErr),
          },
        },
        { status: 500 }
      );
    }

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
              status: firstJson?.data?.status || existingTx.status,
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
          const existingRecorded = await repos.webhookEvents.findByEventId("paystack", eventRecordId);
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
      let txStatus: "succeeded" | "failed" | "refunded" | "pending";
      const rawStatus = typeof payload.data.status === "string" ? payload.data.status.toLowerCase().trim() : "";

      if (payload.event === "charge.success") {
        // Validate that provider status does NOT contradict success event
        if (rawStatus && rawStatus !== "success" && rawStatus !== "succeeded") {
          return respond(
            NextResponse.json(
              {
                success: false,
                error: {
                  code: "PROVIDER_STATUS_MISMATCH",
                  message: `Webhook event 'charge.success' contradicts provider status '${payload.data.status}'. Refusing to confirm payment settlement.`,
                },
              },
              { status: 422 }
            )
          );
        }
        txStatus = "succeeded";
      } else if (payload.event === "charge.failed" || payload.event === "charge.declined") {
        txStatus = "failed";
      } else if (payload.event === "refund.processed") {
        txStatus = "refunded";
      } else if (payload.event === "refund.pending" || payload.event === "refund.processing") {
        txStatus = "pending";
      } else if (payload.event === "refund.failed") {
        txStatus = "failed";
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

      // 5. Amount and Currency Integrity Verification on charge.success
      if (payload.event === "charge.success") {
        const rawAmount = typeof payload.data.amount === "number" ? payload.data.amount : undefined;
        if (rawAmount === undefined || isNaN(rawAmount)) {
          return respond(
            NextResponse.json(
              {
                success: false,
                error: {
                  code: "AMOUNT_REQUIRED",
                  message: "Missing or invalid amount in charge.success payload",
                },
              },
              { status: 422 }
            )
          );
        }

        const expectedAmount = existingTx.amount;
        const webhookCurrency = (payload.data.currency || "NGN").toUpperCase().trim();
        const expectedCurrency = (existingTx.currency || "NGN").toUpperCase().trim();

        // Paystack delivers amounts in minor units (kobo, e.g. 8750000 for ₦87,500.00)
        // In production, strictly enforce provider's documented minor units (kobo)
        const isKoboMatch = Math.abs(rawAmount / 100 - expectedAmount) <= 0.01;
        const isNairaMatch = Math.abs(rawAmount - expectedAmount) <= 0.01;

        if (isProductionMode()) {
          if (!isKoboMatch) {
            return respond(
              NextResponse.json(
                {
                  success: false,
                  error: {
                    code: "AMOUNT_MISMATCH",
                    message: `Production webhook requires strict provider minor units (kobo). Received raw amount ${rawAmount} does not match expected transaction ${expectedAmount} NGN (${expectedAmount * 100} kobo).`,
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

        if (payload.data.currency && webhookCurrency !== expectedCurrency) {
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

          const isQuoteKoboMatch = Math.abs(rawAmount / 100 - linkedQuote.amount) <= 0.01;
          const isQuoteNairaMatch = Math.abs(rawAmount - linkedQuote.amount) <= 0.01;
          if (isProductionMode()) {
            if (!isQuoteKoboMatch) {
              return respond(
                NextResponse.json(
                  {
                    success: false,
                    error: {
                      code: "AMOUNT_MISMATCH",
                      message: `Production webhook requires strict provider minor units (kobo). Received raw amount ${rawAmount} does not match persisted quote amount ${linkedQuote.amount} NGN (${linkedQuote.amount * 100} kobo).`,
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

        // Out-of-band authoritative direct provider verification when requested by trusted payment policy
        if (
          process.env.ACTIONOS_VERIFY_WEBHOOK_WITH_PROVIDER === "true" ||
          (isProductionMode() && process.env.ACTIONOS_STRICT_PROVIDER_VERIFICATION === "true")
        ) {
          try {
            const provider = getPaymentProvider();
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
            }

            const verifiedCurrency = (verification.currency || "NGN").toUpperCase().trim();
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
              const quoteCurrency = (linkedQuote.currency || "NGN").toUpperCase().trim();
              if (verifiedCurrency !== quoteCurrency) {
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

      // 6. Out-of-Order Webhook Protection: Never regress terminal or settled states
      // Rule A: Terminal 'refunded' state must never be overwritten by stale charge.success or failed
      if (existingTx.status === "refunded") {
        return respond(
          NextResponse.json({
            success: true,
            data: { acknowledged: true, duplicate: true, ignored: "out_of_order", reference: ref },
          })
        );
      }

      // Rule B: Already 'succeeded' transaction must never regress to 'failed' or 'pending' due to out-of-order delivery
      if (existingTx.status === "succeeded" && (txStatus === "failed" || txStatus === "pending")) {
        return respond(
          NextResponse.json({
            success: true,
            data: { acknowledged: true, duplicate: true, ignored: "out_of_order", reference: ref },
          })
        );
      }

      // Rule C: Idempotent duplicate check: already in target status
      if (existingTx.status === txStatus) {
        return respond(
          NextResponse.json({
            success: true,
            data: { acknowledged: true, duplicate: true, reference: ref, status: txStatus },
          })
        );
      }

      // 7. Atomic Settlement: Persist Updated Status & Durable Event Metadata
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

      const eventMetadata: Record<string, unknown> = {
        amount: payload.data.amount,
        currency: payload.data.currency,
        provider_event_id: providerEventId,
      };

      try {
        if (typeof repos.transactions.settleWithWebhookEvent === "function") {
          await repos.transactions.settleWithWebhookEvent(
            existingTx.id,
            txStatus,
            {
              provider: "paystack",
              eventId: eventRecordId,
              eventType: payload.event,
              reference: ref,
              status: txStatus,
              metadata: eventMetadata,
            },
            undefined,
            { metadata: updatedMetadata }
          );
        } else {
          // Fallback if atomic settlement method not available
          await repos.transactions.updateStatus(existingTx.id, txStatus, undefined, {
            metadata: updatedMetadata,
          });
          if (repos.webhookEvents) {
            await repos.webhookEvents.recordEvent({
              provider: "paystack",
              eventId: eventRecordId,
              eventType: payload.event,
              reference: ref,
              status: txStatus,
              metadata: eventMetadata,
            });
          }
        }

        // In-memory cache is committed ONLY after successful database persistence
        processedWebhookMemoryCache.add(dedupeKey);
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

      return respond(
        NextResponse.json({
          success: true,
          data: {
            acknowledged: true,
            duplicate: false,
            reference: ref,
            status: txStatus,
            eventId: providerEventId,
          },
        })
      );
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
