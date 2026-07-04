import { GitHubRestProvider } from "./rest";
import type { GitHubProvider } from "./types";

export type { GitHubProvider, GitHubFile } from "./types";

export function createGitHubProvider(): GitHubProvider | null {
  const provider = new GitHubRestProvider();
  return provider.available() ? provider : null;
}
