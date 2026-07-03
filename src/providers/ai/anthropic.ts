import { config } from "@/lib/config";
import { readSSELines } from "./sse";
import type { AIChatRequest, AIChatResponse, AIProvider } from "./types";

export class AnthropicProvider implements AIProvider {
  readonly id = "anthropic";
  readonly defaultModel = "claude-sonnet-4-5";

  available(): boolean {
    return Boolean(config.ai.anthropicKey);
  }

  async chat(request: AIChatRequest): Promise<AIChatResponse> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.ai.anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.defaultModel,
        max_tokens: request.maxTokens ?? 1024,
        temperature: request.temperature ?? 0.7,
        system: request.system,
        messages: request.messages,
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    const text = (data.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("\n");

    return { text, provider: this.id, model: data.model ?? this.defaultModel };
  }

  async *chatStream(request: AIChatRequest): AsyncGenerator<string> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.ai.anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.defaultModel,
        max_tokens: request.maxTokens ?? 1024,
        temperature: request.temperature ?? 0.7,
        system: request.system,
        messages: request.messages,
        stream: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
    }

    for await (const payload of readSSELines(res)) {
      let event: { type?: string; delta?: { type?: string; text?: string } };
      try {
        event = JSON.parse(payload);
      } catch {
        continue;
      }
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        const text = event.delta.text;
        if (text) yield text;
      }
    }
  }
}
