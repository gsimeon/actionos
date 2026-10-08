import { NextResponse } from "next/server";
import { getRepositoryContainer } from "@/lib/repositories";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const repos = getRepositoryContainer();
  const customer = await repos.customers.findById(id);

  if (!customer) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Customer not found" } },
      { status: 404 }
    );
  }

  const policies = await repos.policies.findByCustomerId(id);
  const documents = await repos.documents.findByCustomerId(id);

  return NextResponse.json({
    success: true,
    data: {
      customer,
      policies,
      documents,
    },
  });
}
