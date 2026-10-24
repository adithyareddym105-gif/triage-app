import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ConfigError, InvalidOutputError, UpstreamError } from "./errors";

export function errorResponse(status: number, code: string, message: string, issues?: { path: string; message: string }[]) {
  return NextResponse.json({ error: { code, message, ...(issues ? { issues } : {}) } }, { status });
}

export function zodIssues(e: ZodError) {
  return e.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

export function validationError(e: ZodError) {
  return errorResponse(400, "invalid_request", "The request does not match the expected schema.", zodIssues(e));
}

export async function readJson(req: Request): Promise<{ ok: true; body: unknown } | { ok: false; res: NextResponse }> {
  try {
    return { ok: true, body: await req.json() };
  } catch {
    return { ok: false, res: errorResponse(400, "invalid_json", "The request body is not valid JSON.") };
  }
}

export function handleServerError(e: unknown) {
  if (e instanceof ConfigError) return errorResponse(500, "config_error", e.message);
  if (e instanceof InvalidOutputError) return errorResponse(502, "invalid_model_output", `The model did not return a valid answer: ${e.message}`);
  if (e instanceof UpstreamError) return errorResponse(502, "upstream_error", e.message);
  if (e instanceof ZodError) return errorResponse(502, "invalid_response", "The server produced a response that does not match its schema.", zodIssues(e));
  console.error(e);
  return errorResponse(500, "internal_error", "Unexpected server error.");
}
