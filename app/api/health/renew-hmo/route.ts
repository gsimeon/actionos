import { NextResponse } from "next/server";
import { resolveExecutionContext } from "@/lib/security/auth-context";
import { renewHmoPolicySchema } from "@/lib/validations";
import { createWorkflowExecutionContext } from "@/lib/runtime/execution-context";
import { RenewHmoPolicyTool } from "@/lib/actionos/tools/renew-hmo-policy";
import { normalizeNigerianLanguage } from "@/lib/ai/nigerian-languages";

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = renewHmoPolicySchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message || "Invalid HMO renewal payload",
            details: parsed.error.issues,
          },
        },
        { status: 400 }
      );
    }

    const context = await resolveExecutionContext(req);
    const targetLang = normalizeNigerianLanguage(parsed.data.language);

    let targetCustomerId = context.customerId;
    if (context.isDemo && parsed.data.customerId) {
      targetCustomerId = parsed.data.customerId;
    } else if (!context.isDemo && context.role !== "customer" && parsed.data.customerId) {
      targetCustomerId = parsed.data.customerId;
    }

    if (!context.isDemo && !targetCustomerId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Production identity error: no linked customer record found for HMO renewal.",
          },
        },
        { status: 403 }
      );
    }

    const workflowContext = createWorkflowExecutionContext(context, {
      sessionId: `sess_hmo_${Date.now()}`,
      planId: "plan_hmo_renewal",
      channel: "api",
      language: targetLang,
      isSimulated: context.isDemo,
    });

    const tool = new RenewHmoPolicyTool();
    const result = await tool.execute(
      {
        customerId: targetCustomerId,
        nhiaNumber: parsed.data.nhiaNumber,
        nin: parsed.data.nin,
        tier: parsed.data.tier,
        primaryHcpName: parsed.data.primaryHcpName,
        primaryHcpId: parsed.data.primaryHcpId,
        dependentsCount: parsed.data.dependentsCount,
        paymentReference: parsed.data.paymentReference,
        expectedAmount: parsed.data.expectedAmount,
        language: targetLang,
      },
      workflowContext
    );

    if (!result.success || !result.data) {
      const code = result.error?.code || "RENEWAL_FAILED";
      const status =
        code === "ENROLLEE_NOT_FOUND"
          ? 404
          : code === "FORBIDDEN"
          ? 403
          : code === "MISSING_CUSTOMER_ID"
          ? 400
          : 422;

      return NextResponse.json(
        {
          success: false,
          error: result.error || { code: "RENEWAL_FAILED", message: "HMO renewal failed." },
        },
        { status }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: result.data.localizedMessage,
        data: result.data,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: err instanceof Error ? err.message : "Internal server error during HMO renewal",
        },
      },
      { status: 500 }
    );
  }
}
