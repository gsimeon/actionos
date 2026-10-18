import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getRepositoryContainer } from "@/lib/repositories";
import { resetStore } from "@/lib/actionos/mock-store";

function verifySecretKey(provided: string | null | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) {
    crypto.timingSafeEqual(expectedBuffer, expectedBuffer);
    return false;
  }
  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function extractOperatorSecret(req: Request): string | null {
  const headerKey = req.headers.get("x-actionos-reset-key") || req.headers.get("x-dev-reset-secret");
  if (headerKey) return headerKey.trim();

  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7).trim();
  }
  return null;
}

async function verifySupabaseAdminSession(): Promise<{ userId: string; role: string } | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) return null;

  try {
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    if (!allCookies || allCookies.length === 0) return null;

    const supabase = createServerClient(supabaseUrl, publishableKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return null;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (!profile) return null;

    const { data: members } = await supabase
      .from("organization_members")
      .select("role")
      .eq("profile_id", profile.id)
      .eq("status", "active");

    const authorized = members?.find((m) =>
      ["admin", "super_admin", "manager"].includes(m.role)
    );

    if (authorized) {
      return { userId: user.id, role: authorized.role };
    }
    return null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const repos = getRepositoryContainer();

  // 1. Strict guard: Dev reset is strictly prohibited in production mode or public deployments
  if (
    !repos.isDemo ||
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  ) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Dev reset endpoint is strictly disabled in production PostgreSQL mode and public deployments.",
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

  // 3. Operator Authentication & Authorization:
  // Reject unverified client headers like x-role: admin.
  // Require either a verified developer operator secret or an authenticated Supabase admin session.
  const expectedSecret = process.env.ACTIONOS_DEV_RESET_SECRET || process.env.ACTIONOS_RESET_SECRET;
  const providedSecret = extractOperatorSecret(req);

  let verifiedOperator: { userId: string; role: string; authMethod: string } | null = null;

  if (expectedSecret && providedSecret && verifySecretKey(providedSecret, expectedSecret)) {
    verifiedOperator = {
      userId: "dev-operator-admin",
      role: "admin",
      authMethod: "operator_secret",
    };
  } else {
    // Attempt real Supabase admin session verification if cookies are present
    const sessionOperator = await verifySupabaseAdminSession();
    if (sessionOperator) {
      verifiedOperator = {
        userId: sessionOperator.userId,
        role: sessionOperator.role,
        authMethod: "supabase_session",
      };
    }
  }

  if (!verifiedOperator) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message:
            "Authentication failed: valid operator secret key or verified administrator session is required. Client-supplied role headers are untrusted and rejected.",
        },
      },
      { status: 401 }
    );
  }

  // 4. Authorized reset execution
  resetStore();
  return NextResponse.json({
    success: true,
    message: "ActionOS demo store reset to clean benchmark state.",
    operator: {
      userId: verifiedOperator.userId,
      role: verifiedOperator.role,
      authMethod: verifiedOperator.authMethod,
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

