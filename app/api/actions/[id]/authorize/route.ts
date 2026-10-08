import { NextResponse } from "next/server";
import { orchestrator } from "@/lib/actionos/orchestrator";
import { authorizeActionSchema } from "@/lib/validations";
import { getStore } from "@/lib/actionos/mock-store";
import type { AuthorizationDetails } from "@/types/actionos";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const store = getStore();
    const session = store.sessions.find((s) => s.id === id);

    // 1. Session exists check
    if (!session) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: `Action session '${id}' was not found.` },
        },
        { status: 404 }
      );
    }

    // 2. Action is awaiting authorization check
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

    // 3. Quote has not expired check
    const authDetails = session.metadata?.authorizationDetails as AuthorizationDetails | undefined;
    if (authDetails?.expiresAt) {
      const expiresAtTime = new Date(authDetails.expiresAt).getTime();
      if (Date.now() > expiresAtTime) {
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

    // 4. Execute the remainder of the workflow with optional marketplace selection and saga failure simulation
    const result = await orchestrator.authorizeAndExecute(
      id,
      validated.data.authorized,
      "customer",
      {
        selectedUnderwriter: validated.data.selectedUnderwriter,
        customAmount: validated.data.customAmount,
        authMethod: validated.data.authMethod,
        simulateSagaFailure: validated.data.simulateSagaFailure,
      }
    );

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Authorization processing failed";
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "AUTHORIZATION_ERROR",
          message,
        },
      },
      { status: 500 }
    );
  }
}
