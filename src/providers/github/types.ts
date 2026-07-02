/** Source control provider contract (GitHub first). */
export interface GitHubProvider {
  readonly id: string;
  available(): boolean;
  createBranch(repo: string, branch: string, from?: string): Promise<void>;
  commit(repo: string, branch: string, message: string, files: Record<string, string>): Promise<string>;
  openPullRequest(repo: string, branch: string, title: string, body: string): Promise<{ url: string }>;
}
