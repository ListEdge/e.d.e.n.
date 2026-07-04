/**
 * Real-time voice-to-voice provider contract.
 * Unlike VoiceProvider (request/response text-to-speech), this doesn't
 * generate audio itself — it mints short-lived credentials that let a
 * browser open a direct, continuous audio connection with the model.
 * Eden's server is never in the audio path once a session starts.
 */

export interface RealtimeToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface RealtimeSessionConfig {
  instructions: string;
  voice?: string;
  tools?: RealtimeToolDefinition[];
}

export interface RealtimeSession {
  /** Short-lived token (looks like "ek_...") — safe to hand to the browser. */
  clientSecret: string;
  expiresAt: string;
  model: string;
  voice: string;
}

export interface RealtimeProvider {
  readonly id: string;
  available(): boolean;
  createSession(config: RealtimeSessionConfig): Promise<RealtimeSession>;
}
