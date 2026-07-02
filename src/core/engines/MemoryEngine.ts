import type { Engine, EngineContext } from "../engine";
import type { Memory, MemoryType } from "@/types/domain";

/**
 * Memory Engine — Eden's long-term mind.
 * Stores knowledge, not chat logs. Keyword recall today; the schema is
 * ready for vector/semantic recall (pgvector) without any interface change.
 */
export class MemoryEngine implements Engine {
  readonly id = "memory";
  readonly name = "Memory Engine";
  private ctx!: EngineContext;

  start(ctx: EngineContext): void {
    this.ctx = ctx;
  }

  async remember(
    content: string,
    type: MemoryType = "knowledge",
    importance = 2,
    metadata: Record<string, unknown> = {}
  ): Promise<Memory> {
    const memory = await this.ctx.providers.database.memories.add({
      type,
      content,
      importance,
      metadata,
    });
    await this.ctx.bus.publish("MemoryCreated", this.id, {
      memoryId: memory.id,
      type,
    });
    return memory;
  }

  async recall(query: string, limit = 5): Promise<Memory[]> {
    const results = await this.ctx.providers.database.memories.search(query, limit);
    if (results.length > 0) {
      await this.ctx.bus.publish("MemoryRecalled", this.id, { query, count: results.length });
    }
    return results;
  }

  async recent(limit = 10): Promise<Memory[]> {
    return this.ctx.providers.database.memories.recent(limit);
  }
}
