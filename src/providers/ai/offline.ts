import { config } from "@/lib/config";
import type { AIChatRequest, AIChatResponse, AIProvider } from "./types";

/**
 * Fallback used when no AI key is configured, so Eden still boots,
 * renders, and responds gracefully instead of crashing.
 */
export class OfflineProvider implements AIProvider {
  readonly id = "offline";
  readonly defaultModel = "none";

  available(): boolean {
    return true;
  }

  async chat(_request: AIChatRequest): Promise<AIChatResponse> {
    const title = config.identity.userTitle;
    return {
      text: `My cognitive core is not yet connected, ${title}. Add an ANTHROPIC_API_KEY, OPENAI_API_KEY or GOOGLE_API_KEY to my environment and I will come fully online.`,
      provider: this.id,
      model: this.defaultModel,
    };
  }
}
