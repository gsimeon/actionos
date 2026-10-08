import { NextResponse } from "next/server";
import { getRepositoryContainer } from "@/lib/repositories";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { resolveExecutionContext } = await import("@/lib/security/auth-context");
    const context = await resolveExecutionContext(req);

    // Tenant isolation: customers cannot inspect other customer records
    if (context.role === "customer" && context.customerId && context.customerId !== id) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Access to another customer's record is denied" } },
        { status: 403 }
      );
    }

    const tenant = {
      organizationId: context.organizationId,
      customerId: context.customerId,
      role: context.role,
    };

    const repos = getRepositoryContainer();
    const customer = await repos.customers.findById(id, tenant);

    if (!customer) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Customer not found" } },
        { status: 404 }
      );
    }

    const policies = await repos.policies.findByCustomerId(id, tenant);
    const documents = await repos.documents.findByCustomerId(id, tenant);

    return NextResponse.json({
      success: true,
      data: {
        customer,
        policies,
        documents,
      },
    });
  } catch (err: unknown) {
    const { AuthContextError } = await import("@/lib/security/auth-context");
    if (err instanceof AuthContextError) {
      return NextResponse.json(
        { success: false, error: { code: err.code, message: err.message } },
        { status: err.code === "UNAUTHORIZED" ? 401 : 403 }
      );
    }
    const message = err instanceof Error ? err.message : "Failed to fetch customer";
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message } },
      { status: 500 }
    );
  }
}
