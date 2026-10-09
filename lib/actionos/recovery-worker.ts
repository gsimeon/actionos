import { ActionOSOrchestrator } from "@/lib/actionos/orchestrator";
import { getRepositoryContainer } from "@/lib/repositories";
import type { TenantContext } from "@/lib/repositories/interfaces";
import { webhookDispatcher } from "@/lib/actionos/webhook-dispatcher";
import type { ActionSession } from "@/types/database";

export interface RecoveryWorkerConfig {
  maxRetries: number;
  baseBackoffMs: number;
  maxBackoffMs: number;
}

export interface RecoveryExecutionResult {
  sessionId: string;
  previousStatus: ActionSession["status"];
  newStatus: ActionSession["status"];
  outcome: "reconciled" | "still_pending" | "dead_lettered" | "failed";
  attemptCount: number;
  details?: string;
  nextRetryAt?: string;
}

export interface RecoveryBatchReport {
  totalScanned: number;
  processedCount: number;
  reconciledCount: number;
  pendingCount: number;
  deadLetterCount: number;
  results: RecoveryExecutionResult[];
  executedAt: string;
}

const DEFAULT_CONFIG: RecoveryWorkerConfig = {
  maxRetries: 5,
  baseBackoffMs: 1000,
  maxBackoffMs: 60000,
};

/**
 * ActionOS Durable Recovery Worker
 * 
 * Periodically or reactively sweeps uncertain sessions (reconciliation_required,
 * requiresDeferredReconciliation, requiresManualRefund, or refundState="refund_pending"),
 * applies exponential backoff, retries reconciliation idempotently, and routes
 * persistently unresolved operations into a dead-letter operator queue.
 */
export class ActionOSRecoveryWorker {
  private orchestrator: ActionOSOrchestrator;
  private config: RecoveryWorkerConfig;

