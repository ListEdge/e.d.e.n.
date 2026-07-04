import type { DatabaseProvider } from "@/providers/database/types";
import type { EventBus } from "@/core/events/EventBus";

const REMEMBER_PATTERN = /^\s*(?:eden[,\s]+)?remember(?:\s+that)?\s+(.{4,})/i;

/**
 * Checks whether a piece of text is an explicit "remember that..." request
 * and, if so, creates a long-term memory from it. Shared by typed
 * conversation and voice transcripts so saying "remember that X" behaves
 * identically regardless of which interface it came through - this used
 * to only exist in the text path, which is exactly why it silently didn't
 * work by voice.
 */
export async function captureExplicitMemory(
  text: string,
  db: DatabaseProvider,
  bus: EventBus,
  source: string,
  extraMetadata: Record<string, unknown> = {}
): Promise<void> {
  const match = text.match(REMEMBER_PATTERN);
  if (!match) return;

  const memory = await db.memories.add({
    type: "long_term",
    content: match[1].trim(),
    importance: 3,
    metadata: { source, ...extraMetadata },
  });
  await bus.publish("MemoryCreated", source, { memoryId: memory.id });
}
