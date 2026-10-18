import { NextResponse } from "next/server";
import { getRepositoryContainer } from "@/lib/repositories";

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
    const requestedCustomerId = url.searchParams.get("customerId") || undefined;
    const policyId = url.searchParams.get("policyId") || undefined;

    if (requestedCustomerId) {
      if (context.role === "customer" && context.customerId && requestedCustomerId !== context.customerId) {
        return NextResponse.json(
          { success: false, error: { code: "FORBIDDEN", message: "Cannot access renewals for another customer" } },
          { status: 403 }
        );
      }
      tenant.customerId = requestedCustomerId;
    }

    if (policyId) {
      const renewal = await repos.renewals.findByPolicyId(policyId, tenant);
      return NextResponse.json({
        success: true,
        data: renewal ? [renewal] : [],
      });
    }

    const renewals = await repos.renewals.findAll({ status, tenant });

    return NextResponse.json({
      success: true,
      data: renewals,
    });
  } catch (err: unknown) {
    const { AuthContextError } = await import("@/lib/security/auth-context");
    if (err instanceof AuthContextError) {
      return NextResponse.json(
        { success: false, error: { code: err.code, message: err.message } },
        { status: err.code === "UNAUTHORIZED" ? 401 : 403 }
      );
    }
    const message = err instanceof Error ? err.message : "Failed to fetch renewals";
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message } },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { resolveExecutionContext } = await import("@/lib/security/auth-context");
    const { createRenewalSchema } = await import("@/lib/validations");

    const context = await resolveExecutionContext(req);
    const tenant = {
      organizationId: context.organizationId,
      customerId: context.customerId,
      role: context.role,
    };

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { code: "BAD_REQUEST", message: "Malformed JSON payload" } },
        { status: 400 }
      );
    }

    const validated = createRenewalSchema.safeParse(json);
    if (!validated.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: validated.error.issues[0]?.message || "Invalid renewal creation request",
            details: validated.error.issues,
          },
        },
        { status: 400 }
      );
    }

    const { data } = validated;

    // Enforce customer boundary: customer cannot submit another customer's ID
    if (context.role === "customer" && context.customerId && data.customer_id && data.customer_id !== context.customerId) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Cannot create renewal for another customer" } },
        { status: 403 }
      );
    }

    const repos = getRepositoryContainer();

    // Verify policy existence and tenant accessibility
    let policy = await repos.policies.findById(data.policy_id, tenant);
    if (!policy) {
      policy = await repos.policies.findByNumber(data.policy_id, tenant);
    }

    if (!policy) {
      return NextResponse.json(
        { success: false, error: { code: "POLICY_NOT_FOUND", message: "Policy not found or access denied within tenant scope" } },
        { status: 404 }
      );
    }

    // Verify policy ownership for customer role
    if (context.role === "customer" && context.customerId && policy.customer_id !== context.customerId) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Cannot create renewal for a policy belonging to another customer" } },
        { status: 403 }
      );
    }

    // Authoritative target customer derived strictly from policy or authenticated context
    const targetCustomerId = policy.customer_id;

    // Create renewal: status, currency, and payment_status are strictly server-determined
    const newRenewal = await repos.renewals.create(
      {
        policy_id: policy.id,
        customer_id: targetCustomerId,
        scheduled_for: data.scheduled_for || new Date().toISOString().split("T")[0],
        days_before_expiry: data.days_before_expiry ?? 7,
        status: "scheduled", // Server strictly controls initial state (prevents client injecting 'completed' or 'bypassed')
        quote_amount: typeof data.quote_amount === "number" ? data.quote_amount : policy.premium ?? null,
        currency: "NGN", // Server strictly enforces statutory currency
        payment_status: "pending", // Server strictly initializes payment status
      },
      tenant
    );

    return NextResponse.json({
      success: true,
      data: newRenewal,
    });
  } catch (err: unknown) {
    const { AuthContextError } = await import("@/lib/security/auth-context");
    if (err instanceof AuthContextError) {
      return NextResponse.json(
        { success: false, error: { code: err.code, message: err.message } },
        { status: err.code === "UNAUTHORIZED" ? 401 : 403 }
      );
    }
    const message = err instanceof Error ? err.message : "Failed to record renewal";
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message } },
      { status: 500 }
    );
  }
}

