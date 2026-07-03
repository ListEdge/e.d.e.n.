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

  async start(ctx: EngineContext): Promise<void> {
    this.ctx = ctx;

    // Registers send_email in the shared tool registry, so anything that
    // can call a tool by name — the realtime voice relay, and eventually
    // typed conversation's own tool loop — can trigger it the same way.
    // This doesn't replace direct calls to sendEmail() below; both paths
    // end up at the same method, so approval gating behaves identically
    // no matter which door it came in through.
    await ctx.registerTool({
      id: "send_email",
      name: "Send Email",
      description: "Sends an email on the user's behalf. Requires the exact recipient email address.",
      version: "1.0.0",
      enabled: true,
      authorities: ["communicate"],
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient's email address" },
          subject: { type: "string", description: "Email subject line" },
          body: { type: "string", description: "Email body text" },
        },
        required: ["to", "subject", "body"],
      },
      handler: async (args, opts) => {
        const { to, subject, body } = args as { to?: string; subject?: string; body?: string };
        if (!to || !subject || body === undefined) {
          return "Missing required email details (to, subject, body).";
        }
        return this.sendEmail(to, subject, body, opts);
      },
    });

    await ctx.registerTool({
      id: "place_call",
      name: "Place Call",
      description: "Places a phone call on the user's behalf to deliver a message.",
      version: "1.0.0",
      enabled: true,
      authorities: ["communicate"],
      parameters: {
        type: "object",
        properties: {
          number: { type: "string", description: "Phone number to call, in international format" },
          purpose: { type: "string", description: "What Eden should say or accomplish on the call" },
        },
        required: ["number", "purpose"],
      },
      handler: async (args, opts) => {
        const { number, purpose } = args as { number?: string; purpose?: string };
        if (!number || !purpose) {
          return "Missing required call details (number, purpose).";
        }
        return this.placeCall(number, purpose, opts);
      },
    });
  }

  /**
   * Sends an email. Normally gated behind approval — pass approvalId only
   * when this call is resuming an already-approved request (the kernel's
   * resumeApproval does this); it skips asking for a second approval.
   */
  async sendEmail(
    to: string,
    subject: string,
    body: string,
    opts: { approvalId?: string } = {}
  ): Promise<string> {
    const email = this.ctx.providers.email;
    if (!email?.available()) {
      return "Email provider not configured. Add RESEND_API_KEY to my environment.";
    }

    if (!opts.approvalId) {
      const { allowed, pendingApprovalId } = await this.ctx.authorize(
        "send_email",
        "communicate",
        { to, subject, body }
      );
      if (!allowed) {
        return `I've prepared that email to ${to} but sending it needs your approval first${
          pendingApprovalId ? ` (request ${pendingApprovalId})` : ""
        }.`;
      }
    }

    await email.send(to, subject, body);
    await this.ctx.bus.publish("MessageSent", this.id, { channel: "email", to });
    return "Sent.";
  }

  /**
   * Places a call. Same pre-authorized bypass pattern as sendEmail.
   */
  async placeCall(
    number: string,
    purpose: string,
    opts: { approvalId?: string } = {}
  ): Promise<string> {
    const phone = this.ctx.providers.phone;
    if (!phone?.available()) {
      return "Phone provider not configured. Implement providers/phone against the PhoneProvider contract.";
    }

    if (!opts.approvalId) {
      const { allowed, pendingApprovalId } = await this.ctx.authorize(
        "place_call",
        "communicate",
        { number, purpose }
      );
      if (!allowed) {
        return `I'm ready to call ${number} but that needs your approval first${
          pendingApprovalId ? ` (request ${pendingApprovalId})` : ""
        }.`;
      }
    }

    const script = `Hello, this is Eden, an AI assistant. I'm calling regarding: ${purpose}`;
    const { callId } = await phone.call(number, script);
    await this.ctx.bus.publish("CallStarted", this.id, { callId, number });
    return callId;
  }
}
