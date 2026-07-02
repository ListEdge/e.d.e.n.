import { config } from "@/lib/config";
import type { AIChatRequest, AIChatResponse, AIProvider } from "./types";

export class GeminiProvider implements AIProvider {
  readonly id = "gemini";
  readonly defaultModel = "gemini-2.0-flash";

  available(): boolean {
    return Boolean(config.ai.googleKey);
  }

  async chat(request: AIChatRequest): Promise<AIChatResponse> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.defaultModel}:generateContent?key=${config.ai.googleKey}`;

    const contents = request.messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: request.system
          ? { parts: [{ text: request.system }] }
          : undefined,
        generationConfig: {
          maxOutputTokens: request.maxTokens ?? 1024,
          temperature: request.temperature ?? 0.7,
          ...(request.json ? { responseMimeType: "application/json" } : {}),
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    const text =
      data.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? "")
        .join("") ?? "";

    return { text, provider: this.id, model: this.defaultModel };
  }
}
