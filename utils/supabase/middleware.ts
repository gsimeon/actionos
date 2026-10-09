import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { isProductionMode } from "@/lib/runtime/mode";

export const createClient = (request: NextRequest) => {
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

  // Create an unmodified response
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const _supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    },
  );

  return supabaseResponse;
};
