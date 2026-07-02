import { config } from "@/lib/config";
import type { AIChatRequest, AIChatResponse, AIProvider } from "./types";

export class OpenAIProvider implements AIProvider {
  readonly id = "openai";
  readonly defaultModel = "gpt-4o";

  available(): boolean {
    return Boolean(config.ai.openaiKey);
  }

  async chat(request: AIChatRequest): Promise<AIChatResponse> {
    const messages = [
      ...(request.system ? [{ role: "system", content: request.system }] : []),
      ...request.messages,
    ];

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.ai.openaiKey}`,
      },
      body: JSON.stringify({
        model: this.defaultModel,
        max_tokens: request.maxTokens ?? 1024,
        temperature: request.temperature ?? 0.7,
        messages,
        ...(request.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    return {
      text: data.choices?.[0]?.message?.content ?? "",
      provider: this.id,
      model: data.model ?? this.defaultModel,
    };
  }
}
