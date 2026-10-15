import { NextResponse } from "next/server";
import { getRepositoryContainer } from "@/lib/repositories";
import type { NotificationRecord } from "@/types/database";

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
    const channel = url.searchParams.get("channel") || undefined;
    const customerId = url.searchParams.get("customerId") || undefined;
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    const notifications = await repos.notifications.findAll({
      channel,
      customerId,
      limit: Number.isFinite(limit) ? limit : undefined,
      tenant,
    });

    return NextResponse.json({
      success: true,
      data: notifications,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch notifications";
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message } },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
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
    const body = await req.json();

    const channel = (body.channel || "in_app") as NotificationRecord["channel"];
    const type = (body.type || "system_alert") as NotificationRecord["type"];
    const title = body.title || "ActionOS Notification";
    const message = body.message || "Action completed";
    const customerId = body.customerId || context.customerId || "f0000000-0000-0000-0000-000000000001";

    const created = await repos.notifications.create(
      {
        customer_id: customerId,
        type,
        channel,
        title,
        message,
        scheduled_for: new Date().toISOString(),
        metadata: body.metadata || {},
      },
      tenant
    );

    return NextResponse.json({
      success: true,
      data: created,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to dispatch notification";
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message } },
      { status: 500 }
    );
  }
}
