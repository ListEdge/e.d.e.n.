import { NextResponse } from "next/server";
import { getKernel } from "@/core/kernel";
import { config } from "@/lib/config";

export const runtime = "nodejs";

/**
 * Builds Eden's voice-session instructions. Deliberately simpler than the
 * text Conversation Engine's system prompt — a realtime session gets its
 * instructions once, at the start, not freshly per message — so this pulls
 * a light seed of memory rather than trying to recall per-turn.
 *
 * The available-tools line is generated from whatever's actually
 * registered, so it never goes stale as new tools get added later.
 */
async function buildInstructions(): Promise<string> {
  const kernel = await getKernel();
  const title = config.identity.userTitle;
  const owner = config.identity.ownerName || "the user";
  const locationLine = config.identity.ownerLocation
    ? `${owner} is based in ${config.identity.ownerLocation}.`
    : "";

  let memoryBlock = "";
  try {
    const memories = await kernel.providers.database.memories.recent(5);
    if (memories.length > 0) {
      memoryBlock = `A few things to keep in mind about ${owner}:\n${memories
        .map((m) => `- ${m.content}`)
        .join("\n")}`;
    }
  } catch {
    /* memory seeding is a nice-to-have — never blocks a session starting */
  }

  const callableTools = kernel.capabilities.listCallable();
  const toolsLine =
    callableTools.length > 0
      ? `You have tools available: ${callableTools
          .map((t) => `${t.id} (${t.description})`)
          .join("; ")}. Using one may come back saying it needs the user's approval, which appears as a card on screen — if so, tell them plainly and wait. Never say or imply an action happened until a tool result actually confirms it did.`
      : `No tools are connected to this voice session yet — be honest about that rather than claiming to act.`;

  return [
    `You are Eden, a personal AI operating system, speaking with ${owner} by voice right now.`,
    `Always speak and respond in English. Even if the audio you hear seems unclear, accented, or momentarily sounds like another language, stay in English — never switch languages unless ${owner} explicitly and clearly asks you to.`,
    `Address them as "${title}" — composed, precise, quietly capable. Think JARVIS, not a chatbot.`,
    `Speak naturally and concisely, the way a real conversation sounds out loud — short sentences, no bullet points, nothing that only makes sense written down.`,
    toolsLine,
    locationLine,
    memoryBlock,
  ]
    .filter(Boolean)
    .join("\n");
}

async function mintSession() {
  const kernel = await getKernel();
  const realtime = kernel.providers.realtime;
  if (!realtime || !realtime.available()) {
    return NextResponse.json(
      { error: "Realtime voice is not connected. Add OPENAI_API_KEY to enable it." },
      { status: 503 }
    );
  }

  const instructions = await buildInstructions();
  const tools = kernel.capabilities.listCallable().map((t) => ({
    name: t.id,
    description: t.description,
    parameters: t.parameters ?? { type: "object", properties: {} },
  }));

  const session = await realtime.createSession({ instructions, tools });
  return NextResponse.json(session);
}

/**
 * GET is here purely so this can be tested by pasting the URL into a
 * browser address bar — no terminal needed. The real voice client built
 * in a later phase calls this with POST, which does the exact same thing.
 */
export async function GET() {
  try {
    return await mintSession();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/** POST /api/realtime/session — mints a short-lived token for a browser to open a voice session. */
export async function POST() {
  try {
    return await mintSession();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
