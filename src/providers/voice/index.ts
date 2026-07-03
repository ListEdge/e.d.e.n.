import { OpenAIVoiceProvider } from "./openai";
import type { VoiceProvider } from "./types";

export type { VoiceProvider } from "./types";

/**
 * Only one voice backend today. Same factory shape as every other
 * provider category — adding ElevenLabs later is a new file plus one
 * line here.
 */
export function createVoiceProvider(): VoiceProvider | null {
  const openai = new OpenAIVoiceProvider();
  return openai.available() ? openai : null;
}
