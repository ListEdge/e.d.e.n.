/**
 * The AI provider contract.
 * No engine ever calls a model directly — everything goes through this.
 * Swapping OpenAI for Anthropic for Gemini (or a future model) is a
 * one-line configuration change, not a rewrite.
 */

export interface AIMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  /** On an assistant message that called a tool. */
  toolCall?: { id: string; name: string; arguments: Record<string, unknown> };
  /** On a tool-result message — which call this result answers. */
  toolCallId?: string;
}

export interface AIChatRequest {
  system?: string;
  messages: AIMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Ask the model to reply with strict JSON. Providers do their best. */
  json?: boolean;
}

export interface AIChatResponse {
  text: string;
  provider: string;
  model: string;
}

export interface AIProvider {
  readonly id: string;
  readonly defaultModel: string;
  available(): boolean;
  chat(request: AIChatRequest): Promise<AIChatResponse>;
  /** Yields plain text deltas as the model generates them. */
  chatStream(request: AIChatRequest): AsyncGenerator<string>;
}
