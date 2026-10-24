import { NextResponse } from "next/server";
import { TriageRequestSchema } from "@/lib/schemas";
import { runTriage } from "@/lib/triage";
import { handleServerError, readJson, validationError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await readJson(req);
  if (!body.ok) return body.res;
  const parsed = TriageRequestSchema.safeParse(body.body); // F1: request validated
  if (!parsed.success) return validationError(parsed.error);
  try {
    const response = await runTriage(parsed.data.ticket, parsed.data.strategy); // response validated inside
    return NextResponse.json(response);
  } catch (e) {
    return handleServerError(e);
  }
}
