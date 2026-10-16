import { NextResponse } from "next/server";
import { resolveExecutionContext, AuthContextError } from "@/lib/security/auth-context";
import { renewVehicleLicenseSchema } from "@/lib/validations";
import { createWorkflowExecutionContext } from "@/lib/runtime/execution-context";
import { RenewVehicleLicenseTool } from "@/lib/actionos/tools/renew-vehicle-license";
import { normalizeNigerianLanguage } from "@/lib/ai/nigerian-languages";

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = renewVehicleLicenseSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message || "Invalid vehicle license renewal payload",
            details: parsed.error.issues,
          },
        },
        { status: 400 }
      );
    }

    const context = await resolveExecutionContext(req);
    const targetLang = normalizeNigerianLanguage(parsed.data.language);

    // Resolve target customer with strict tenant boundary enforcement
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
            message: "Production identity error: no linked customer record found for vehicle renewal.",
          },
        },
        { status: 403 }
      );
    }

    const workflowContext = createWorkflowExecutionContext(context, {
      sessionId: `sess_veh_lic_${Date.now()}`,
      planId: "plan_vehicle_license_renewal",
      channel: "api",
      language: targetLang,
      isSimulated: context.isDemo,
    });

    const tool = new RenewVehicleLicenseTool();
    const result = await tool.execute(
      {
        customerId: targetCustomerId,
        vehiclePlate: parsed.data.vehiclePlate,
        vin: parsed.data.vin,
        chassisNumber: parsed.data.chassisNumber,
        licenseDurationMonths: parsed.data.licenseDurationMonths,
        includeRoadworthiness: parsed.data.includeRoadworthiness,
        paymentReference: parsed.data.paymentReference,
        expectedAmount: parsed.data.expectedAmount,
        language: targetLang,
      },
      workflowContext
    );

    if (!result.success || !result.data) {
      const code = result.error?.code || "RENEWAL_FAILED";
      const status =
        code === "VEHICLE_NOT_FOUND"
          ? 404
          : code === "FORBIDDEN"
          ? 403
          : code === "MISSING_CUSTOMER_ID"
          ? 400
          : 422;

      return NextResponse.json(
        {
          success: false,
          error: result.error || { code: "RENEWAL_FAILED", message: "Vehicle renewal did not return data." },
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
    if (err instanceof AuthContextError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: err.code,
            message: err.message,
          },
        },
        { status: err.code === "UNAUTHORIZED" ? 401 : 403 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: err instanceof Error ? err.message : "Vehicle license renewal failed",
        },
      },
      { status: 500 }
    );
  }
}
