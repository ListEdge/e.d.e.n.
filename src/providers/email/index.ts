import { ResendEmailProvider } from "./resend";
import type { EmailProvider } from "./types";

export type { EmailProvider } from "./types";

/**
 * Only one email backend today. Same factory shape as every other
 * provider category — swapping or adding one later is a new file plus
 * one line here.
 */
export function createEmailProvider(): EmailProvider | null {
  const resend = new ResendEmailProvider();
  return resend.available() ? resend : null;
}
