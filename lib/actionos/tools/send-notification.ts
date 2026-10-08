import type { IActionOSTool, ToolResult, ExecutionContext } from "@/types/actionos";
import type { NotificationRecord } from "@/types/database";
import { getStore } from "@/lib/actionos/mock-store";
import { formatNaira, formatDate } from "@/lib/utils";

export interface SendNotificationInput {
  customerId: string;
  policyNumber: string;
  newExpiry: string;
  amount: number;
  channels?: Array<NotificationRecord["channel"]>;
}

export interface NotificationOutput {
  notificationsSent: number;
  deliveryStatuses: Array<{
    channel: string;
    status: string;
    recipient: string;
  }>;
}

export class SendNotificationTool implements IActionOSTool<SendNotificationInput, NotificationOutput> {
  public readonly name = "send_notification";
  public readonly description = "Dispatch multi-channel notifications (in-app, SMS, email, WhatsApp) to customer";
  public readonly category = "communication";
  public readonly version = "1.0.0";
  public readonly riskLevel = "low" as const;
  public readonly requiresConfirmation = false;

  validateInput(input: unknown): { valid: boolean; error?: string; data?: SendNotificationInput } {
    if (!input || typeof input !== "object") {
      return { valid: false, error: "Input must be an object" };
    }
    const data = input as SendNotificationInput;
    if (!data.customerId || !data.policyNumber) {
      return { valid: false, error: "customerId and policyNumber are required" };
    }
    return { valid: true, data };
  }

  async execute(input: SendNotificationInput, _context: ExecutionContext): Promise<ToolResult<NotificationOutput>> {
    const store = getStore();
    const customer = store.customers.find((c) => c.id === input.customerId) || store.customers[0];

    const formattedAmount = formatNaira(input.amount);
    const formattedExpiry = formatDate(input.newExpiry);

    const message = `Your vehicle insurance has been successfully renewed.\nPolicy: ${input.policyNumber}\nNew Expiry: ${formattedExpiry}\nAmount: ${formattedAmount}\nCertificate: Available in your ActionOS documents.`;
    const title = `Insurance Policy Renewed — ${input.policyNumber}`;

    const channels: Array<NotificationRecord["channel"]> = input.channels || ["in_app", "sms", "email"];
    const deliveryStatuses = [];

    for (const ch of channels) {
      const notifId = `notif_${Date.now()}_${ch}`;
      const notifRecord: NotificationRecord = {
        id: notifId,
        customer_id: input.customerId,
        type: "certificate_issued",
        channel: ch,
        title,
        message,
        scheduled_for: new Date().toISOString(),
        sent_at: new Date().toISOString(),
        status: "sent",
        metadata: {
          policyNumber: input.policyNumber,
          simulation: true,
          destination: ch === "sms" ? customer?.phone : ch === "email" ? customer?.email : "in_app_tray",
        },
      };

      store.notifications.unshift(notifRecord);
      deliveryStatuses.push({
        channel: ch,
        status: "delivered",
        recipient: ch === "sms" ? customer?.phone || "" : ch === "email" ? customer?.email || "" : "In-App UI",
      });
    }

    return {
      success: true,
      data: {
        notificationsSent: channels.length,
        deliveryStatuses,
      },
    };
  }
}
