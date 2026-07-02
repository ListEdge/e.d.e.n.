import { newId } from "@/lib/id";
import type { EdenEvent, EdenEventType, EventHandler } from "./types";

/**
 * The Event Bus is Eden's nervous system.
 *
 * Engines never import each other. They publish events here and subscribe
 * to the ones they care about. "*" subscribes to everything.
 *
 * A ring buffer of recent events is kept in memory so the UI (and the
 * Analytics Engine) can show a live picture of what Eden is doing.
 */
export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private history: EdenEvent[] = [];
  private readonly historyLimit = 200;

  subscribe(type: EdenEventType | "*", handler: EventHandler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  async publish<T extends Record<string, unknown>>(
    type: EdenEventType,
    source: string,
    payload: T
  ): Promise<EdenEvent<T>> {
    const event: EdenEvent<T> = {
      id: newId(),
      type,
      source,
      payload,
      at: new Date().toISOString(),
    };

    this.history.push(event as EdenEvent);
    if (this.history.length > this.historyLimit) this.history.shift();

    const targets = [
      ...(this.handlers.get(type) ?? []),
      ...(this.handlers.get("*") ?? []),
    ];

    // Handlers run in parallel; one failing handler never breaks the others.
    await Promise.allSettled(targets.map((h) => Promise.resolve(h(event as EdenEvent))));
    return event;
  }

  recent(limit = 50): EdenEvent[] {
    return this.history.slice(-limit).reverse();
  }
}
