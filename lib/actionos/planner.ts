import type {
  ActionPlan,
  ActionStep,
} from "@/types/database";
import type { NAtlasUnderstanding } from "@/types/actionos";

export interface PlannerInput {
  sessionId: string;
  understanding: NAtlasUnderstanding;
  customerId?: string;
  organizationId: string;
}

export interface PlannedWorkflow {
  plan: ActionPlan;
  steps: ActionStep[];
}

export class ActionOSPlanner {
  /**
   * Produce a deterministic, ordered ActionPlan tailored to the user's intent.
   */
  public createPlan(input: PlannerInput): PlannedWorkflow {
    const { sessionId, understanding, customerId } = input;
    const planId = `plan_${sessionId.substring(0, 8)}`;

    let goal = "Process customer request";
    let riskLevel: ActionPlan["risk_level"] = "low";
    const rawSteps: Array<{
      action_type: string;
      description: string;
      tool_name: string;
      requires_confirmation: boolean;
      input: Record<string, unknown>;
    }> = [];

    switch (understanding.intent) {
      case "renew_policy": {
        goal = "Autonomous, safe vehicle insurance renewal with verified payment and certificate generation";
        riskLevel = "high";

        // Step 1: Verify Customer Identity
        rawSteps.push({
          action_type: "customer_lookup",
          description: "Verify customer profile and active tenant context",
          tool_name: "get_customer",
          requires_confirmation: false,
          input: { customerId },
        });

        // Step 2: Retrieve Relevant Policy
        rawSteps.push({
          action_type: "policy_lookup",
          description: "Find vehicle insurance policy for vehicle or policy number",
          tool_name: "get_policy",
          requires_confirmation: false,
          input: {
            policyNumber: understanding.entities.policyNumber as string,
            vehiclePlate: understanding.entities.vehiclePlate as string,
          },
        });

        // Step 3: Check Underwriting Eligibility
        rawSteps.push({
          action_type: "underwriting_check",
          description: "Verify renewal window, policy suspension, and grace period constraints",
          tool_name: "check_renewal_eligibility",
          requires_confirmation: false,
          input: {},
        });

        // Step 4: Calculate Actuarial Renewal Quote
        rawSteps.push({
          action_type: "quote_generation",
          description: "Compute certified renewal quote including discounts and VAT",
          tool_name: "get_quote",
          requires_confirmation: false,
          input: {},
        });

        // Step 5: Secure Payment Request (High risk - Gate)
        rawSteps.push({
          action_type: "payment_initiation",
          description: "Request payment processing through designated payment rail",
          tool_name: "request_payment",
          requires_confirmation: true,
          input: {},
        });

        // Step 6: Independent Payment Settlement Verification
        rawSteps.push({
          action_type: "payment_verification",
          description: "Independently query gateway to confirm settlement and amount match",
          tool_name: "verify_payment",
          requires_confirmation: false,
          input: {},
        });

        // Step 7: Atomic Policy Renewal State Transition
        rawSteps.push({
          action_type: "policy_renewal",
          description: "Roll forward policy expiry date and update policy status to renewed",
          tool_name: "renew_policy",
          requires_confirmation: true,
          input: {},
        });

        // Step 8: Document Generation
        rawSteps.push({
          action_type: "document_issuance",
          description: "Generate official digital insurance renewal certificate",
          tool_name: "generate_certificate",
          requires_confirmation: false,
          input: {},
        });

        // Step 9: Multi-Channel Customer Notification
        rawSteps.push({
          action_type: "notification_dispatch",
          description: "Send confirmation via in-app tray, SMS, and email",
          tool_name: "send_notification",
          requires_confirmation: false,
          input: {},
        });

        // Step 10: Cascade Future Expiry Reminders
        rawSteps.push({
          action_type: "reminder_schedule",
          description: "Schedule automated notifications for 30, 14, 7, and 1 day before next expiry",
          tool_name: "schedule_reminder",
          requires_confirmation: false,
          input: {},
        });

        break;
      }

      case "get_quote": {
        goal = "Retrieve insurance policy and calculate official renewal quote";
        riskLevel = "medium";
        rawSteps.push(
          {
            action_type: "customer_lookup",
            description: "Verify customer record",
            tool_name: "get_customer",
            requires_confirmation: false,
            input: { customerId },
          },
          {
            action_type: "policy_lookup",
            description: "Find vehicle insurance policy",
            tool_name: "get_policy",
            requires_confirmation: false,
            input: {
              policyNumber: understanding.entities.policyNumber as string,
              vehiclePlate: understanding.entities.vehiclePlate as string,
            },
          },
          {
            action_type: "quote_generation",
            description: "Compute renewal quote",
            tool_name: "get_quote",
            requires_confirmation: false,
            input: {},
          }
        );
        break;
      }

      case "query_vehicle": {
        goal = "Query vehicle database and cross-verify statutory FRSC/NIID registration";
        riskLevel = "low";
        rawSteps.push(
          {
            action_type: "customer_lookup",
            description: "Verify customer profile and tenant context",
            tool_name: "get_customer",
            requires_confirmation: false,
            input: { customerId },
          },
          {
            action_type: "vehicle_query",
            description: "Query ActionOS vehicle repository by plate, VIN, or engine number",
            tool_name: "query_vehicle",
            requires_confirmation: false,
            input: {
              vehiclePlate: understanding.entities.vehiclePlate as string,
              vin: understanding.entities.vin as string,
              chassisNumber: understanding.entities.chassisNumber as string,
              engineNumber: understanding.entities.engineNumber as string,
              customerId,
              language: understanding.entities.detectedLanguage as string,
            },
          }
        );
        break;
      }

      case "register_vehicle": {
        goal = "Register customer vehicle in database with statutory FRSC/NIID verification";
        riskLevel = "medium";
        rawSteps.push(
          {
            action_type: "customer_lookup",
            description: "Verify customer record",
            tool_name: "get_customer",
            requires_confirmation: false,
            input: { customerId },
          },
          {
            action_type: "regulatory_verification",
            description: "Verify vehicle legitimacy against NIID and FRSC database",
            tool_name: "verify_niid_database",
            requires_confirmation: false,
            input: {
              vehiclePlate: understanding.entities.vehiclePlate as string,
              chassisNumber: understanding.entities.chassisNumber as string,
            },
          },
          {
            action_type: "vehicle_registration",
            description: "Persist vehicle in database and issue pre-clearance token",
            tool_name: "register_vehicle",
            requires_confirmation: false,
            input: {
              customerId,
              vehiclePlate: understanding.entities.vehiclePlate as string,
              chassisNumber: understanding.entities.chassisNumber as string,
              vin: understanding.entities.vin as string,
              engineNumber: understanding.entities.engineNumber as string,
              language: understanding.entities.detectedLanguage as string,
            },
          }
        );
        break;
      }

      default: {
        goal = "Inspect customer policy details";
        riskLevel = "low";
        rawSteps.push(
          {
            action_type: "customer_lookup",
            description: "Verify customer profile",
            tool_name: "get_customer",
            requires_confirmation: false,
            input: { customerId },
          },
          {
            action_type: "policy_lookup",
            description: "Retrieve policy status",
            tool_name: "get_policy",
            requires_confirmation: false,
            input: {
              policyNumber: understanding.entities.policyNumber as string,
              vehiclePlate: understanding.entities.vehiclePlate as string,
            },
          }
        );
        break;
      }
    }

    const plan: ActionPlan = {
      id: planId,
      session_id: sessionId,
      intent: understanding.intent,
      goal,
      risk_level: riskLevel,
      confidence: understanding.confidence,
      status: "pending",
      created_at: new Date().toISOString(),
      completed_at: null,
    };

    const steps: ActionStep[] = rawSteps.map((s, idx) => ({
      id: `step_${planId}_${idx + 1}`,
      action_plan_id: planId,
      sequence: idx + 1,
      action_type: s.action_type,
      description: s.description,
      tool_name: s.tool_name,
      input: s.input,
      output: null,
      status: "pending",
      requires_confirmation: s.requires_confirmation,
      started_at: null,
      completed_at: null,
      error: null,
    }));

    return { plan, steps };
  }
}
