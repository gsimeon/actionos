import { NextResponse } from "next/server";
import { orchestrator } from "@/lib/actionos/orchestrator";
import { createActionSchema } from "@/lib/validations";
import { resolveExecutionContext, AuthContextError } from "@/lib/security/auth-context";

export async function POST(req: Request) {
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

    return NextResponse.json({
      success: true,
      data: result,
    });
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

    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "ORCHESTRATION_ERROR",
          message,
        },
      },
      { status: 500 }
    );
  }
}
