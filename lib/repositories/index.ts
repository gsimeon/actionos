import type { RepositoryContainer } from "./interfaces";
import { DemoRepositoryContainer } from "./demo/demo-repositories";
import { SupabaseRepositoryContainer } from "./supabase/supabase-repositories";

export * from "./interfaces";
export { DemoRepositoryContainer } from "./demo/demo-repositories";
export { SupabaseRepositoryContainer, assertSupabaseProductionConfig } from "./supabase/supabase-repositories";

import { isDemoMode } from "@/lib/runtime/mode";
import { assertSupabaseProductionConfig } from "./supabase/supabase-repositories";

let cachedContainer: RepositoryContainer | null = null;

export function getRepositoryContainer(forceDemo?: boolean): RepositoryContainer {
  if (forceDemo) {
    return new DemoRepositoryContainer();
  }

  if (cachedContainer) {
    return cachedContainer;
  }

  if (isDemoMode()) {
    cachedContainer = new DemoRepositoryContainer();
  } else {
    assertSupabaseProductionConfig();
    cachedContainer = new SupabaseRepositoryContainer();
  }

  return cachedContainer;
}

export function setRepositoryContainer(container: RepositoryContainer): void {
  cachedContainer = container;
}

export function resetRepositoryContainer(): void {
  cachedContainer = null;
}

export const repositories = getRepositoryContainer();
