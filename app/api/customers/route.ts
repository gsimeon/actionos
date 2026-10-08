import { NextResponse } from "next/server";
import { getRepositoryContainer } from "@/lib/repositories";
import { createCustomerSchema } from "@/lib/validations";

export async function GET() {
  const repos = getRepositoryContainer();
  const customers = await repos.customers.findAll();
  return NextResponse.json({
    success: true,
    data: customers,
  });
}

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const validated = createCustomerSchema.safeParse(json);

    if (!validated.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: validated.error.issues[0]?.message || "Invalid customer input",
          },
        },
        { status: 400 }
      );
    }

    const repos = getRepositoryContainer();
    const customerNumber = `CUS-${Date.now().toString().slice(-6)}`;
    const newCustomer = await repos.customers.create({
      organization_id: "a0000000-0000-0000-0000-000000000001",
      customer_number: customerNumber,
      full_name: validated.data.full_name,
      phone: validated.data.phone,
      email: validated.data.email,
      address: validated.data.address || null,
      state: validated.data.state || "Lagos",
      country: validated.data.country || "Nigeria",
      status: "active",
      metadata: {},
    });

    return NextResponse.json({
      success: true,
      data: newCustomer,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create customer";
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message } },
      { status: 500 }
    );
  }
}
