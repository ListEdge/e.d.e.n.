import type { Engine, EngineContext } from "../engine";

/**
 * Analytics Engine — watches everything, judges nothing.
 * Subscribes to the whole event stream, keeps live counters, and
 * persists every event to the database for long-term history.
 */
export class AnalyticsEngine implements Engine {
  readonly id = "analytics";
  readonly name = "Analytics Engine";
  private counters: Record<string, number> = {};

  start(ctx: EngineContext): void {
    ctx.bus.subscribe("*", async (event) => {
      this.counters[event.type] = (this.counters[event.type] ?? 0) + 1;
      try {
        await ctx.providers.database.events.log(event);
      } catch {
        // Event history is best-effort; never let logging break the system.
      }
    });
  }

  summary(): Record<string, number> {
    return { ...this.counters };
  }
}
