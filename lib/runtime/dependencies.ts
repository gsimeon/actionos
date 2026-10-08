import { isDemoMode } from "./mode";
import { getRepositoryContainer, type RepositoryContainer } from "@/lib/repositories";
import type { IPaymentProvider } from "@/lib/payments/provider";
import { mockPaymentProvider } from "@/lib/payments/mock";
import { PaystackPaymentProvider } from "@/lib/payments/paystack";
import { createNAtlasProvider } from "@/lib/ai/n-atlas";
import type { NAtlasProvider } from "@/types/actionos";

let overriddenPaymentProvider: IPaymentProvider | null = null;

export function setPaymentProvider(provider: IPaymentProvider | null): void {
  overriddenPaymentProvider = provider;
}

/**
 * Resolves the payment provider based on runtime mode.
 */
export function getPaymentProvider(): IPaymentProvider {
  if (overriddenPaymentProvider) {
    return overriddenPaymentProvider;
  }

  if (isDemoMode() || !process.env.PAYSTACK_SECRET_KEY) {
    return mockPaymentProvider;
  }

  return new PaystackPaymentProvider();
}

/**
 * Resolves the active AI understanding provider based on runtime mode.
 */
export function getAIProvider(): NAtlasProvider {
  return createNAtlasProvider();
}

/**
 * Resolves the active repository container based on runtime mode.
 */
export function getRepositories(): RepositoryContainer {
  return getRepositoryContainer();
}
