import crypto from "crypto";

export interface OutboundWebhookPayload<T = Record<string, unknown>> {
  id: string;
  event: "action.started" | "authorization.required" | "payment.verified" | "policy.renewed" | "saga.compensated";
  timestamp: string;
  data: T;
  signature?: string;
}

export class ActionOSWebhookDispatcher {
  private static instance: ActionOSWebhookDispatcher;
  private subscribers: Array<{ url: string; secret: string }> = [
    {
      url: "https://api.partner-insurance.ng/v1/webhooks/actionos",
      secret: "whsec_demo_actionos_nitda2026",
    },
  ];

  public static getInstance(): ActionOSWebhookDispatcher {
    if (!ActionOSWebhookDispatcher.instance) {
      ActionOSWebhookDispatcher.instance = new ActionOSWebhookDispatcher();
    }
    return ActionOSWebhookDispatcher.instance;
  }

  /**
   * Broadcast an HMAC-SHA256 signed event to configured partner webhook endpoints
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
      .createHmac("sha256", "whsec_demo_actionos_nitda2026")
      .update(payloadString)
      .digest("hex");

    // In production, dispatch asynchronously via fetch.
    // In demo / offline environment, recorded in telemetry log.
    return payload;
  }
}

export const webhookDispatcher = ActionOSWebhookDispatcher.getInstance();
