import { NextResponse } from "next/server";
import { resolveExecutionContext } from "@/lib/security/auth-context";
import { renewDriverLicenseSchema } from "@/lib/validations";
import { createWorkflowExecutionContext } from "@/lib/runtime/execution-context";
import { RenewDriverLicenseTool } from "@/lib/actionos/tools/renew-driver-license";
import { normalizeNigerianLanguage } from "@/lib/ai/nigerian-languages";

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = renewDriverLicenseSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message || "Invalid driver license renewal payload",
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
            message: "Production identity error: no linked customer record found for driver license renewal.",
          },
        },
        { status: 403 }
      );
    }

    const workflowContext = createWorkflowExecutionContext(context, {
      sessionId: `sess_dl_${Date.now()}`,
      planId: "plan_driver_license_renewal",
      channel: "api",
      language: targetLang,
      isSimulated: context.isDemo,
    });

    const tool = new RenewDriverLicenseTool();
    const result = await tool.execute(
      {
        customerId: targetCustomerId,
        dlNumber: parsed.data.dlNumber,
        durationYears: parsed.data.durationYears === 5 ? 5 : 3,
        captureCenterId: parsed.data.captureCenterId,
        paymentReference: parsed.data.paymentReference,
        language: targetLang,
      },
      workflowContext
    );

    if (!result.success || !result.data) {
      const code = result.error?.code || "RENEWAL_FAILED";
      const status =
        code === "DL_INVALID_OR_REVOKED" || code === "FRSC_LOOKUP_FAILED"
          ? 404
          : code === "FORBIDDEN"
          ? 403
          : code === "MISSING_CUSTOMER_ID"
          ? 400
          : 422;

      return NextResponse.json(
        {
          success: false,
          error: result.error || { code: "RENEWAL_FAILED", message: "Driver license renewal failed." },
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
          message: err instanceof Error ? err.message : "Internal server error during driver license renewal",
        },
      },
      { status: 500 }
    );
  }
}
