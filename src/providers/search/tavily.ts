import { config } from "@/lib/config";
import type { SearchProvider } from "./types";

/**
 * Tavily — Eden's window onto current events and live facts.
 * Free tier covers normal personal use; see docs/DEPLOYMENT.md.
 */
export class TavilySearchProvider implements SearchProvider {
  readonly id = "tavily";

  available(): boolean {
    return Boolean(config.search.tavilyKey);
  }

  async search(
    query: string,
    limit = 5
  ): Promise<Array<{ title: string; url: string; snippet: string }>> {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: config.search.tavilyKey,
        query,
        max_results: Math.max(1, Math.min(limit, 10)),
        search_depth: "basic",
        include_answer: false,
      }),
    });

    if (!res.ok) {
      throw new Error(`Tavily API error ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };

    return (data.results ?? []).map((r) => ({
      title: r.title ?? "Untitled",
      url: r.url ?? "",
      snippet: r.content ?? "",
    }));
  }
}
