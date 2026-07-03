import { OpenAIRealtimeProvider } from "./openai";
import type { RealtimeProvider } from "./types";

export type { RealtimeProvider, RealtimeSession, RealtimeSessionConfig } from "./types";

/**
 * Only one realtime backend today. Same factory shape as every other
 * provider category — swapping or adding one later is a new file plus
 * one line here.
 */
export function createRealtimeProvider(): RealtimeProvider | null {
  const openai = new OpenAIRealtimeProvider();
  return openai.available() ? openai : null;
}
