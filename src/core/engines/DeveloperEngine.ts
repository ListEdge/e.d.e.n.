import { config } from "@/lib/config";
import type { Engine, EngineContext } from "../engine";

/**
 * Developer Engine - Eden's software-building arm.
 *
 * Deliberately scoped to draft, never ship: it reads existing files,
 * writes a change, and opens a pull request - it never merges and never
 * triggers a deploy itself. Vercel already builds a preview for every
 * pull request automatically, so the "check it before it's live" step
 * happens naturally without Eden needing its own deploy step at all.
 *
 * Restricted to a single, explicitly configured repository
 * (EDEN_DEV_REPO, read from config, never a tool argument) - the model
 * is never given a repo name to supply, so it has no way to ask Eden to
 * touch anything else, no matter how it's asked.
 */
export class DeveloperEngine implements Engine {
  readonly id = "developer";
  readonly name = "Developer Engine";
  private ctx!: EngineContext;

  async start(ctx: EngineContext): Promise<void> {
    this.ctx = ctx;

    await ctx.registerTool({
      id: "propose_code_change",
      name: "Propose Code Change",
      description:
        "Reads specific files in Eden's own codebase, writes a change, and opens a pull request for review. Never merges or deploys - always requires the user's approval, and even once approved, only opens a pull request; nothing goes live until the user reviews the preview and merges it themselves. Only works on Eden's own repository. The user must name the exact file path(s) to change.",
      version: "1.0.0",
      // Only advertised once genuinely configured - otherwise Eden would
      // create an approval request for something that's guaranteed to
      // fail afterward, which is confusing rather than honest.
      enabled: Boolean(config.github.token && config.github.devRepo),
      authorities: ["deploy"],
      parameters: {
        type: "object",
        properties: {
          description: { type: "string", description: "What change to make, in plain English" },
          files: {
            type: "array",
            description:
              "Exact file paths in the repo to read and modify, e.g. src/components/hud/TopBar.tsx",
            items: { type: "string" },
          },
        },
        required: ["description", "files"],
      },
      handler: async (args, opts) => {
        const parsed = args as { description?: string; files?: string[] };
        if (!parsed.description || !parsed.files || parsed.files.length === 0) {
          return "I need both a description of the change and the exact file path or paths to edit.";
        }
        return this.proposeChange(parsed.description, parsed.files, opts);
      },
    });
  }

  /** Ask the AI provider to draft an implementation plan for a feature. No repo access needed. */
  async planFeature(description: string): Promise<string> {
    const response = await this.ctx.providers.ai.chat({
      system:
        "You are a senior software engineer. Produce a short, numbered implementation plan. Plain text.",
      messages: [{ role: "user", content: description }],
      maxTokens: 700,
      temperature: 0.3,
    });
    return response.text;
  }

  /**
   * Reads the named files, asks the AI to write the change, and opens a
   * pull request. Pass opts.approvalId only when resuming an
   * already-approved request - it skips asking again.
   */
  async proposeChange(
    description: string,
    files: string[],
    opts: { approvalId?: string } = {}
  ): Promise<string> {
    const providers = this.ctx.providers;
    const bus = this.ctx.bus;
    const repo = config.github.devRepo;

    if (!repo) {
      return "No repository is configured for Eden to work in yet. Set EDEN_DEV_REPO in the environment.";
    }
    if (!providers.github || !providers.github.available()) {
      return "GitHub is not connected yet. Add GITHUB_TOKEN to enable this.";
    }

    if (!opts.approvalId) {
      const authResult = await this.ctx.authorize("propose_code_change", "deploy", {
        description: description,
        files: files,
        repo: repo,
      });
      if (!authResult.allowed) {
        const suffix = authResult.pendingApprovalId
          ? " (request " + authResult.pendingApprovalId + ")"
          : "";
        return "I've got that change ready but opening the pull request needs your approval first" + suffix + ".";
      }
    }

    const currentFiles: Record<string, string> = {};
    try {
      for (const path of files) {
        const file = await providers.github.getFile(repo, path);
        if (file) currentFiles[path] = file.content;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return "I hit a problem reading from the repository: " + message;
    }

    if (Object.keys(currentFiles).length === 0) {
      return "I couldn't find any of those files in the repository - check the exact paths.";
    }

    const filesContextParts: string[] = [];
    for (const path of Object.keys(currentFiles)) {
      filesContextParts.push("--- " + path + " ---\n" + currentFiles[path]);
    }
    const filesContext = filesContextParts.join("\n\n");

    let parsed: { files?: Record<string, string>; summary?: string };
    try {
      const response = await providers.ai.chat({
        system: [
          "You are a senior software engineer making a precise, minimal code change to an existing codebase.",
          'Respond with ONLY strict JSON, no prose, no markdown fences: {"files": {"path": "entire new file content", ...}, "summary": "one sentence describing the change"}',
          "Include the COMPLETE new content of every file you touch, not a diff or partial snippet.",
          "Only modify files that were given to you - never invent a new file path.",
        ].join(" "),
        messages: [
          {
            role: "user",
            content: "Current files:\n\n" + filesContext + "\n\nRequested change: " + description,
          },
        ],
        maxTokens: 4000,
        temperature: 0.2,
        json: true,
      });
      const clean = response.text.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(clean);
    } catch {
      return "I couldn't turn that into a valid code change - try describing it more precisely.";
    }

    const newFiles = parsed.files ?? {};
    if (Object.keys(newFiles).length === 0) {
      return "The model didn't produce any file changes to make.";
    }

    try {
      const branch = "eden/" + Date.now();
      const title = ("Eden: " + (parsed.summary ?? description)).slice(0, 120);

      await providers.github.createBranch(repo, branch);
      await providers.github.commit(repo, branch, title, newFiles);
      const pr = await providers.github.openPullRequest(
        repo,
        branch,
        title,
        "Requested: " +
          description +
          "\n\n" +
          (parsed.summary ?? "") +
          "\n\nOpened automatically by Eden. Review the diff and the preview deployment before merging - nothing here has been merged or deployed."
      );

      await bus.publish("DeploymentStarted", this.id, { repo: repo, branch: branch, description: description });
      return "I've opened a pull request: " + pr.url + ". Nothing is live yet - review it and merge it yourself when you're happy with it.";
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return "I hit a problem opening that pull request: " + message;
    }
  }
}
