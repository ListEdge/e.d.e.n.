/** Web search provider contract (Tavily, Brave, etc.). */

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
  /** Only present when options.images was requested and one was found. */
  imageUrl?: string;
}

export interface SearchOptions {
  /** "news" narrows to real-time news sources - politics, sport, current events. */
  topic?: "general" | "news";
  /** Ask the backend to also return images related to the query, loosely
   *  paired to results in order - not a guaranteed exact per-result match. */
  images?: boolean;
}

export interface SearchProvider {
  readonly id: string;
  available(): boolean;
  search(query: string, limit?: number, options?: SearchOptions): Promise<SearchHit[]>;
}
