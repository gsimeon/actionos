import { NextResponse } from "next/server";
import { getRepositoryContainer } from "@/lib/repositories";
import { resolveExecutionContext, AuthContextError } from "@/lib/security/auth-context";
import { queryVehicleSchema, createVehicleSchema } from "@/lib/validations";
import {
  normalizeNigerianLanguage,
  formatVehicleFoundMessage,
  formatVehicleNotFoundMessage,
  formatVehicleRegisteredMessage,
} from "@/lib/ai/nigerian-languages";
import { VerifyNiidTool } from "@/lib/actionos/tools/verify-niid";
import { createWorkflowExecutionContext } from "@/lib/runtime/execution-context";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const rawParams = {
      plate: url.searchParams.get("plate") || undefined,
      vin: url.searchParams.get("vin") || url.searchParams.get("chassis") || undefined,
      engine: url.searchParams.get("engine") || undefined,
      query: url.searchParams.get("query") || url.searchParams.get("q") || undefined,
      customerId: url.searchParams.get("customerId") || undefined,
      language: url.searchParams.get("language") || url.searchParams.get("lang") || "en-NG",
    };

    const parsed = queryVehicleSchema.safeParse(rawParams);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message || "Invalid query parameters",
          },
        },
        { status: 400 }
      );
    }

    const context = await resolveExecutionContext(req);
    const targetLang = normalizeNigerianLanguage(parsed.data.language);
    const repos = getRepositoryContainer();

    // Enforce tenant boundary: customer can only query their own records
    let filterCustomerId = parsed.data.customerId;
    if (context.role === "customer" && context.customerId) {
      filterCustomerId = context.customerId;
    }

    const tenantContext = {
      organizationId: context.organizationId,
      customerId: context.customerId,
      role: context.role,
    };

    const vehicles = await repos.assets.queryVehicles({
      query: parsed.data.query,
      plate: parsed.data.plate,
      vin: parsed.data.vin,
      engineNumber: parsed.data.engine,
      customerId: filterCustomerId,
      tenant: tenantContext,
    });

    let localizedSummary = "";
    if (vehicles.length > 0) {
      const primary = vehicles[0];
      let ownerName: string | undefined;
      if (primary.customer_id) {
        const owner = await repos.customers.findById(primary.customer_id, tenantContext);
        if (owner) ownerName = owner.full_name;
      }
      localizedSummary = formatVehicleFoundMessage(primary, ownerName, targetLang);
    } else {
      const searchTerm =
        parsed.data.plate ||
        parsed.data.vin ||
        parsed.data.engine ||
        parsed.data.query ||
        "vehicle";
      localizedSummary = formatVehicleNotFoundMessage(searchTerm, targetLang);
    }

    return NextResponse.json(
      {
        success: true,
        count: vehicles.length,
        vehicles,
        localizedSummary,
        language: targetLang,
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
          message: err instanceof Error ? err.message : "Vehicle query failed",
        },
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const validated = createVehicleSchema.safeParse(json);

    if (!validated.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: validated.error.issues[0]?.message || "Invalid vehicle registration payload",
            details: validated.error.issues,
          },
        },
        { status: 400 }
      );
    }

    const context = await resolveExecutionContext(req);
    const targetLang = normalizeNigerianLanguage(validated.data.language);
    const repos = getRepositoryContainer();

    // Resolve target customer ID with strict boundary check
    let targetCustomerId = context.customerId;
    if (context.isDemo && validated.data.customerId) {
      targetCustomerId = validated.data.customerId;
    } else if (!context.isDemo && context.role !== "customer" && validated.data.customerId) {
      targetCustomerId = validated.data.customerId;
    }

    if (!context.isDemo && !targetCustomerId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Production identity error: no linked customer record found for registration.",
          },
        },
        { status: 403 }
      );
    }

    const tenantContext = {
      organizationId: context.organizationId,
      customerId: targetCustomerId,
      role: context.role,
    };

    const plate = validated.data.vehiclePlate.trim().toUpperCase();
    const vin = (validated.data.vin || validated.data.chassisNumber || `DEMO-VIN-${Math.floor(100000 + Math.random() * 900000)}`).trim().toUpperCase();
    const engine = (validated.data.engineNumber || `DEMO-ENGINE-${Math.floor(100000 + Math.random() * 900000)}`).trim().toUpperCase();

    // Verify statutory NIID registry
    const niidTool = new VerifyNiidTool();
    const workflowContext = createWorkflowExecutionContext(context, {
      sessionId: `sess_reg_${Date.now()}`,
      planId: "plan_vehicle_reg",
      channel: "api",
      language: targetLang,
      isSimulated: context.isDemo,
    });

    const niidCheck = await niidTool.execute(
      { vehiclePlate: plate, chassisNumber: vin },
      workflowContext
    );

    if (niidCheck.success && niidCheck.data?.theftFlag) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "THEFT_FLAG_DETECTED",
            message: "Vehicle has an active theft flag in statutory registry and cannot be registered.",
          },
        },
        { status: 422 }
      );
    }

    const preclearanceToken = niidCheck.data?.preclearanceToken || `NIID-${new Date().getFullYear()}-VAL-${Math.floor(100000 + Math.random() * 900000)}`;

    const createdAsset = await repos.assets.create(
      {
        customer_id: targetCustomerId!,
        asset_type: "vehicle",
        name: `${validated.data.make} ${validated.data.model}`,
        identifier: plate,
        metadata: {
          make: validated.data.make,
          model: validated.data.model,
          year: validated.data.year,
          color: validated.data.color,
          chassis_number: vin,
          vin,
          engine_number: engine,
          preclearance_token: preclearanceToken,
          registration_status: "registered",
          verified_at: new Date().toISOString(),
        },
      },
      tenantContext
    );

    const localizedMessage = formatVehicleRegisteredMessage(createdAsset, preclearanceToken, targetLang);

    return NextResponse.json(
      {
        success: true,
        data: {
          registered: true,
          vehicle: createdAsset,
          preclearanceToken,
          localizedMessage,
          language: targetLang,
        },
      },
      { status: 201 }
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
          message: err instanceof Error ? err.message : "Vehicle registration failed",
        },
      },
      { status: 500 }
    );
  }
}
