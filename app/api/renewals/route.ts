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
    const context = await resolveExecutionContext(req);
    const tenant = {
      organizationId: context.organizationId,
      customerId: context.customerId,
      role: context.role,
    };

    const json = await req.json();

    if (context.role === "customer" && context.customerId && json.customer_id !== context.customerId) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Cannot create renewal for another customer" } },
        { status: 403 }
      );
    }

    const repos = getRepositoryContainer();

    const newRenewal = await repos.renewals.create({
      policy_id: json.policy_id,
      customer_id: json.customer_id || context.customerId,
      scheduled_for: json.scheduled_for || new Date().toISOString().split("T")[0],
      days_before_expiry: json.days_before_expiry || 7,
      status: json.status || "scheduled",
      quote_amount: typeof json.quote_amount === "number" ? json.quote_amount : null,
      currency: json.currency || "NGN",
      payment_status: "pending",
    }, tenant);

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
