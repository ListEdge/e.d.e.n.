import { config } from "@/lib/config";
import type { GitHubFile, GitHubProvider } from "./types";

const API_VERSION = "2022-11-28";

export class GitHubRestProvider implements GitHubProvider {
  readonly id = "github";

  available(): boolean {
    return Boolean(config.github.token);
  }

  private headers(): Record<string, string> {
    return {
      Authorization: "Bearer " + config.github.token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": API_VERSION,
      "Content-Type": "application/json",
    };
  }

  async getFile(repo: string, path: string, ref?: string): Promise<GitHubFile | null> {
    const refQuery = ref ? "?ref=" + encodeURIComponent(ref) : "";
    const url = "https://api.github.com/repos/" + repo + "/contents/" + path + refQuery;

    const res = await fetch(url, { headers: this.headers() });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error("GitHub getFile error " + res.status + ": " + (await res.text()));
    }

    const data = (await res.json()) as { content?: string; sha?: string };
    if (!data.content || !data.sha) return null;

    const cleaned = data.content.replace(/\n/g, "");
    const content = Buffer.from(cleaned, "base64").toString("utf-8");
    return { content, sha: data.sha };
  }

  async createBranch(repo: string, branch: string, from?: string): Promise<void> {
    const base = from ?? config.github.baseBranch;

    const refUrl = "https://api.github.com/repos/" + repo + "/git/ref/heads/" + encodeURIComponent(base);
    const refRes = await fetch(refUrl, { headers: this.headers() });
    if (!refRes.ok) {
      throw new Error("GitHub createBranch (reading base) error " + refRes.status + ": " + (await refRes.text()));
    }
    const refData = (await refRes.json()) as { object?: { sha?: string } };
    const baseSha = refData.object?.sha;
    if (!baseSha) {
      throw new Error('Could not resolve base branch "' + base + '"');
    }

    const createRes = await fetch("https://api.github.com/repos/" + repo + "/git/refs", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ ref: "refs/heads/" + branch, sha: baseSha }),
    });
    if (!createRes.ok) {
      throw new Error("GitHub createBranch error " + createRes.status + ": " + (await createRes.text()));
    }
  }

  async commit(
    repo: string,
    branch: string,
    message: string,
    files: Record<string, string>
  ): Promise<string> {
    let lastSha = "";

    for (const path of Object.keys(files)) {
      const content = files[path];
      const existing = await this.getFile(repo, path, branch).catch(function () {
        return null;
      });

      const body: Record<string, unknown> = {
        message: message,
        content: Buffer.from(content, "utf-8").toString("base64"),
        branch: branch,
      };
      if (existing) body.sha = existing.sha;

      const res = await fetch("https://api.github.com/repos/" + repo + "/contents/" + path, {
        method: "PUT",
        headers: this.headers(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error("GitHub commit error " + res.status + " for " + path + ": " + (await res.text()));
      }
      const data = (await res.json()) as { commit?: { sha?: string } };
      if (data.commit?.sha) lastSha = data.commit.sha;
    }

    return lastSha;
  }

  async openPullRequest(
    repo: string,
    branch: string,
    title: string,
    body: string
  ): Promise<{ url: string }> {
    const res = await fetch("https://api.github.com/repos/" + repo + "/pulls", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        title: title,
        body: body,
        head: branch,
        base: config.github.baseBranch,
      }),
    });
    if (!res.ok) {
      throw new Error("GitHub openPullRequest error " + res.status + ": " + (await res.text()));
    }
    const data = (await res.json()) as { html_url?: string };
    return { url: data.html_url ?? "" };
  }
}
