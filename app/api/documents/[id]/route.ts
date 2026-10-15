import { NextResponse } from "next/server";
import { getRepositoryContainer } from "@/lib/repositories";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const repos = getRepositoryContainer();
    const doc = await repos.documents.findById(id, tenant);

    if (!doc) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: `Document ${id} not found` } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: doc,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch document";
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message } },
      { status: 500 }
    );
  }
}
