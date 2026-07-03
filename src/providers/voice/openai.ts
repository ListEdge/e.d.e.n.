import { config } from "@/lib/config";
import type { VoiceProvider } from "./types";

/**
 * Eden's voice — OpenAI text-to-speech (gpt-4o-mini-tts, onyx) and
 * speech-to-text (gpt-4o-mini-transcribe). Reuses the same OpenAI key
 * already used for chat; nothing extra to configure.
 */
export class OpenAIVoiceProvider implements VoiceProvider {
  readonly id = "openai";
  private readonly defaultVoice = "onyx";

  available(): boolean {
    return Boolean(config.ai.openaiKey);
  }

  async speak(text: string, voice?: string): Promise<ArrayBuffer> {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.ai.openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: voice ?? this.defaultVoice,
        input: text,
        response_format: "mp3",
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI TTS error ${res.status}: ${await res.text()}`);
    }

    return res.arrayBuffer();
  }

  async transcribe(audio: ArrayBuffer): Promise<string> {
    const form = new FormData();
    form.append("file", new Blob([audio]), "audio.webm");
    form.append("model", "gpt-4o-mini-transcribe");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { authorization: `Bearer ${config.ai.openaiKey}` },
      body: form,
    });

    if (!res.ok) {
      throw new Error(`OpenAI transcription error ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as { text?: string };
    return data.text ?? "";
  }
}
