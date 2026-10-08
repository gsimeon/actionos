import { NextResponse } from "next/server";
import { getStore } from "@/lib/actionos/mock-store";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const store = getStore();
  const customer = store.customers.find((c) => c.id === id);

  if (!customer) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Customer not found" } },
      { status: 404 }
    );
  }

  const vehicles = store.assets.filter((a) => a.customer_id === id);
  const policies = store.policies.filter((p) => p.customer_id === id);
  const renewals = store.renewals.filter((r) => r.customer_id === id);
  const transactions = store.transactions.filter((t) => t.customer_id === id);
  const documents = store.documents.filter((d) => d.customer_id === id);
  const sessions = store.sessions.filter((s) => s.customer_id === id);

  return NextResponse.json({
    success: true,
    data: {
      customer,
      vehicles,
      policies,
      renewals,
      transactions,
      documents,
      actionHistory: sessions,
    },
  });
}
