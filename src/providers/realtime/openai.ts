import { config } from "@/lib/config";
import type { RealtimeProvider, RealtimeSession, RealtimeSessionConfig } from "./types";

/**
 * Mints short-lived credentials for a browser to open a direct
 * voice-to-voice connection with OpenAI's Realtime API. Eden's server
 * never touches the actual audio — its entire job for a voice session
 * is to hand out this token, then later relay tool calls and transcripts
 * (see docs/REALTIME-VOICE-ARCHITECTURE.md for the full design).
 *
 * Endpoint and request shape confirmed against current (GA) OpenAI docs
 * at the time this was written. This surface has changed shape before —
 * worth a quick doc check if this ever starts returning unexpected errors.
 */
export class OpenAIRealtimeProvider implements RealtimeProvider {
  readonly id = "openai";

  available(): boolean {
    return Boolean(config.ai.openaiKey);
  }

  async createSession(sessionConfig: RealtimeSessionConfig): Promise<RealtimeSession> {
    const model = config.realtime.model;
    const voice = sessionConfig.voice ?? config.realtime.voice;

    const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.ai.openaiKey}`,
      },
      body: JSON.stringify({
        // Short TTL is deliberate — the browser should consume this within
        // seconds to open the WebRTC connection, not hold onto it.
        expires_after: { anchor: "created_at", seconds: 60 },
        session: {
          type: "realtime",
          model,
          instructions: sessionConfig.instructions,
          audio: {
            input: {
              // Plain volume-based detection (the default) treats any loud
              // enough sound as "the user started talking" and interrupts
              // Eden — background noise included. semantic_vad judges
              // whether the audio actually sounds like someone trying to
              // say something, which is what stops false interruptions.
              turn_detection: { type: "semantic_vad" },
            },
            output: { voice },
          },
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI Realtime session error ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as { value: string; expires_at: number };
    return {
      clientSecret: data.value,
      expiresAt: new Date(data.expires_at * 1000).toISOString(),
      model,
      voice,
    };
  }
}
