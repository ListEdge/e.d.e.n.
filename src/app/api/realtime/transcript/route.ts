import { NextResponse } from "next/server";
import { getKernel } from "@/core/kernel";
import { captureExplicitMemory } from "@/lib/memory-capture";

export const runtime = "nodejs";

/**
 * Persists one completed turn from a live voice session into the same
 * messages table typed conversations use, tagged so it's identifiable
 * as a voice turn - so voice conversations show up in history and
 * memory recall the same way typed ones do. Also runs the same explicit
 * "remember that..." capture typed conversation already has, so saying
 * it out loud works exactly the same way as typing it.
 */
async function saveTurn(role: "user" | "assistant", text: string, conversationId: string | null) {
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const kernel = await getKernel();
  const db = kernel.providers.database;

  let convoId = conversationId;
  if (!convoId) {
    const convo = await db.conversations.create(`Voice: ${text.slice(0, 60)}`);
    convoId = convo.id;
  }

  const message = await db.messages.add({
    conversation_id: convoId,
    role,
    provider: "realtime",
    content: text,
  });

  if (role === "user") {
    await captureExplicitMemory(text, db, kernel.bus, "realtime", { conversationId: convoId });
  }

  return NextResponse.json({ conversationId: convoId, message });
}

/**
 * GET so this can be tested by pasting a URL into a browser - no
 * terminal needed. Example:
 *   /api/realtime/transcript?role=user&text=hello
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role") === "assistant" ? "assistant" : "user";
    const text = searchParams.get("text")?.trim() ?? "";
    const conversationId = searchParams.get("conversationId");
    return await saveTurn(role, text, conversationId);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/** POST /api/realtime/transcript  { role: "user"|"assistant", text: string, conversationId?: string } */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}) as Record<string, unknown>);
    const role = body.role === "assistant" ? "assistant" : "user";
    const text = String(body.text ?? "").trim();
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : null;
    return await saveTurn(role, text, conversationId);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
