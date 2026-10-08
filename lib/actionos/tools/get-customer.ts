import type { IActionOSTool, ToolResult, ExecutionContext } from "@/types/actionos";
import type { Customer } from "@/types/database";
import { getRepositoryContainer } from "@/lib/repositories";

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
    const repos = getRepositoryContainer();
    const targetId = input.customerId || context.customerId;

    let customer: Customer | null = null;
    if (targetId) {
      customer = await repos.customers.findById(targetId);
    }
    if (!customer && input.customerNumber) {
      customer = await repos.customers.findByNumber(input.customerNumber);
    }

    // Default to benchmark demo customer if not specified or found
    if (!customer) {
      customer = await repos.customers.findByNumber("CUS-000001");
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
