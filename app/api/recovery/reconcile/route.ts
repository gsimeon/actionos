import { NextResponse } from "next/server";
import { defaultRecoveryWorker } from "@/lib/actionos/recovery-worker";
import { resolveExecutionContext, AuthContextError } from "@/lib/security/auth-context";
import { getRepositoryContainer } from "@/lib/repositories";

export async function POST(req: Request) {
  try {
    const authContext = await resolveExecutionContext(req);
    const tenantContext = {
      organizationId: authContext.organizationId,
      customerId: authContext.customerId,
      role: authContext.role,
    };

    const body = await req.json().catch(() => ({}));
    const { sessionId, force, limit } = body as {
      sessionId?: string;
      force?: boolean;
      limit?: number;
    };

    if (sessionId) {
      const result = await defaultRecoveryWorker.processSession(sessionId, tenantContext, Boolean(force));
      return NextResponse.json({
        success: result.outcome !== "failed",
        data: result,
      });
    }

    const report = await defaultRecoveryWorker.runSweep(
      {
        organizationId: tenantContext.organizationId,
        limit: limit ? Number(limit) : undefined,
        force: Boolean(force),
      },
      tenantContext
    );

    return NextResponse.json({
      success: true,
      data: report,
    });
  } catch (error: unknown) {
    if (error instanceof AuthContextError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.code === "UNAUTHORIZED" ? 401 : 403 }
      );
    }
    const message = error instanceof Error ? error.message : "Recovery worker sweep failed";
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "RECOVERY_SWEEP_FAILED",
          message,
        },
      },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const authContext = await resolveExecutionContext(req);
    const tenantContext = {
      organizationId: authContext.organizationId,
      customerId: authContext.customerId,
      role: authContext.role,
    };

    const repos = getRepositoryContainer();
    const pendingSessions = await repos.sessions.findPendingReconciliation(
      { organizationId: tenantContext.organizationId, limit: 50 },
      tenantContext
    );

    const deadLettered = pendingSessions.filter(
      (s) => (s.metadata as Record<string, unknown> | undefined)?.isDeadLettered === true
    );
    const retryable = pendingSessions.filter(
      (s) => (s.metadata as Record<string, unknown> | undefined)?.isDeadLettered !== true
    );

    return NextResponse.json({
      success: true,
      data: {
        totalPending: pendingSessions.length,
        deadLetteredCount: deadLettered.length,
        retryableCount: retryable.length,
        deadLetterQueue: deadLettered.map((s) => ({
          sessionId: s.id,
          status: s.status,
          attempts: (s.metadata as Record<string, unknown> | undefined)?.reconciliationAttempts,
          reason: (s.metadata as Record<string, unknown> | undefined)?.deadLetterReason,
          deadLetteredAt: (s.metadata as Record<string, unknown> | undefined)?.deadLetteredAt,
        })),
        retryQueue: retryable.map((s) => ({
          sessionId: s.id,
          status: s.status,
          attempts: (s.metadata as Record<string, unknown> | undefined)?.reconciliationAttempts,
          nextRetryAt: (s.metadata as Record<string, unknown> | undefined)?.nextRetryAt,
        })),
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthContextError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.code === "UNAUTHORIZED" ? 401 : 403 }
      );
    }
    const message = error instanceof Error ? error.message : "Failed to query recovery status";
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "RECOVERY_STATUS_QUERY_FAILED",
          message,
        },
      },
      { status: 500 }
    );
  }
}
