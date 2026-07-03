/**
 * Minimal Server-Sent-Events reader shared by every streaming AI provider.
 * Reads a fetch Response body and yields each event's raw `data:` payload
 * as a string. Providers parse that payload themselves since Anthropic,
 * OpenAI, and Gemini each shape their chunks differently.
 */
export async function* readSSELines(response: Response): AsyncGenerator<string> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload) yield payload;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
