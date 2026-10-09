import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";

import { isDemoMode, isProductionMode } from "@/lib/runtime/mode";

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (isProductionMode()) {
    if (!supabaseUrl || !supabaseUrl.trim() || supabaseUrl.includes("demo.supabase.co")) {
      throw new Error(
        "Supabase production configuration error: NEXT_PUBLIC_SUPABASE_URL must be defined with a valid production URL."
      );
    }
    if (!supabaseKey || !supabaseKey.trim() || supabaseKey === "demo-anon-key" || supabaseKey === "demo-key") {
      throw new Error(
        "Supabase production configuration error: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be defined with valid production keys."
      );
    }
    return createBrowserClient<Database>(supabaseUrl, supabaseKey);
  }

  if (!supabaseUrl || !supabaseKey) {
    if (!isDemoMode()) {
      throw new Error(
        "Supabase configuration error: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be defined. Demo credentials are only permitted in explicit demo mode."
      );
    }
  }

  return createBrowserClient<Database>(
    supabaseUrl || "https://demo.supabase.co",
    supabaseKey || "demo-anon-key"
  );
}
