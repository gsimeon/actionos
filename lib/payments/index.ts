import { isProductionMode } from "@/lib/runtime/mode";
import { mockPaymentProvider } from "./mock";
import { PaystackPaymentProvider } from "./paystack";
import type { IPaymentProvider } from "./provider";

let currentPaymentProvider: IPaymentProvider | null = null;

/**
 * Resolves the authoritative payment provider instance based on runtime mode.
 * 
 * Provider Support Status:
 * - Production: Paystack Gateway (PaystackPaymentProvider) strictly requiring PAYSTACK_SECRET_KEY.
 * - Demo/Test: MockPaymentProvider deterministic simulation driver.
 * - Flutterwave: Planned roadmap integration. Flutterwave is not production-ready until
 *   its adapter, settlement verification, and webhook paths are fully implemented and verified.
 * 
 * In production mode, fails closed immediately if PAYSTACK_SECRET_KEY is missing.
 */
export function getPaymentProvider(): IPaymentProvider {
  if (currentPaymentProvider) {
    if (isProductionMode() && currentPaymentProvider === mockPaymentProvider) {
      throw new Error(
        "Production runtime requires PAYSTACK_SECRET_KEY for authoritative payment settlement and reconciliation. Demo mock payment provider is strictly disabled in production."
      );
    }
    return currentPaymentProvider;
  }

  if (isProductionMode()) {
    const paystackKey = process.env.PAYSTACK_SECRET_KEY;
    if (!paystackKey) {
      throw new Error(
        "Production runtime requires PAYSTACK_SECRET_KEY for authoritative payment settlement and reconciliation. Demo mock payment provider is strictly disabled in production."
      );
    }
    return new PaystackPaymentProvider(paystackKey);
  }

  return mockPaymentProvider;
}

/**
 * Allows test suites and dependency injection containers to override the active payment provider.
 */
export function setPaymentProvider(provider: IPaymentProvider | null): void {
  currentPaymentProvider = provider;
}

export * from "./provider";
export * from "./mock";
export * from "./paystack";
