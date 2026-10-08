import type { IActionOSTool, ToolResult, ExecutionContext } from "@/types/actionos";
import type { NotificationRecord } from "@/types/database";
import { getStore } from "@/lib/actionos/mock-store";

export interface ScheduleReminderInput {
  customerId: string;
  policyNumber: string;
  newExpiry: string;
}

export interface ReminderOutput {
  scheduledCount: number;
  reminders: Array<{
    daysBefore: number;
    scheduledFor: string;
    channel: string;
  }>;
}

export class ScheduleReminderTool implements IActionOSTool<ScheduleReminderInput, ReminderOutput> {
  public readonly name = "schedule_reminder";
  public readonly description = "Cascade future renewal reminders at 30, 14, 7, and 1 days before new expiry";
  public readonly category = "scheduler";
  public readonly version = "1.0.0";
  public readonly riskLevel = "low" as const;
  public readonly requiresConfirmation = false;

  validateInput(input: unknown): { valid: boolean; error?: string; data?: ScheduleReminderInput } {
    if (!input || typeof input !== "object") {
      return { valid: false, error: "Input must be an object" };
    }
    const data = input as ScheduleReminderInput;
    if (!data.customerId || !data.newExpiry) {
      return { valid: false, error: "customerId and newExpiry are required" };
    }
    return { valid: true, data };
  }

  async execute(input: ScheduleReminderInput, _context: ExecutionContext): Promise<ToolResult<ReminderOutput>> {
    const store = getStore();
    const expiryDate = new Date(input.newExpiry);
    const intervals = [30, 14, 7, 1];
    const createdList: Array<{ daysBefore: number; scheduledFor: string; channel: string }> = [];

    for (const days of intervals) {
      const scheduledTime = new Date(expiryDate);
      scheduledTime.setDate(scheduledTime.getDate() - days);

      const notifRecord: NotificationRecord = {
        id: `rem_${Date.now()}_${days}d`,
        customer_id: input.customerId,
        type: "renewal_due",
        channel: "in_app",
        title: `Upcoming Renewal Notice: ${days} days remaining`,
        message: `Your insurance policy ${input.policyNumber} will expire in ${days} days on ${input.newExpiry}. ActionOS can renew it with one tap.`,
        scheduled_for: scheduledTime.toISOString(),
        sent_at: null,
        status: "pending",
        metadata: {
          daysBeforeExpiry: days,
          policyNumber: input.policyNumber,
          automatedSchedule: true,
        },
      };

      store.notifications.push(notifRecord);
      createdList.push({
        daysBefore: days,
        scheduledFor: scheduledTime.toISOString().split("T")[0],
        channel: "in_app",
      });
    }

    return {
      success: true,
      data: {
        scheduledCount: createdList.length,
        reminders: createdList,
      },
    };
  }
}
