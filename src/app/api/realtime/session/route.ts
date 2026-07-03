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
 * Tool-calling isn't wired into voice mode yet (that's Phase 2), so Eden
 * is told plainly to say so if asked to act on something, rather than
 * risk claiming a capability this mode doesn't have.
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

  return [
    `You are Eden, a personal AI operating system, speaking with ${owner} by voice right now.`,
    `Address them as "${title}" — composed, precise, quietly capable. Think JARVIS, not a chatbot.`,
    `Speak naturally and concisely, the way a real conversation sounds out loud — short sentences, no bullet points, nothing that only makes sense written down.`,
    `Tools like email are not connected to this voice mode yet. If asked to do something like that, say so plainly rather than claiming to have done it.`,
    locationLine,
    memoryBlock,
  ]
    .filter(Boolean)
    .join("\n");
}

/** POST /api/realtime/session — mints a short-lived token for a browser to open a voice session. */
export async function POST() {
  try {
    const kernel = await getKernel();
    const realtime = kernel.providers.realtime;
    if (!realtime || !realtime.available()) {
      return NextResponse.json(
        { error: "Realtime voice is not connected. Add OPENAI_API_KEY to enable it." },
        { status: 503 }
      );
    }

    const instructions = await buildInstructions();
    const session = await realtime.createSession({ instructions });

    return NextResponse.json(session);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
