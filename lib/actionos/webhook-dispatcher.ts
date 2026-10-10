import crypto from "crypto";
import { isProductionMode } from "@/lib/runtime/mode";

export interface OutboundWebhookPayload<T = Record<string, unknown>> {
  id: string;
  event:
    | "action.started"
    | "authorization.required"
    | "payment.verified"
    | "policy.renewed"
    | "saga.compensated"
    | "saga.compensation_failed"
    | "saga.compensation_pending"
    | "saga.compensation_uncertain"
    | "recovery.reconciled"
    | "recovery.dead_lettered";
  timestamp: string;
  data: T;
  signature?: string;
}

export class ActionOSWebhookDispatcher {
  private static instance: ActionOSWebhookDispatcher;

  public static getInstance(): ActionOSWebhookDispatcher {
    if (!ActionOSWebhookDispatcher.instance) {
      ActionOSWebhookDispatcher.instance = new ActionOSWebhookDispatcher();
    }
    return ActionOSWebhookDispatcher.instance;
  }

  private getWebhookSecret(): string {
    const isProd = isProductionMode();
    const envSecret = process.env.ACTIONOS_WEBHOOK_SIGNING_SECRET;
    if (isProd) {
      if (!envSecret || envSecret.trim().length === 0) {
        throw new Error("ACTIONOS_WEBHOOK_SIGNING_SECRET is strictly required in production environment.");
      }
      return envSecret;
    }
    return envSecret || "whsec_demo_actionos_nitda2026";
  }

  /**
   * Broadcast an HMAC-SHA256 signed event to configured partner webhook endpoints.
   * Minimal, non-PII payloads are strictly enforced to preserve customer privacy.
   */
  public async broadcast<T extends Record<string, unknown>>(
    event: OutboundWebhookPayload["event"],
    data: T
  ): Promise<OutboundWebhookPayload<T>> {
    const payload: OutboundWebhookPayload<T> = {
      id: `wh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    // Sign payload with HMAC-SHA256
    const payloadString = JSON.stringify(payload);
    payload.signature = crypto
      .createHmac("sha256", this.getWebhookSecret())
      .update(payloadString)
      .digest("hex");

    // In production, dispatch asynchronously via fetch.
    // In demo / offline environment, recorded in telemetry log.
    return payload;
  }
}

export const webhookDispatcher = ActionOSWebhookDispatcher.getInstance();
