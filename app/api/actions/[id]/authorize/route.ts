import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { orchestrator } from "@/lib/actionos/orchestrator";
import { authorizeActionSchema } from "@/lib/validations";
import { getRepositoryContainer } from "@/lib/repositories";
import { resolveExecutionContext } from "@/lib/security/auth-context";
import { isProductionMode } from "@/lib/runtime/mode";
import type { AuthorizationDetails } from "@/types/actionos";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let callerContext: { organizationId?: string; customerId?: string } | undefined;
  let sessionId: string | undefined;

  try {
    const { id } = await params;
    sessionId = id;
    const json = await req.json();
    const validated = authorizeActionSchema.safeParse(json);

    if (!validated.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: validated.error.issues[0]?.message || "Invalid payload",
          },
        },
        { status: 400 }
      );
    }

    // 0. Fault injection check: prohibited in production mode
    if (isProductionMode() && validated.data.simulateSagaFailure) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Fault injection (simulateSagaFailure) is strictly disabled in production mode.",
          },
        },
        { status: 403 }
      );
    }

    // 1. Resolve authenticated identity & verified RBAC role server-side
    const context = await resolveExecutionContext(req);
    callerContext = context;

    // In production, reject arbitrary custom amounts that are not tied to a quote
    const requestedQuoteId = validated.data.authorizedQuoteId || validated.data.quoteId;
    const hasCustomAmount = validated.data.customAmount !== undefined && validated.data.customAmount !== null;
    if (hasCustomAmount) {
      if (typeof validated.data.customAmount !== "number" || isNaN(validated.data.customAmount) || validated.data.customAmount <= 0) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: "customAmount must be a positive numeric value.",
            },
          },
          { status: 400 }
        );
      }
      if (isProductionMode() && !requestedQuoteId) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: "Arbitrary customAmount is rejected in production. Authorization must bind to an authorizedQuoteId.",
            },
          },
          { status: 400 }
        );
      }
    }

    // 2. Query session with defense-in-depth tenant boundary
    const repos = getRepositoryContainer();
    const session = await repos.sessions.findById(id, {
      organizationId: context.organizationId,
      customerId: context.customerId,
      role: context.role,
    });

    if (!session) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: `Action session '${id}' was not found.` },
        },
        { status: 404 }
      );
    }

    // 3. Idempotent check: if session is already completed or in-flight, return safe response
    if (session.status === "completed") {
      const existingEvents = (await repos.ledger.getEventsBySessionId(session.id, context)) || [];
      return NextResponse.json(
        {
          success: true,
          actionStatus: "completed",
          message: "Action session was already completed successfully.",
          data: {
            sessionId: session.id,
            status: "completed",
            events: existingEvents,
          },
        },
        { status: 200 }
      );
    }

    if (session.status === "executing" || session.status === "verifying") {
      const existingEvents = (await repos.ledger.getEventsBySessionId(session.id, context)) || [];
      return NextResponse.json(
        {
          success: true,
          actionStatus: session.status,
          message: `Action session is currently ${session.status}. Please check back shortly.`,
          data: {
            sessionId: session.id,
            status: session.status,
            events: existingEvents,
          },
        },
        { status: 202 }
      );
    }

    if (session.status !== "awaiting_authorization") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_STATE",
            message: `Session is in '${session.status}' state, not awaiting authorization.`,
          },
        },
        { status: 400 }
      );
    }

    // 4. Authoritative quote validation & expiry check against persisted quote entity
    const targetQuoteId = requestedQuoteId || (session.metadata?.authorizationDetails as AuthorizationDetails | undefined)?.quoteId;
    if (targetQuoteId && validated.data.authorized) {
      const quoteMap = session.metadata?.providerToCanonicalQuoteMap as Record<string, string> | undefined;
      const canonicalQuoteId = quoteMap?.[targetQuoteId] || targetQuoteId;
      const persistedQuote = await repos.quotes.findById(canonicalQuoteId, {
        organizationId: context.organizationId,
        customerId: context.customerId,
        role: context.role,
      });

      if (!persistedQuote) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "QUOTE_NOT_FOUND",
              message: `Requested quote '${targetQuoteId}' was not found or does not belong to tenant.`,
            },
          },
          { status: 404 }
        );
      }

      if (new Date(persistedQuote.expires_at).getTime() < Date.now()) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "QUOTE_EXPIRED",
              message: "The renewal quote has expired. Please request a refreshed quote.",
            },
          },
          { status: 400 }
        );
      }
    }

    // 5. Execute the remainder of the workflow with validated caller execution context
    const result = await orchestrator.authorizeAndExecute(
      id,
      validated.data.authorized,
      context,
      {
        quoteId: requestedQuoteId,
        authorizedQuoteId: requestedQuoteId,
        selectedUnderwriter: validated.data.selectedUnderwriter,
        customAmount: validated.data.customAmount,
        authMethod: validated.data.authMethod,
        simulateSagaFailure: validated.data.simulateSagaFailure,
      }
    );

    if (result.status === "completed") {
      return NextResponse.json(
        {
          success: true,
          actionStatus: "completed",
          message: result.message,
          data: result,
        },
        { status: 200 }
      );
    }

    if (result.status === "awaiting_authorization" || result.status === "executing" || result.status === "verifying") {
      return NextResponse.json(
        {
          success: true,
          actionStatus: result.status,
          message: result.message,
          data: result,
        },
        { status: 202 }
      );
    }

    if (result.status === "cancelled") {
      return NextResponse.json(
        {
          success: false,
          actionStatus: "cancelled",
          error: {
            code: "ACTION_CANCELLED",
            message: result.message,
          },
          data: result,
        },
        { status: 422 }
      );
    }

    if (result.status === "escalated") {
      return NextResponse.json(
        {
          success: false,
          actionStatus: "escalated",
          error: {
            code: "ACTION_ESCALATED",
            message: result.message,
          },
          data: result,
        },
        { status: 422 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        actionStatus: result.status,
        error: {
          code: "ACTION_FAILED",
          message: result.message,
        },
        data: result,
      },
      { status: 422 }
    );
  } catch (err: unknown) {
    const { AuthContextError } = await import("@/lib/security/auth-context");
    if (err instanceof AuthContextError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: err.code,
            message: err.message,
          },
        },
        { status: err.code === "UNAUTHORIZED" ? 401 : 403 }
      );
    }

    const correlationId = `corr_${crypto.randomUUID()}`;
    console.error(
      JSON.stringify({
        correlationId,
        sessionId,
        organizationId: callerContext?.organizationId,
        endpoint: "POST /api/actions/[id]/authorize",
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      })
    );

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "ORCHESTRATION_ERROR",
          message: "We could not complete this action.",
          correlationId,
        },
      },
      { status: 500 }
    );
  }
}