  constructor(
    orchestrator: ActionOSOrchestrator = new ActionOSOrchestrator(),
    config: Partial<RecoveryWorkerConfig> = {}
  ) {
    this.orchestrator = orchestrator;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Process a single session through the durable reconciliation recovery pipeline.
   */
  async processSession(
    sessionId: string,
    tenantContext?: TenantContext,
    force: boolean = false
  ): Promise<RecoveryExecutionResult> {
    const repos = getRepositoryContainer();
    const session = await repos.sessions.findById(sessionId, tenantContext);

    if (!session) {
      return {
        sessionId,
        previousStatus: "failed",
        newStatus: "failed",
        outcome: "failed",
        attemptCount: 0,
        details: `Session '${sessionId}' not found or tenant boundary prohibited access.`,
      };
    }

    const previousStatus = session.status;
    const metadata = (session.metadata || {}) as Record<string, unknown>;

    // 1. Check if already dead-lettered
    if (metadata.isDeadLettered === true && !force) {
      return {
        sessionId,
        previousStatus,
        newStatus: previousStatus,
        outcome: "dead_lettered",
        attemptCount: Number(metadata.reconciliationAttempts) || 0,
        details: (metadata.deadLetterReason as string) || "Session has been dead-lettered for manual operator resolution.",
      };
    }

    // 2. Check exponential backoff window
    if (!force && metadata.nextRetryAt && typeof metadata.nextRetryAt === "string") {
      const retryTime = new Date(metadata.nextRetryAt).getTime();
      if (retryTime > Date.now()) {
        return {
          sessionId,
          previousStatus,
          newStatus: previousStatus,
          outcome: "still_pending",
          attemptCount: Number(metadata.reconciliationAttempts) || 0,
          details: `Session is waiting for backoff window until ${metadata.nextRetryAt}.`,
          nextRetryAt: metadata.nextRetryAt,
        };
      }
    }

    const currentAttempts = (Number(metadata.reconciliationAttempts) || 0) + 1;

    // 3. Dead-Letter Queue (DLQ) threshold enforcement
    if (currentAttempts > this.config.maxRetries) {
      const deadLetterReason = `Max recovery attempts (${this.config.maxRetries}) exceeded without definitive settlement or refund confirmation.`;
      
      const updatedMetadata = {
        ...metadata,
        reconciliationAttempts: currentAttempts,
        isDeadLettered: true,
        deadLetteredAt: new Date().toISOString(),
        deadLetterReason,
        requiresOperatorIntervention: true,
      };

      await repos.sessions.updateStatus(sessionId, "escalated", undefined, tenantContext);
      await repos.sessions.updateMetadata(sessionId, updatedMetadata, tenantContext);

      webhookDispatcher.broadcast("recovery.dead_lettered", {
        sessionId,
        reason: deadLetterReason,
        attempts: currentAttempts,
      });

      return {
        sessionId,
        previousStatus,
        newStatus: "escalated",
        outcome: "dead_lettered",
        attemptCount: currentAttempts,
        details: deadLetterReason,
      };
    }

    // 4. Calculate exponential backoff for subsequent attempt
    const backoffMs = Math.min(
      this.config.baseBackoffMs * Math.pow(2, currentAttempts - 1),
      this.config.maxBackoffMs
    );
    const nextRetryAt = new Date(Date.now() + backoffMs).toISOString();

    await repos.sessions.updateMetadata(
      sessionId,
      {
        ...metadata,
        reconciliationAttempts: currentAttempts,
        lastReconciliationAttemptAt: new Date().toISOString(),
        nextRetryAt,
      },
      tenantContext
    );

    // 5. Execute recovery / reconciliation through the orchestrator
    const reconcileResult = await this.orchestrator.reconcileExecutingSession(sessionId, tenantContext);

    // 6. Inspect updated state to determine final outcome
    const updatedSession = await repos.sessions.findById(sessionId, tenantContext);
    const finalStatus = updatedSession ? updatedSession.status : reconcileResult.resolvedStatus;
    const finalMeta = (updatedSession?.metadata || {}) as Record<string, unknown>;

    const isResolved =
      (finalStatus === "completed" || finalStatus === "failed") &&
      finalMeta.reconciliation_required !== true &&
      finalMeta.refundState !== "refund_pending";

    if (isResolved) {
      // Clear pending reconciliation flags
      await repos.sessions.updateMetadata(
        sessionId,
        {
          ...finalMeta,
          reconciliation_required: false,
          requiresDeferredReconciliation: false,
          resolvedByRecoveryWorkerAt: new Date().toISOString(),
        },
        tenantContext
      );

      webhookDispatcher.broadcast("recovery.reconciled", {
        sessionId,
        status: finalStatus,
        attempts: currentAttempts,
      });

      return {
        sessionId,
        previousStatus,
        newStatus: finalStatus,
        outcome: "reconciled",
        attemptCount: currentAttempts,
        details: reconcileResult.message,
      };
    }

    return {
      sessionId,
      previousStatus,
      newStatus: finalStatus,
      outcome: "still_pending",
      attemptCount: currentAttempts,
      details: reconcileResult.message,
      nextRetryAt,
    };
  }

  /**
   * Sweeps and processes all pending sessions requiring recovery across the tenant or organization.
   */
  async runSweep(
    options: { organizationId?: string; limit?: number; force?: boolean } = {},
    tenantContext?: TenantContext
  ): Promise<RecoveryBatchReport> {
    const repos = getRepositoryContainer();
    const candidates = await repos.sessions.findPendingReconciliation(options, tenantContext);

    const results: RecoveryExecutionResult[] = [];
    let reconciledCount = 0;
    let pendingCount = 0;
    let deadLetterCount = 0;

    for (const session of candidates) {
      const res = await this.processSession(session.id, tenantContext, options.force);
      results.push(res);

      if (res.outcome === "reconciled") {
        reconciledCount++;
      } else if (res.outcome === "dead_lettered") {
        deadLetterCount++;
      } else {
        pendingCount++;
      }
    }

    return {
      totalScanned: candidates.length,
      processedCount: results.length,
      reconciledCount,
      pendingCount,
      deadLetterCount,
      results,
      executedAt: new Date().toISOString(),
    };
  }
}

export const defaultRecoveryWorker = new ActionOSRecoveryWorker();
