import type { Engine, EngineContext } from "../engine";

/**
 * Voice Engine — Eden's ears and voice.
 * Fully shaped, awaiting a VoiceProvider implementation (e.g. OpenAI TTS,
 * ElevenLabs). The engine never knows which vendor is behind the provider.
 */
export class VoiceEngine implements Engine {
  readonly id = "voice";
  readonly name = "Voice Engine";
  private ctx!: EngineContext;

  start(ctx: EngineContext): void {
    this.ctx = ctx;
  }

  async speak(text: string): Promise<ArrayBuffer | null> {
    const voice = this.ctx.providers.voice;
    if (!voice?.available()) return null;
    return voice.speak(text);
  }

  async transcribe(audio: ArrayBuffer): Promise<string | null> {
    const voice = this.ctx.providers.voice;
    if (!voice?.available()) return null;
    return voice.transcribe(audio);
  }
}
