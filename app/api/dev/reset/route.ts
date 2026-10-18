import { NextResponse } from "next/server";
import { getRepositoryContainer } from "@/lib/repositories";
import { resetStore } from "@/lib/actionos/mock-store";

export async function POST() {
  const repos = getRepositoryContainer();
  if (repos.isDemo) {
    resetStore();
    return NextResponse.json({ success: true, message: "ActionOS demo store reset to clean benchmark state." });
  }
  return NextResponse.json(
    { success: false, message: "Dev reset endpoint is disabled in production PostgreSQL mode." },
    { status: 403 }
  );
}

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "State-mutating reset is strictly prohibited via GET. Use POST with proper authorization.",
      },
    },
    {
      status: 405,
      headers: { Allow: "POST" },
    }
  );
}

