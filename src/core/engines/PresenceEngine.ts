import type { Engine, EngineContext } from "../engine";
import type { PresenceState } from "@/types/domain";

/**
 * Presence Engine — knows *where* and *how* the user currently is.
 * It never controls anything. It only publishes ContextChanged events;
 * the Scene Manager and others decide what to do about them.
 * Signals will come from desktop, mobile, calendar and home automation.
 */
export class PresenceEngine implements Engine {
  readonly id = "presence";
  readonly name = "Presence Engine";
  private ctx!: EngineContext;
  private state: PresenceState = "unknown";

  start(ctx: EngineContext): void {
    this.ctx = ctx;
    // Future: subscribe to LocationChanged, MeetingStarted, DeviceConnected
    ctx.bus.subscribe("LocationChanged", async (e) => {
      const location = String(e.payload.location ?? "");
      if (location === "home") await this.setPresence("home");
      if (location === "office") await this.setPresence("office");
    });
  }

  current(): PresenceState {
    return this.state;
  }

  async setPresence(state: PresenceState): Promise<void> {
    if (state === this.state) return;
    this.state = state;
    await this.ctx.bus.publish("ContextChanged", this.id, { presence: state });
  }
}
