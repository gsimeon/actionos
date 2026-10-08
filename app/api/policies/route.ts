import { NextResponse } from "next/server";
import { getRepositoryContainer } from "@/lib/repositories";
import { createPolicySchema } from "@/lib/validations";

export async function GET(req: Request) {
  const repos = getRepositoryContainer();
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || undefined;

  const policies = await repos.policies.findAll({ status });

  return NextResponse.json({
    success: true,
    data: policies,
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

    const repos = getRepositoryContainer();
    const newPolicy = await repos.policies.create({
      customer_id: validated.data.customer_id,
      provider_id: validated.data.provider_id,
      policy_type_id: validated.data.policy_type_id,
      policy_number: validated.data.policy_number,
      start_date: validated.data.start_date,
      expiry_date: validated.data.expiry_date,
      premium: validated.data.premium,
    });

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
