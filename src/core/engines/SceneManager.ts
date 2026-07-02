import type { Engine, EngineContext } from "../engine";
import type { PresenceState, SceneName } from "@/types/domain";

/**
 * Scene Manager — reacts to context, activates scenes.
 * A scene is a bundle of behaviours: lighting, sound, notification rules,
 * desktop layout, voice style. Device actuation arrives with the Home
 * provider; today scenes are announced so everything can already react.
 */
export class SceneManager implements Engine {
  readonly id = "scenes";
  readonly name = "Scene Manager";
  private ctx!: EngineContext;
  private active: SceneName = "ambient";

  private readonly mapping: Partial<Record<PresenceState, SceneName>> = {
    working: "working",
    focus: "deep_focus",
    meeting: "presentation",
    home: "relaxing",
    sleeping: "sleeping",
  };

  start(ctx: EngineContext): void {
    this.ctx = ctx;
    ctx.bus.subscribe("ContextChanged", async (e) => {
      const presence = e.payload.presence as PresenceState | undefined;
      if (!presence) return;
      const scene = this.mapping[presence];
      if (scene && scene !== this.active) {
        this.active = scene;
        await ctx.bus.publish("SceneActivated", this.id, { scene });
      }
    });
  }

  current(): SceneName {
    return this.active;
  }
}
