import { NextResponse } from "next/server";
import { getRepositoryContainer } from "@/lib/repositories";
import type { AuthorizationDetails } from "@/types/actionos";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { resolveExecutionContext } = await import("@/lib/security/auth-context");
    const context = await resolveExecutionContext(_req);
    const tenant = {
      organizationId: context.organizationId,
      customerId: context.customerId,
      role: context.role,
    };

    const repos = getRepositoryContainer();
    const session = await repos.sessions.findById(id, tenant);

    if (!session) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: `Action session '${id}' not found` },
        },
        { status: 404 }
      );
    }

    const plan = await repos.plans.findBySessionId(id, tenant);
    const steps = plan ? await repos.steps.findByPlanId(plan.id, tenant) : [];
    const events = (await repos.ledger.getEventsBySessionId(id, tenant)) || [];
    const authDetails = (session.metadata?.authorizationDetails as AuthorizationDetails) || null;

    return NextResponse.json({
      success: true,
      data: {
        session: {
          id: session.id,
          status: session.status,
          intent: session.intent,
          channel: session.channel,
          language: session.language,
          inputText: session.input_text,
          startedAt: session.started_at,
          completedAt: session.completed_at,
        },
        plan: plan
          ? {
              id: plan.id,
              goal: plan.goal,
              riskLevel: plan.risk_level,
              confidence: plan.confidence,
              status: plan.status,
            }
          : null,
        steps: steps.map((s) => ({
          id: s.id,
          sequence: s.sequence,
          description: s.description,
          toolName: s.tool_name,
          status: s.status,
          requiresConfirmation: s.requires_confirmation,
          error: s.error,
        })),
        authorizationRequired: session.status === "awaiting_authorization",
        authorizationDetails: authDetails,
        events,
      },
    });
  } catch (err: unknown) {
    const { AuthContextError } = await import("@/lib/security/auth-context");
    if (err instanceof AuthContextError) {
      return NextResponse.json(
        { success: false, error: { code: err.code, message: err.message } },
        { status: err.code === "UNAUTHORIZED" ? 401 : 403 }
      );
    }
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
