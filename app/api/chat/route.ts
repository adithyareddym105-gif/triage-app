import { getLlm, llmModel } from "@/lib/llm";
import { CHAT_SYSTEM } from "@/lib/prompt";
import { ChatRequestSchema } from "@/lib/schemas";
import { handleServerError, readJson, validationError, errorResponse } from "@/lib/http";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await readJson(req);
  if (!body.ok) return body.res;
  const parsed = ChatRequestSchema.safeParse(body.body);
  if (!parsed.success) return validationError(parsed.error);
  try {
    // The client resends the whole history every time (the API is stateless).
    const completion = await getLlm().chat.completions.create({
      model: llmModel(),
      messages: [{ role: "system", content: CHAT_SYSTEM }, ...parsed.data.messages],
    });
    const reply = completion.choices[0]?.message?.content;
    if (!reply) return errorResponse(502, "empty_reply", "The model returned an empty reply.");
    return NextResponse.json({ reply });
  } catch (e: any) {
    if (e?.status) return errorResponse(502, "upstream_error", `LLM call failed: ${e.message}`);
    return handleServerError(e);
  }
}
