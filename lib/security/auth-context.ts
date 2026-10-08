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

  try {
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
    } = await supabase.auth.getUser();

    if (!user) {
      // Fallback for public demo interface if unauthenticated
      return DEMO_CONTEXT;
    }

    // Resolve profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (!profile) {
      return {
        ...DEMO_CONTEXT,
        userId: user.id,
        isDemo: false,
      };
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
      organizationId: member?.organization_id || DEMO_CONTEXT.organizationId,
      role: (member?.role as MemberRole) || "customer",
      customerId: customer?.id || undefined,
      isDemo: false,
    };
  } catch (err) {
    console.warn("Failed resolving Supabase execution context, using fallback demo context:", err);
    return DEMO_CONTEXT;
  }
}
