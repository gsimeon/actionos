import type { MemberRole } from "@/types/database";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export interface ExecutionContext {
  userId: string;
  profileId: string;
  organizationId: string;
  role: MemberRole;
  customerId?: string;
  isDemo: boolean;
}

// Canonical Demo/Competition Benchmark Context
const DEMO_CONTEXT: ExecutionContext = {
  userId: "f0000000-0000-0000-0000-000000000001",
  profileId: "b0000000-0000-0000-0000-000000000003",
  organizationId: "a0000000-0000-0000-0000-000000000001",
  role: "customer",
  customerId: "f0000000-0000-0000-0000-000000000001",
  isDemo: true,
};

export class AuthContextError extends Error {
  constructor(
    public readonly code: "UNAUTHORIZED" | "PROFILE_NOT_FOUND" | "AUTH_ERROR",
    message: string
  ) {
    super(message);
    this.name = "AuthContextError";
  }
}

/**
 * Derives cryptographic execution context server-side.
 * Never trusts client-supplied organizationId, customerId, or role.
 */
export async function resolveExecutionContext(req?: Request): Promise<ExecutionContext> {
  const isExplicitDemo = process.env.DEMO_MODE === "true";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  // If in pure offline demo mode without live Supabase configured
  if (isExplicitDemo || !supabaseUrl || supabaseUrl.includes("demo.supabase.co")) {
    return DEMO_CONTEXT;
  }

  // In production mode: strict authentication enforcement
  const cookieStore = await cookies();
  const supabase = createServerClient(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "",
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Read-only in execution context resolution
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
  const { data: member } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("profile_id", profile.id)
    .eq("status", "active")
    .maybeSingle();

  // Check if customer
  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle();

  return {
    userId: user.id,
    profileId: profile.id,
    organizationId: member?.organization_id || "a0000000-0000-0000-0000-000000000001",
    role: (member?.role as MemberRole) || "customer",
    customerId: customer?.id || undefined,
    isDemo: false,
  };
}
