import { NextResponse } from "next/server";
import { getRepositoryContainer } from "@/lib/repositories";
import { createPolicySchema } from "@/lib/validations";

export async function GET(req: Request) {
  try {
    const { resolveExecutionContext } = await import("@/lib/security/auth-context");
    const context = await resolveExecutionContext(req);
    const tenant = {
      organizationId: context.organizationId,
      customerId: context.customerId,
      role: context.role,
    };

    const repos = getRepositoryContainer();
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || undefined;

    const policies = await repos.policies.findAll({ status, tenant });

    return NextResponse.json({
      success: true,
      data: policies,
    });
  } catch (err: unknown) {
    const { AuthContextError } = await import("@/lib/security/auth-context");
    if (err instanceof AuthContextError) {
      return NextResponse.json(
        { success: false, error: { code: err.code, message: err.message } },
        { status: err.code === "UNAUTHORIZED" ? 401 : 403 }
      );
    }
    const message = err instanceof Error ? err.message : "Failed to fetch policies";
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message } },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { resolveExecutionContext } = await import("@/lib/security/auth-context");
    const context = await resolveExecutionContext(req);
    const tenant = {
      organizationId: context.organizationId,
      customerId: context.customerId,
      role: context.role,
    };

    const json = await req.json();
    const validated = createPolicySchema.safeParse(json);

    if (!validated.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: validated.error.issues[0]?.message || "Invalid policy input",
          },
        },
        { status: 400 }
      );
    }

    // Role check: customers cannot create policies for arbitrary accounts
    if (context.role === "customer" && context.customerId && validated.data.customer_id !== context.customerId) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Cannot create policy for another customer" } },
        { status: 403 }
      );
    }

    const repos = getRepositoryContainer();
    const newPolicy = await repos.policies.create({
      customer_id: validated.data.customer_id,
      provider_id: validated.data.provider_id,
      policy_type_id: validated.data.policy_type_id,
      policy_number: validated.data.policy_number,
      start_date: validated.data.start_date,
      expiry_date: validated.data.expiry_date,
      premium: validated.data.premium,
    }, tenant);

    return NextResponse.json({
      success: true,
      data: newPolicy,
    });
  } catch (err: unknown) {
    const { AuthContextError } = await import("@/lib/security/auth-context");
    if (err instanceof AuthContextError) {
      return NextResponse.json(
        { success: false, error: { code: err.code, message: err.message } },
        { status: err.code === "UNAUTHORIZED" ? 401 : 403 }
      );
    }
    const message = err instanceof Error ? err.message : "Failed to create policy";
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message } },
      { status: 500 }
    );
  }
}
