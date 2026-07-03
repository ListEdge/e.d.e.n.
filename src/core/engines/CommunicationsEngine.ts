import type { Engine, EngineContext } from "../engine";

/**
 * Communications Engine — email, calls and messages, all behind
 * "communicate" authority. Eden always identifies itself honestly:
 * "Hello, this is Eden, an AI assistant."
 */
export class CommunicationsEngine implements Engine {
  readonly id = "communications";
  readonly name = "Communications Engine";
  private ctx!: EngineContext;

  start(ctx: EngineContext): void {
    this.ctx = ctx;
  }

  async sendEmail(to: string, subject: string, body: string): Promise<string> {
    const email = this.ctx.providers.email;
    if (!email?.available()) {
      return "Email provider not configured. Add RESEND_API_KEY to my environment.";
    }

    const { allowed, pendingApprovalId } = await this.ctx.authorize(
      "send_email",
      "communicate",
      { to, subject }
    );
    if (!allowed) {
      return `I've prepared that email to ${to} but sending it needs your approval first, ${
        pendingApprovalId ? `(request ${pendingApprovalId})` : ""
      }`.trim();
    }

    await email.send(to, subject, body);
    await this.ctx.bus.publish("MessageSent", this.id, { channel: "email", to });
    return "Sent.";
  }

  async placeCall(number: string, purpose: string): Promise<string> {
    const phone = this.ctx.providers.phone;
    if (!phone?.available()) {
      return "Phone provider not configured. Implement providers/phone against the PhoneProvider contract.";
    }

    const { allowed, pendingApprovalId } = await this.ctx.authorize(
      "place_call",
      "communicate",
      { number, purpose }
    );
    if (!allowed) {
      return `I'm ready to call ${number} but that needs your approval first, ${
        pendingApprovalId ? `(request ${pendingApprovalId})` : ""
      }`.trim();
    }

    const script = `Hello, this is Eden, an AI assistant. I'm calling regarding: ${purpose}`;
    const { callId } = await phone.call(number, script);
    await this.ctx.bus.publish("CallStarted", this.id, { callId, number });
    return callId;
  }
}
