import { config } from "@/lib/config";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { OfflineProvider } from "./offline";
import { OpenAIProvider } from "./openai";
import type { AIProvider } from "./types";

export type { AIProvider, AIChatRequest, AIChatResponse, AIMessage } from "./types";

/**
 * Chooses the active AI provider.
 * EDEN_AI_PROVIDER=anthropic|openai|gemini pins one; "auto" picks the
 * first provider with a configured key. Falls back to a graceful
 * offline responder so Eden never hard-crashes on a missing key.
 */
export function createAIProvider(): AIProvider {
  const candidates: AIProvider[] = [
    new AnthropicProvider(),
    new OpenAIProvider(),
    new GeminiProvider(),
  ];

  const preferred = config.ai.preferred;
  if (preferred !== "auto") {
    const pinned = candidates.find((c) => c.id === preferred);
    if (pinned?.available()) return pinned;
  }

  return candidates.find((c) => c.available()) ?? new OfflineProvider();
}
