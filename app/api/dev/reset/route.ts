import { NextResponse } from "next/server";
import { resetStore } from "@/lib/actionos/mock-store";

export async function POST() {
  resetStore();
  return NextResponse.json({ success: true, message: "ActionOS mock store reset to clean benchmark state." });
}

export async function GET() {
  resetStore();
  return NextResponse.json({ success: true, message: "ActionOS mock store reset to clean benchmark state." });
}
