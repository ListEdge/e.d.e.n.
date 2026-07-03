import { TavilySearchProvider } from "./tavily";
import type { SearchProvider } from "./types";

export type { SearchProvider } from "./types";

/**
 * Only one search backend today. The factory shape matches every other
 * provider category so adding a second (e.g. Brave) later is a one-line
 * change here, nothing else.
 */
export function createSearchProvider(): SearchProvider | null {
  const tavily = new TavilySearchProvider();
  return tavily.available() ? tavily : null;
}
