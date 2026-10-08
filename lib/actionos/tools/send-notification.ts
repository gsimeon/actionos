import type { IActionOSTool, ToolResult, ExecutionContext } from "@/types/actionos";
import type { NotificationRecord } from "@/types/database";
import { getRepositoryContainer } from "@/lib/repositories";
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

  async execute(input: SendNotificationInput, context: ExecutionContext): Promise<ToolResult<NotificationOutput>> {
    const repos = getRepositoryContainer();
    const tenantContext = {
      organizationId: context.organizationId,
      customerId: context.customerId,
      role: context.userRole,
    };
    let customer = await repos.customers.findById(input.customerId, tenantContext);
    if (!customer && context.isSimulated) {
      customer = await repos.customers.findByNumber("CUS-000001", tenantContext);
    }

    const formattedAmount = formatNaira(input.amount);
    const formattedExpiry = formatDate(input.newExpiry);

    const message = `Your vehicle insurance has been successfully renewed.\nPolicy: ${input.policyNumber}\nNew Expiry: ${formattedExpiry}\nAmount: ${formattedAmount}\nCertificate: Available in your ActionOS documents.`;
    const title = `Insurance Policy Renewed — ${input.policyNumber}`;

    const channels: Array<NotificationRecord["channel"]> = input.channels || ["in_app", "sms", "email"];
    const deliveryStatuses = [];

    for (const ch of channels) {
      await repos.notifications.create({
        customer_id: input.customerId,
        type: "certificate_issued",
        channel: ch,
        title,
        message,
        scheduled_for: new Date().toISOString(),
      });

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
