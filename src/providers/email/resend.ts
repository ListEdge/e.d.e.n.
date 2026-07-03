import { config } from "@/lib/config";
import type { EmailProvider } from "./types";

/**
 * Resend — the send half of Eden's email. Reading an inbox is a
 * different job (needs OAuth against a real mailbox); see the Gmail
 * entry in docs/EDEN-INTEGRATIONS.md when that's wanted.
 */
export class ResendEmailProvider implements EmailProvider {
  readonly id = "resend";

  available(): boolean {
    return Boolean(config.email.resendKey);
  }

  async send(to: string, subject: string, body: string): Promise<void> {
    // Resend's shared onboarding sender works before a domain is verified —
    // see docs/EDEN-INTEGRATIONS.md 5.1 for adding a real "from" address.
    const from = config.email.from || "Eden <onboarding@resend.dev>";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.email.resendKey}`,
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text: body,
      }),
    });

    if (!res.ok) {
      throw new Error(`Resend API error ${res.status}: ${await res.text()}`);
    }
  }

  async listRecent(): Promise<Array<{ from: string; subject: string; at: string }>> {
    // Resend is send-only — there's no inbox to list here.
    return [];
  }
}
