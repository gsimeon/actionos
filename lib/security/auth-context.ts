import type { MemberRole } from "@/types/database";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isDemoMode } from "@/lib/runtime/mode";

export interface ExecutionContext {
  userId: string;
  profileId: string;
  organizationId: string;
  role: MemberRole;
  customerId?: string;
  isDemo: boolean;
}

// Canonical Demo/Competition Benchmark Context strictly for offline sandbox mode
export const DEMO_CONTEXT: ExecutionContext = {
  userId: "f0000000-0000-0000-0000-000000000001",
  profileId: "b0000000-0000-0000-0000-000000000003",
  organizationId: "a0000000-0000-0000-0000-000000000001",
  role: "customer",
  customerId: "f0000000-0000-0000-0000-000000000001",
  isDemo: true,
};

export class AuthContextError extends Error {
  constructor(
    public readonly code: "UNAUTHORIZED" | "PROFILE_NOT_FOUND" | "FORBIDDEN" | "AUTH_ERROR",
    message: string
  ) {
    super(message);
    this.name = "AuthContextError";
  }
}

/**
 * Derives cryptographic execution context server-side.
 * Never trusts client-supplied organizationId, customerId, or role.
 * 
 * Strict Enforcement:
 * - In demo mode (ACTIONOS_RUNTIME_MODE=demo or DEMO_MODE=true): returns DEMO_CONTEXT
 * - In production mode:
 *     * Missing session -> 401 UNAUTHORIZED
 *     * Supabase error -> 401/500 AUTH_ERROR
 *     * Missing profile -> 403 PROFILE_NOT_FOUND
 *     * Missing organization membership -> 403 FORBIDDEN
 *   Never falls back to demo context on error or unauthenticated state.
 */
export async function resolveExecutionContext(req?: Request): Promise<ExecutionContext> {
  // If explicitly configured for demo/competition sandbox
  if (isDemoMode()) {
    return DEMO_CONTEXT;
  }

  // Production mode: zero tolerance for unauthenticated or malformed requests
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    throw new AuthContextError(
      "AUTH_ERROR",
      "Production environment misconfigured: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required"
    );
  }

  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      supabaseUrl,
      publishableKey,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {
            // Read-only during execution context verification
          },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      throw new AuthContextError("AUTH_ERROR", `Authentication verification error: ${authError.message}`);
    }

    if (!user) {
      throw new AuthContextError("UNAUTHORIZED", "No active authenticated session found. Please authenticate.");
    }

    // Resolve profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (profileError) {
      throw new AuthContextError("AUTH_ERROR", `Failed querying profile: ${profileError.message}`);
    }

    if (!profile) {
      throw new AuthContextError("PROFILE_NOT_FOUND", `User profile not found for auth user ID: ${user.id}`);
    }

    // Resolve organization membership & role
    const { data: member, error: memberError } = await supabase
      .from("organization_members")
      .select("organization_id, role")
      .eq("profile_id", profile.id)
      .eq("status", "active")
      .maybeSingle();

    if (memberError) {
      throw new AuthContextError("AUTH_ERROR", `Failed querying organization membership: ${memberError.message}`);
    }

    if (!member) {
      throw new AuthContextError("FORBIDDEN", `No active organization membership found for profile ${profile.id}`);
    }

    // Resolve linked customer if customer role
    const { data: customer } = await supabase
      .from("customers")
      .select("id")
      .eq("profile_id", profile.id)
      .maybeSingle();

    return {
      userId: user.id,
      profileId: profile.id,
      organizationId: member.organization_id,
      role: member.role as MemberRole,
      customerId: customer?.id,
      isDemo: false,
    };
  } catch (err: unknown) {
    if (err instanceof AuthContextError) {
      throw err;
    }
    // Fail secure: never return DEMO_CONTEXT in production on unhandled exceptions
    throw new AuthContextError(
      "AUTH_ERROR",
      `Authentication resolution failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
