import { NextResponse } from "next/server";
import { getRepositoryContainer } from "@/lib/repositories";

export async function GET(req: Request) {
  const repos = getRepositoryContainer();
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || undefined;

  const renewals = await repos.renewals.findAll({ status });

  return NextResponse.json({
    success: true,
    data: renewals,
  });
}

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const repos = getRepositoryContainer();

    const newRenewal = await repos.renewals.create({
      policy_id: json.policy_id,
      customer_id: json.customer_id,
      scheduled_for: json.scheduled_for || new Date().toISOString().split("T")[0],
      days_before_expiry: json.days_before_expiry || 7,
      status: json.status || "scheduled",
      quote_amount: json.quote_amount || 87500,
      currency: json.currency || "NGN",
      payment_status: "pending",
    });

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
