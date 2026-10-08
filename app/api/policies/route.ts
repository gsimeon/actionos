import { NextResponse } from "next/server";
import { getStore } from "@/lib/actionos/mock-store";
import { createPolicySchema } from "@/lib/validations";
import type { Policy } from "@/types/database";

export async function GET(req: Request) {
  const store = getStore();
  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  let policies = store.policies;
  if (status && status !== "all") {
    policies = policies.filter((p) => p.status === status);
  }

  // Populate joined fields
  const populated = policies.map((p) => {
    const customer = store.customers.find((c) => c.id === p.customer_id);
    const asset = store.assets.find((a) => a.id === p.asset_id);
    return {
      ...p,
      customer,
      asset,
    };
  });

  return NextResponse.json({
    success: true,
    data: populated,
  });
}

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const validated = createPolicySchema.safeParse(json);

    if (!validated.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: validated.error.issues[0]?.message || "Invalid policy input",
          },
        },
        { status: 400 }
      );
    }

    const store = getStore();
    const newPolicy: Policy = {
      id: `20000000-0000-0000-0000-${Date.now().toString().slice(-12)}`,
      customer_id: validated.data.customer_id,
      asset_id: validated.data.asset_id || null,
      provider_id: validated.data.provider_id,
      policy_type_id: validated.data.policy_type_id,
      policy_number: validated.data.policy_number,
      start_date: validated.data.start_date,
      expiry_date: validated.data.expiry_date,
      status: "active",
      premium: validated.data.premium,
      currency: validated.data.currency,
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    store.policies.unshift(newPolicy);

    return NextResponse.json({
      success: true,
      data: newPolicy,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create policy";
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message } },
      { status: 500 }
    );
  }
}
