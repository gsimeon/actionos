import type { RepositoryContainer } from "./interfaces";
import { DemoRepositoryContainer } from "./demo/demo-repositories";
import { SupabaseRepositoryContainer } from "./supabase/supabase-repositories";

export * from "./interfaces";
export { DemoRepositoryContainer } from "./demo/demo-repositories";
export { SupabaseRepositoryContainer } from "./supabase/supabase-repositories";

let cachedContainer: RepositoryContainer | null = null;

export function getRepositoryContainer(forceDemo?: boolean): RepositoryContainer {
  if (forceDemo) {
    return new DemoRepositoryContainer();
  }

  if (cachedContainer) {
    return cachedContainer;
  }

  const isExplicitDemo = process.env.DEMO_MODE === "true";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isDemoUrl = !supabaseUrl || supabaseUrl.includes("demo.supabase.co");

  if (isExplicitDemo || isDemoUrl) {
    cachedContainer = new DemoRepositoryContainer();
  } else {
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
