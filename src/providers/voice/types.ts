/** Voice provider contract — text-to-speech and speech-to-text. */
export interface VoiceProvider {
  readonly id: string;
  available(): boolean;
  speak(text: string, voice?: string): Promise<ArrayBuffer>;
  transcribe(audio: ArrayBuffer): Promise<string>;
}
