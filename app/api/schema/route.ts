import { NextResponse } from "next/server";
import { jsonSchemas } from "@/lib/schemas";

export const dynamic = "force-dynamic";

/** The JSON Schemas of the triage request and response (generated from the Zod schemas). */
export async function GET() {
  return NextResponse.json(jsonSchemas);
}
