import { isProductionMode } from "@/lib/runtime/mode";
import { mockPaymentProvider } from "./mock";
import { PaystackPaymentProvider } from "./paystack";
import type { IPaymentProvider } from "./provider";

let currentPaymentProvider: IPaymentProvider | null = null;

/**
 * Resolves the authoritative payment provider instance based on runtime mode.
 * - In production: strictly requires real gateway credentials (PAYSTACK_SECRET_KEY) and fails closed if missing.
 * - In demo/test mode: defaults to the mockPaymentProvider simulation driver unless explicitly overridden.
 */
export function getPaymentProvider(): IPaymentProvider {
  if (currentPaymentProvider) {
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
