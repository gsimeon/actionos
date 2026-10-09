import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { orchestrator } from "@/lib/actionos/orchestrator";
import { createActionSchema } from "@/lib/validations";
import { resolveExecutionContext, AuthContextError } from "@/lib/security/auth-context";

export async function POST(req: Request) {
  let callerOrgId: string | undefined;

  try {
    const json = await req.json();
    const validated = createActionSchema.safeParse(json);

    if (!validated.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: validated.error.issues[0]?.message || "Invalid request body",
            details: validated.error.issues,
          },
        },
        { status: 400 }
      );
    }

    // Resolve verified server-side identity & tenant context
    const context = await resolveExecutionContext(req);
    callerOrgId = context.organizationId;

    // Enforce identity boundaries: never fallback outside demo
    let targetCustomerId = context.customerId;
    if (context.isDemo && validated.data.customerId) {
      targetCustomerId = validated.data.customerId;
    } else if (!context.isDemo && context.role !== "customer" && validated.data.customerId) {
      targetCustomerId = validated.data.customerId;
    }

    if (!context.isDemo && !targetCustomerId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Production identity error: no linked customer record found for authenticated context.",
          },
        },
        { status: 403 }
      );
    }

    const result = await orchestrator.startWorkflow({
      inputText: validated.data.inputText,
      inputAudioUrl: validated.data.inputAudioUrl,
      channel: validated.data.channel,
      language: validated.data.language,
      executionContext: {
        ...context,
        customerId: targetCustomerId,
      },
    });

    if (result.status === "failed") {
      return NextResponse.json(
        {
          success: false,
          actionStatus: "failed",
          error: {
            code: "ACTION_FAILED",
            message: result.message,
          },
          data: result,
        },
        { status: 422 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        actionStatus: result.status,
        data: result,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
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
        endpoint: "POST /api/actions",
        organizationId: callerOrgId,
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
