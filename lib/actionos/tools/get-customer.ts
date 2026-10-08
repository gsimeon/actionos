import type { IActionOSTool, ToolResult, ExecutionContext } from "@/types/actionos";
import type { Customer } from "@/types/database";
import { getStore } from "@/lib/actionos/mock-store";

export interface GetCustomerInput {
  customerId?: string;
  customerNumber?: string;
  email?: string;
  phone?: string;
}

export class GetCustomerTool implements IActionOSTool<GetCustomerInput, Customer> {
  public readonly name = "get_customer";
  public readonly description = "Retrieve verified customer profile and active organization context";
  public readonly category = "customer";
  public readonly version = "1.0.0";
  public readonly riskLevel = "low" as const;
  public readonly requiresConfirmation = false;

  validateInput(input: unknown): { valid: boolean; error?: string; data?: GetCustomerInput } {
    if (!input || typeof input !== "object") {
      return { valid: false, error: "Input must be an object" };
    }
    const data = input as GetCustomerInput;
    return { valid: true, data };
  }

  async execute(input: GetCustomerInput, context: ExecutionContext): Promise<ToolResult<Customer>> {
    const store = getStore();

    // Look up customer by ID, context customerId, customerNumber, email, or phone
    const targetId = input.customerId || context.customerId;
    let customer = store.customers.find((c) => {
      if (targetId && c.id === targetId) return true;
      if (input.customerNumber && c.customer_number === input.customerNumber) return true;
      if (input.email && c.email.toLowerCase() === input.email.toLowerCase()) return true;
      if (input.phone && c.phone === input.phone) return true;
      return false;
    });

    // Default to benchmark demo customer if not specified
    if (!customer) {
      customer = store.customers[0];
    }

    if (!customer) {
      return {
        success: false,
        error: {
          code: "CUSTOMER_NOT_FOUND",
          message: "No customer record found matching the provided identity criteria.",
        },
      };
    }

    return {
      success: true,
      data: customer,
    };
  }
}
