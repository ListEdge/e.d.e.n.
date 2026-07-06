import { NextResponse } from "next/server";
import { getKernel } from "@/core/kernel";
import { config } from "@/lib/config";

export const runtime = "nodejs";

/**
 * Builds Eden's voice-session instructions. Deliberately simpler than the
 * text Conversation Engine's system prompt - a realtime session gets its
 * instructions once, at the start, not freshly per message - so this pulls
 * a light seed of memory rather than trying to recall per-turn.
 *
 * When conversationId is passed (a reconnect after the connection dropped,
 * not a fresh "Talk to Eden" tap), it also pulls the last few turns of
 * that conversation so Eden picks back up naturally instead of acting
 * like nothing was just being discussed.
 */
async function buildInstructions(conversationId?: string | null): Promise<string> {
  const kernel = await getKernel();
  const title = config.identity.userTitle;
  const owner = config.identity.ownerName || "the user";
  const locationLine = config.identity.ownerLocation
    ? owner + " is based in " + config.identity.ownerLocation + "."
    : "";

  let memoryBlock = "";
  try {
    const memories = await kernel.providers.database.memories.recent(5);
    if (memories.length > 0) {
      const lines = memories.map(function (m) {
        return "- " + m.content;
      });
      memoryBlock = "A few things to keep in mind about " + owner + ":\n" + lines.join("\n");
    }
  } catch {
    /* memory seeding is a nice-to-have - never blocks a session starting */
  }

  let recentConversationBlock = "";
  if (conversationId) {
    try {
      const history = await kernel.providers.database.messages.listByConversation(conversationId, 12);
      const lines = history
        .filter(function (m) {
          return m.role === "user" || m.role === "assistant";
        })
        .map(function (m) {
          return (m.role === "user" ? "User: " : "Eden: ") + m.content;
        });
      if (lines.length > 0) {
        recentConversationBlock =
          "The connection just briefly dropped and reconnected - this is the SAME conversation continuing, not a new one. Here is what was just said, moments ago. Pick back up naturally where it left off. Do not re-introduce yourself, do not act like this is a new conversation, and do not mention that a reconnect happened unless asked:\n" +
          lines.join("\n");
      }
    } catch {
      /* continuity is a nice-to-have - never block a session starting */
    }
  }

  const callableTools = kernel.capabilities.listCallable();
  const toolsLine =
    callableTools.length > 0
      ? "You have tools available: " +
        callableTools.map(function (t) { return t.id + " (" + t.description + ")"; }).join("; ") +
        ". Using one may come back saying it needs the user's approval, which appears as a card on screen - if so, tell them plainly and wait. Never say or imply an action happened until a tool result actually confirms it did."
      : "No tools are connected to this voice session yet - be honest about that rather than claiming to act.";

  return [
    "You are Eden, a personal AI operating system, speaking with " + owner + " by voice right now.",
    "Always speak and respond in English. Even if the audio you hear seems unclear, accented, or momentarily sounds like another language, stay in English - never switch languages unless " + owner + " explicitly and clearly asks you to.",
    'Address them as "' + title + '" - composed, precise, quietly capable. Think JARVIS, not a chatbot.',
    "Speak naturally and concisely, the way a real conversation sounds out loud - short sentences, no bullet points, nothing that only makes sense written down.",
    toolsLine,
    locationLine,
    memoryBlock,
    recentConversationBlock,
  ]
    .filter(Boolean)
    .join("\n");
}

async function mintSession(conversationId?: string | null) {
  const kernel = await getKernel();
  const realtime = kernel.providers.realtime;
  if (!realtime || !realtime.available()) {
    return NextResponse.json(
      { error: "Realtime voice is not connected. Add OPENAI_API_KEY to enable it." },
      { status: 503 }
    );
  }

  const instructions = await buildInstructions(conversationId);
  const tools = kernel.capabilities.listCallable().map(function (t) {
    return {
      name: t.id,
      description: t.description,
      parameters: t.parameters ?? { type: "object", properties: {} },
    };
  });

  const session = await realtime.createSession({ instructions: instructions, tools: tools });
  return NextResponse.json({ ...session, instructions: instructions });
}

/**
 * GET is here purely so this can be tested by pasting a URL into a
 * browser address bar - no terminal needed.
 *   /api/realtime/session?conversationId=...
 */
export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const conversationId = searchParams.get("conversationId");
    return await mintSession(conversationId);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/** POST /api/realtime/session  { conversationId?: string } */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(function () {
      return {} as Record<string, unknown>;
    });
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : null;
    return await mintSession(conversationId);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
