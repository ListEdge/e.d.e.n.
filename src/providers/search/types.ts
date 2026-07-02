/** Web search provider contract (Tavily, Brave, etc.). */
export interface SearchProvider {
  readonly id: string;
  available(): boolean;
  search(query: string, limit?: number): Promise<Array<{ title: string; url: string; snippet: string }>>;
}
