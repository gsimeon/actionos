import { getRepositoryContainer, type RepositoryContainer } from "@/lib/repositories";
import { getPaymentProvider, setPaymentProvider } from "@/lib/payments";
import { createNAtlasProvider } from "@/lib/ai/n-atlas";
import type { NAtlasProvider } from "@/types/actionos";

export { getPaymentProvider, setPaymentProvider };

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
