import type { Engine, EngineContext } from "../engine";

/**
 * Context Engine — assembles the "now" snapshot other engines read:
 * time of day, presence, active scene, active conversation, pending items.
 */
export class ContextEngine implements Engine {
  readonly id = "context";
  readonly name = "Context Engine";
  private ctx!: EngineContext;
  private snapshot: Record<string, unknown> = {};

  start(ctx: EngineContext): void {
    this.ctx = ctx;
    ctx.bus.subscribe("ContextChanged", (e) => {
      this.snapshot = { ...this.snapshot, ...e.payload, updatedAt: e.at };
    });
    ctx.bus.subscribe("SceneActivated", (e) => {
      this.snapshot = { ...this.snapshot, scene: e.payload.scene, updatedAt: e.at };
    });
  }

  current(): Record<string, unknown> {
    const hour = new Date().getHours();
    const phase =
      hour < 5 ? "night" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 22 ? "evening" : "night";
    return { phase, ...this.snapshot };
  }
}
