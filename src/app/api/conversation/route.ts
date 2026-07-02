import { NextResponse } from "next/server";
import { getKernel } from "@/core/kernel";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/conversation  { message: string, conversationId?: string } */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const message = String(body.message ?? "").trim();
    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const kernel = await getKernel();
    const result = await kernel.conversation.handleUserMessage(
      message,
      body.conversationId ?? null
    );

    return NextResponse.json({
      conversationId: result.conversationId,
      reply: result.reply.content,
      provider: result.reply.provider,
      model: result.reply.model,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
