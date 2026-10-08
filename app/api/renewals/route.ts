import { NextResponse } from "next/server";
import { getStore } from "@/lib/actionos/mock-store";

export async function GET(req: Request) {
  const store = getStore();
  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  let renewals = store.renewals;
  if (status && status !== "all") {
    renewals = renewals.filter((r) => r.status === status);
  }

  const populated = renewals.map((r) => {
    const policy = store.policies.find((p) => p.id === r.policy_id);
    const customer = store.customers.find((c) => c.id === r.customer_id);
    const vehicle = store.assets.find((a) => a.id === policy?.asset_id);
    return {
      ...r,
      policy,
      customer,
      vehicle,
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
    const store = getStore();

    const newRenewal = {
      id: `30000000-0000-0000-0000-${Date.now().toString().slice(-12)}`,
      policy_id: json.policy_id,
      customer_id: json.customer_id,
      scheduled_for: json.scheduled_for || new Date().toISOString().split("T")[0],
      days_before_expiry: json.days_before_expiry || 7,
      status: json.status || "scheduled",
      quote_amount: json.quote_amount || 87500,
      currency: json.currency || "NGN",
      payment_status: "unpaid" as const,
      renewed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    store.renewals.unshift(newRenewal);

    return NextResponse.json({
      success: true,
      data: newRenewal,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to record renewal";
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message } },
      { status: 500 }
    );
  }
}
