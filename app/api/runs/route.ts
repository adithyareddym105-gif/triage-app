import { NextResponse } from "next/server";
import { readRuns } from "@/lib/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ runs: readRuns().reverse() });
}
