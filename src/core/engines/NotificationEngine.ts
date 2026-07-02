import type { Engine, EngineContext } from "../engine";

/**
 * Notification Engine — the single doorway for anything that wants the
 * user's attention. Scenes and presence can later shape delivery
 * (e.g. deep focus suppresses everything below critical).
 */
export class NotificationEngine implements Engine {
  readonly id = "notifications";
  readonly name = "Notification Engine";
  private ctx!: EngineContext;

  start(ctx: EngineContext): void {
    this.ctx = ctx;
    // Deployment failures always surface.
    ctx.bus.subscribe("DeploymentFailed", async (e) => {
      await this.notify("Deployment failed", String(e.payload.reason ?? ""), "critical");
    });
  }

  async notify(
    title: string,
    body: string | null = null,
    level: "info" | "warning" | "critical" = "info"
  ): Promise<void> {
    const n = await this.ctx.providers.database.notifications.add({ title, body, level });
    await this.ctx.bus.publish("NotificationCreated", this.id, {
      notificationId: n.id,
      title,
      level,
    });
  }
}
