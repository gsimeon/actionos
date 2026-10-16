import { isProductionMode } from "@/lib/runtime/mode";
import { mockPaymentProvider } from "./mock";
import { PaystackPaymentProvider } from "./paystack";
import { FlutterwavePaymentProvider } from "./flutterwave";
import type { IPaymentProvider } from "./provider";

let currentPaymentProvider: IPaymentProvider | null = null;

/**
 * Resolves the authoritative payment provider instance based on runtime mode.
 * 
 * Provider Support Status:
 * - Production: Paystack Gateway (PaystackPaymentProvider) or Flutterwave Gateway (FlutterwavePaymentProvider).
 *   Requires PAYSTACK_SECRET_KEY or FLUTTERWAVE_SECRET_KEY respectively.
 * - Demo/Test: MockPaymentProvider deterministic simulation driver (or explicitly selected live provider).
 * 
 * In production mode, fails closed immediately if required gateway credentials are missing.
 */
export function getPaymentProvider(): IPaymentProvider {
  if (currentPaymentProvider) {
    if (isProductionMode() && currentPaymentProvider === mockPaymentProvider) {
      throw new Error(
        "Production runtime requires PAYSTACK_SECRET_KEY or FLUTTERWAVE_SECRET_KEY for authoritative payment settlement and reconciliation. Demo mock payment provider is strictly disabled in production."
      );
    }
    return currentPaymentProvider;
  }

  const requestedProvider = (process.env.PAYMENT_PROVIDER || "").toLowerCase().trim();
  const paystackKey = process.env.PAYSTACK_SECRET_KEY;
  const flutterwaveKey = process.env.FLUTTERWAVE_SECRET_KEY;

  if (requestedProvider === "flutterwave") {
    if (!flutterwaveKey) {
      if (isProductionMode()) {
        throw new Error(
          "Production runtime requires FLUTTERWAVE_SECRET_KEY for authoritative payment settlement and reconciliation. Demo mock payment provider is strictly disabled in production."
        );
      }
      throw new Error(
        "PAYMENT_PROVIDER is set to 'flutterwave', but FLUTTERWAVE_SECRET_KEY is not defined in your environment."
      );
    }
    return new FlutterwavePaymentProvider(flutterwaveKey);
  }

  const isPaystackRequested = requestedProvider === "paystack";

  if (isProductionMode() || isPaystackRequested) {
    if (!paystackKey) {
      // If in production and Flutterwave is configured instead of Paystack
      if (isProductionMode() && flutterwaveKey) {
        return new FlutterwavePaymentProvider(flutterwaveKey);
      }

      if (isProductionMode()) {
        throw new Error(
          "Production runtime requires PAYSTACK_SECRET_KEY for authoritative payment settlement and reconciliation. Demo mock payment provider is strictly disabled in production."
        );
      }
      throw new Error(
        "PAYMENT_PROVIDER is set to 'paystack', but PAYSTACK_SECRET_KEY is not defined in your environment."
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
export * from "./flutterwave";

