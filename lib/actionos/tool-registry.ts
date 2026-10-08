import type { IActionOSTool } from "@/types/actionos";
import { GetCustomerTool } from "./tools/get-customer";
import { GetPolicyTool } from "./tools/get-policy";
import { CheckRenewalEligibilityTool } from "./tools/check-renewal-eligibility";
import { GetQuoteTool } from "./tools/get-quote";
import { RequestPaymentTool } from "./tools/request-payment";
import { VerifyPaymentTool } from "./tools/verify-payment";
import { RenewPolicyTool } from "./tools/renew-policy";
import { GenerateCertificateTool } from "./tools/generate-certificate";
import { SendNotificationTool } from "./tools/send-notification";
import { ScheduleReminderTool } from "./tools/schedule-reminder";
import { VerifyNiidTool } from "./tools/verify-niid";
import { RefundPaymentTool } from "./tools/refund-payment";

export class ActionOSToolRegistry {
  private static instance: ActionOSToolRegistry;
  private tools = new Map<string, IActionOSTool>();

  private constructor() {
    this.registerDefaults();
  }

  public static getInstance(): ActionOSToolRegistry {
    if (!ActionOSToolRegistry.instance) {
      ActionOSToolRegistry.instance = new ActionOSToolRegistry();
    }
    return ActionOSToolRegistry.instance;
  }

  private registerDefaults() {
    this.register(new GetCustomerTool());
    this.register(new GetPolicyTool());
    this.register(new CheckRenewalEligibilityTool());
    this.register(new VerifyNiidTool());
    this.register(new GetQuoteTool());
    this.register(new RequestPaymentTool());
    this.register(new VerifyPaymentTool());
    this.register(new RenewPolicyTool());
    this.register(new GenerateCertificateTool());
    this.register(new SendNotificationTool());
    this.register(new ScheduleReminderTool());
    this.register(new RefundPaymentTool());
  }

  public register(tool: IActionOSTool): void {
    this.tools.set(tool.name, tool);
  }

  public get(name: string): IActionOSTool | undefined {
    return this.tools.get(name);
  }

  public has(name: string): boolean {
    return this.tools.has(name);
  }

  public list(): IActionOSTool[] {
    return Array.from(this.tools.values());
  }
}

export const toolRegistry = ActionOSToolRegistry.getInstance();
