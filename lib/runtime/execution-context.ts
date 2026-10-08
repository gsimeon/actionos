export {
  resolveExecutionContext,
  DEMO_CONTEXT,
  AuthContextError,
  type AuthenticatedExecutionContext,
} from "@/lib/security/auth-context";
export type { WorkflowExecutionContext } from "@/types/actionos";
import type { AuthenticatedExecutionContext, WorkflowExecutionContext, ChannelType } from "@/types/actionos";

export function createWorkflowExecutionContext(
  auth: AuthenticatedExecutionContext,
  options: {
    sessionId: string;
    planId?: string;
    stepId?: string;
    channel?: ChannelType;
    language?: string;
    isSimulated?: boolean;
  }
): WorkflowExecutionContext {
  return {
    auth,
    sessionId: options.sessionId,
    planId: options.planId,
    stepId: options.stepId,
    channel: options.channel || "web",
    language: options.language,
    isSimulated: options.isSimulated ?? false,
  };
}
