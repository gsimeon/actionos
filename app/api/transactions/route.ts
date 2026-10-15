import { NextResponse } from "next/server";
import { getRepositoryContainer } from "@/lib/repositories";

export async function GET(req: Request) {
  try {
    const { resolveExecutionContext, AuthContextError } = await import("@/lib/security/auth-context");
    let context;
    try {
      context = await resolveExecutionContext(req);
    } catch (authErr) {
      if (authErr instanceof AuthContextError) {
        return NextResponse.json(
          { success: false, error: { code: authErr.code, message: authErr.message } },
          { status: authErr.code === "UNAUTHORIZED" ? 401 : 403 }
        );
      }
      throw authErr;
    }

    const tenant = {
      organizationId: context.organizationId,
      customerId: context.customerId,
      role: context.role,
    };

    const repos = getRepositoryContainer();
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || undefined;
    const customerId = url.searchParams.get("customerId") || undefined;
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    const transactions = await repos.transactions.findAll({
      status,
      customerId,
      limit: Number.isFinite(limit) ? limit : undefined,
      tenant,
    });

    return NextResponse.json({
      success: true,
      data: transactions,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch transactions";
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message } },
      { status: 500 }
    );
  }
}
