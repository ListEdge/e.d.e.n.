import { config } from "@/lib/config";
import type { SearchHit, SearchOptions, SearchProvider } from "./types";

/**
 * Tavily - Eden's window onto current events and live facts.
 * Free tier covers normal personal use; see docs/DEPLOYMENT.md.
 */
export class TavilySearchProvider implements SearchProvider {
  readonly id = "tavily";

  available(): boolean {
    return Boolean(config.search.tavilyKey);
  }

  async search(query: string, limit = 5, options: SearchOptions = {}): Promise<SearchHit[]> {
    const wantsImages = Boolean(options.images);

    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: config.search.tavilyKey,
        query,
        max_results: Math.max(1, Math.min(limit, 10)),
        search_depth: "basic",
        include_answer: false,
        topic: options.topic ?? "general",
        include_images: wantsImages,
      }),
    });

    if (!res.ok) {
      throw new Error(`Tavily API error ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string }>;
      images?: Array<string | { url?: string }>;
    };

    // Tavily's images come back as one query-level list, not tied to a
    // specific result. Pairing them in order with the text results is a
    // reasonable heuristic, not a guaranteed exact match.
    const imageUrls = (data.images ?? [])
      .map((img) => (typeof img === "string" ? img : img.url))
      .filter((url): url is string => Boolean(url));

    return (data.results ?? []).map((r, i) => ({
      title: r.title ?? "Untitled",
      url: r.url ?? "",
      snippet: r.content ?? "",
      imageUrl: wantsImages ? imageUrls[i] : undefined,
    }));
  }
}
