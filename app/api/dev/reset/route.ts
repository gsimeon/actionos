import { NextResponse } from "next/server";
import { getRepositoryContainer } from "@/lib/repositories";
import { resetStore } from "@/lib/actionos/mock-store";
import { resolveExecutionContext, AuthContextError } from "@/lib/security/auth-context";

const AUTHORIZED_RESET_ROLES = ["admin", "super_admin", "manager"];

export async function POST(req: Request) {
  const repos = getRepositoryContainer();

  // 1. Strict guard: Dev reset is strictly prohibited in production mode
  if (!repos.isDemo) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Dev reset endpoint is strictly disabled in production PostgreSQL mode.",
        },
      },
      { status: 403 }
    );
  }

  // 2. Feature flag guard: Must be explicitly enabled in development environment
  const isResetEnabled =
    process.env.ENABLE_DEMO_RESET === "true" ||
    process.env.ACTIONOS_ALLOW_DEV_RESET === "true";

  if (!isResetEnabled) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Dev reset endpoint is disabled. Set ENABLE_DEMO_RESET=true in development environment to enable.",
        },
      },
      { status: 403 }
    );
  }

  // 3. Authentication: Require verified authenticated identity
  let context;
  try {
    context = await resolveExecutionContext(req);
  } catch (error: unknown) {
    if (error instanceof AuthContextError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
          },
        },
        { status: error.code === "UNAUTHORIZED" ? 401 : 403 }
      );
    }
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required to perform store reset.",
        },
      },
      { status: 401 }
    );
  }

  // 4. Authorization: Require verified operator/administrator role
  if (!context || !AUTHORIZED_RESET_ROLES.includes(context.role)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "FORBIDDEN",
          message: `Forbidden: store reset requires administrator or operator privileges. Current role: '${context?.role || "unassigned"}'.`,
        },
      },
      { status: 403 }
    );
  }

  // 5. Authorized reset execution
  resetStore();
  return NextResponse.json({
    success: true,
    message: "ActionOS demo store reset to clean benchmark state.",
    operator: {
      userId: context.userId,
      role: context.role,
      resetAt: new Date().toISOString(),
    },
  });
}

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "State-mutating reset is strictly prohibited via GET. Use POST with administrator authorization.",
      },
    },
    {
      status: 405,
      headers: { Allow: "POST" },
    }
  );
}

