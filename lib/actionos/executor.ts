import type { ActionStep, ToolExecution } from "@/types/database";
import type { WorkflowExecutionContext, ToolResult, ActionLedgerEvent } from "@/types/actionos";
import { toolRegistry } from "./tool-registry";
import { ActionOSPermissions } from "./permissions";
import { getRepositoryContainer } from "@/lib/repositories";

export class ActionOSExecutor {
  /**
   * Execute an atomic action step with strict security, permission checks,
   * tool execution logs, and audit trail updates.
   */
  async executeStep(
    step: ActionStep,
    context: WorkflowExecutionContext,
    stepInputOverride?: Record<string, unknown>
  ): Promise<{
    result: ToolResult;
    executionTimeMs: number;
    ledgerEvent: ActionLedgerEvent;
  }> {
    const startTime = Date.now();
    const repos = getRepositoryContainer();

    // 1. Validate tool exists
    const tool = toolRegistry.get(step.tool_name);
    if (!tool) {
      const errorMsg = `Security Error: Tool '${step.tool_name}' is not registered in ToolRegistry.`;
      step.status = "failed";
      step.error = errorMsg;
      step.completed_at = new Date().toISOString();

      try {
        await repos.steps.updateStep(step.id, {
          status: "failed",
          error: errorMsg,
          completed_at: step.completed_at,
        });
      } catch {}

      return {
        result: {
          success: false,
          error: { code: "UNREGISTERED_TOOL", message: errorMsg },
        },
        executionTimeMs: 0,
        ledgerEvent: {
          id: `ev_${Date.now()}_err`,
          sessionId: context.sessionId,
          timestamp: new Date().toISOString(),
          action: step.action_type,
          description: `Failed: Tool '${step.tool_name}' unregistered`,
          status: "failed",
          actor: "Policy Guardrail",
          tool: step.tool_name,
        },
      };
    }

    // 2. Validate permissions with Default-Deny
    const effectiveRole = context.auth.role;
    const permission = ActionOSPermissions.checkPermission({
      role: effectiveRole,
      toolName: step.tool_name,
      amount: (stepInputOverride?.amount as number) || (step.input?.amount as number),
    });

    if (!permission.allowed) {
      const errorMsg = permission.reason || `Permission denied for role '${effectiveRole}'`;
      step.status = "failed";
      step.error = errorMsg;
      step.completed_at = new Date().toISOString();

      try {
        await repos.steps.updateStep(step.id, {
          status: "failed",
          error: errorMsg,
          completed_at: step.completed_at,
        });
      } catch {}

      return {
        result: {
          success: false,
          error: { code: "PERMISSION_DENIED", message: errorMsg },
        },
        executionTimeMs: 0,
        ledgerEvent: {
          id: `ev_${Date.now()}_perm`,
          sessionId: context.sessionId,
          timestamp: new Date().toISOString(),
          action: step.action_type,
          description: `Permission Denied: ${errorMsg}`,
          status: "failed",
          actor: "Policy Guardrail",
          tool: step.tool_name,
        },
      };
    }

    // 3. Prepare & validate inputs
    const mergedInput = { ...step.input, ...(stepInputOverride || {}) };
    const inputValidation = tool.validateInput(mergedInput);
    if (!inputValidation.valid) {
      const errorMsg = inputValidation.error || "Invalid tool input parameters";
      step.status = "failed";
      step.error = errorMsg;
      step.completed_at = new Date().toISOString();

      try {
        await repos.steps.updateStep(step.id, {
          status: "failed",
          error: errorMsg,
          completed_at: step.completed_at,
        });
      } catch {}

      return {
        result: {
          success: false,
          error: { code: "INVALID_TOOL_INPUT", message: errorMsg },
        },
        executionTimeMs: 0,
        ledgerEvent: {
          id: `ev_${Date.now()}_val`,
          sessionId: context.sessionId,
          timestamp: new Date().toISOString(),
          action: step.action_type,
          description: `Input validation failed: ${errorMsg}`,
          status: "failed",
          actor: "Policy Guardrail",
          tool: step.tool_name,
        },
      };
    }

    // 4. Mark step executing
    step.status = "executing";
    step.started_at = new Date().toISOString();
    try {
      await repos.steps.updateStep(step.id, {
        status: "executing",
        started_at: step.started_at,
      });
    } catch {}

    // 5. Execute tool
    let result: ToolResult;
    try {
      result = await tool.execute(inputValidation.data || mergedInput, context);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unexpected tool execution error";
      result = {
        success: false,
        error: { code: "TOOL_EXECUTION_EXCEPTION", message: msg },
      };
    }

    const executionTimeMs = Date.now() - startTime;

    // 6. Record tool execution
    const _executionRecord: ToolExecution = {
      id: `exec_${Date.now()}`,
      action_step_id: step.id,
      tool_id: step.tool_name,
      requested_by: context.auth.userId || null,
      input: mergedInput,
      validated_input: inputValidation.data || mergedInput,
      output: result.data || null,
      status: result.success ? "success" : "failed",
      execution_time_ms: executionTimeMs,
      error: result.error?.message || null,
      created_at: new Date().toISOString(),
    };

    // 7. Update step record
    step.status = result.success ? "completed" : "failed";
    step.output = result.data || null;
    step.error = result.error?.message || null;
    step.completed_at = new Date().toISOString();

    try {
      await repos.steps.updateStep(step.id, {
        status: step.status,
        output: step.output,
        error: step.error,
        completed_at: step.completed_at,
      });
    } catch {}

    // 8. Record audit log via repository
    await repos.audit.log({
      organization_id: context.auth.organizationId,
      user_id: context.auth.userId || null,
      session_id: context.sessionId,
      action: `TOOL_EXECUTE_${step.tool_name.toUpperCase()}`,
      resource_type: "action_step",
      resource_id: null,
      old_value: null,
      new_value: { status: step.status, output: result.data },
      ip_address: "127.0.0.1",
      user_agent: "ActionOS-Engine/1.0",
    });

    // 9. Build signature Action Ledger Event
    let actorLabel: ActionLedgerEvent["actor"] = "ActionOS Engine";
    if (step.tool_name === "request_payment" || step.tool_name === "verify_payment") {
      actorLabel = "Payment Gateway";
    }

    let description = step.description;
    if (result.success && result.data) {
      if (step.tool_name === "get_customer") {
        description = `Customer identity verified (${result.data.full_name})`;
      } else if (step.tool_name === "get_policy") {
        const meta = result.data.metadata as Record<string, unknown> | undefined;
        description = `Policy ${result.data.policy_number} found for ${meta?.vehicle_name || "vehicle"}`;
      } else if (step.tool_name === "check_renewal_eligibility") {
        description = `Eligibility confirmed (${result.data.daysUntilExpiry} days before expiry)`;
      } else if (step.tool_name === "get_quote") {
        description = `Quote generated — ₦${result.data.quoteAmount?.toLocaleString()}`;
      } else if (step.tool_name === "request_payment") {
        description = `Payment initiated (Ref: ${result.data.reference})`;
      } else if (step.tool_name === "verify_payment") {
        description = `Payment verified independently (₦${result.data.amount?.toLocaleString()} settled)`;
      } else if (step.tool_name === "renew_policy") {
        description = `Policy renewed through ${result.data.newExpiry}`;
      } else if (step.tool_name === "generate_certificate") {
        description = `Renewal certificate issued (${result.data.documentNumber})`;
      } else if (step.tool_name === "send_notification") {
        description = `Customer notified across ${result.data.notificationsSent} channels`;
      } else if (step.tool_name === "schedule_reminder") {
        description = `Scheduled reminders for 30, 14, 7, and 1 day before expiry`;
      }
    } else if (!result.success) {
      description = `Failed: ${result.error?.message || "Execution error"}`;
    }

    const ledgerEvent: ActionLedgerEvent = {
      id: `ev_${Date.now()}_${step.sequence}`,
      sessionId: context.sessionId,
      timestamp: new Date().toISOString(),
      action: step.action_type,
      description,
      status: result.success ? "verified" : "failed",
      actor: actorLabel,
      tool: step.tool_name,
      durationMs: executionTimeMs,
      referenceId: (result.data?.reference as string) || (result.data?.documentNumber as string),
    };

    return {
      result,
      executionTimeMs,
      ledgerEvent,
    };
  }
}
