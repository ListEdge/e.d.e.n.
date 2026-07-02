import type { Engine, EngineContext } from "../engine";
import type { Authority } from "@/types/domain";

/**
 * Permissions Engine — every action in Eden carries an authority level.
 * Low-risk authorities pass automatically. High-risk ones create an
 * approval record and an ApprovalRequested event; nothing proceeds
 * until the user says yes.
 */
export class PermissionsEngine implements Engine {
  readonly id = "permissions";
  readonly name = "Permissions Engine";
  private ctx!: EngineContext;

  /** The default policy. Editable per-deployment without touching engines. */
  private readonly policy: Record<Authority, "auto" | "approval"> = {
    read: "auto",
    write: "auto",
    communicate: "approval",
    deploy: "approval",
    purchase: "approval",
    delete: "approval",
    unlock: "approval",
  };

  start(ctx: EngineContext): void {
    this.ctx = ctx;
  }

  async authorize(
    action: string,
    authority: Authority,
    payload: Record<string, unknown> = {}
  ): Promise<{ allowed: boolean; pendingApprovalId?: string }> {
    if (this.policy[authority] === "auto") {
      return { allowed: true };
    }
    const approval = await this.ctx.providers.database.approvals.request({
      action,
      authority,
      payload,
    });
    await this.ctx.bus.publish("ApprovalRequested", this.id, {
      approvalId: approval.id,
      action,
      authority,
    });
    return { allowed: false, pendingApprovalId: approval.id };
  }
}
