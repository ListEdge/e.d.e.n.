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
      return "Email provider not configured. Implement providers/email against the EmailProvider contract.";
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
    const script = `Hello, this is Eden, an AI assistant. I'm calling regarding: ${purpose}`;
    const { callId } = await phone.call(number, script);
    await this.ctx.bus.publish("CallStarted", this.id, { callId, number });
    return callId;
  }
}
