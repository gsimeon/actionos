import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { isProductionMode } from "@/lib/runtime/mode";

export const createClient = (cookieStore: Awaited<ReturnType<typeof cookies>>) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://demo.supabase.co";
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "demo-anon-key";

  if (isProductionMode()) {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || supabaseUrl.includes("demo.supabase.co")) {
      throw new Error(
        "Supabase production configuration error: NEXT_PUBLIC_SUPABASE_URL must be defined with a valid production URL."
      );
    }
    if (
      (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
      supabaseKey === "demo-anon-key" ||
      supabaseKey === "demo-key"
    ) {
      throw new Error(
        "Supabase production configuration error: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be defined with valid production keys."
      );
    }
  }

  return createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    },
  );
};
