import { NextResponse } from "next/server";
import { getStore } from "@/lib/actionos/mock-store";
import { createCustomerSchema } from "@/lib/validations";
import type { Customer } from "@/types/database";

export async function GET() {
  const store = getStore();
  return NextResponse.json({
    success: true,
    data: store.customers,
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

    const store = getStore();
    const newCustomer: Customer = {
      id: `f0000000-0000-0000-0000-${Date.now().toString().slice(-12)}`,
      organization_id: store.customers[0]?.organization_id || "a0000000-0000-0000-0000-000000000001",
      profile_id: null,
      customer_number: `CUS-${String(store.customers.length + 1).padStart(6, "0")}`,
      full_name: validated.data.full_name,
      phone: validated.data.phone,
      email: validated.data.email,
      address: validated.data.address || null,
      state: validated.data.state || "Lagos",
      country: validated.data.country || "Nigeria",
      status: "active",
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    store.customers.unshift(newCustomer);

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
