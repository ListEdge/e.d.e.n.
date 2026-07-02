import type { Engine, EngineContext } from "../engine";

/**
 * Developer Engine — Eden's software-building arm.
 *
 * v1 ships the shape of the pipeline; the GitHub and Deployment provider
 * contracts it depends on are defined and ready for implementations.
 * Nothing here hardcodes a specific coding model — code generation goes
 * through the same AI provider layer as everything else.
 *
 * Pipeline: plan feature → generate code → validate → branch → commit →
 * pull request → preview deploy → (approval) → production deploy.
 */
export class DeveloperEngine implements Engine {
  readonly id = "developer";
  readonly name = "Developer Engine";
  private ctx!: EngineContext;

  start(ctx: EngineContext): void {
    this.ctx = ctx;
  }

  /** Ask the AI provider to draft an implementation plan for a feature. */
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
   * Full pipeline. Requires GitHub + Deployment providers to be configured;
   * until then it reports exactly what is missing rather than pretending.
   */
  async shipFeature(repo: string, description: string): Promise<string> {
    const { providers, bus } = this.ctx;
    if (!providers.github?.available()) {
      return "GitHub provider is not configured yet. Implement providers/github against the GitHubProvider contract to enable autonomous shipping.";
    }
    if (!providers.deployment?.available()) {
      return "Deployment provider is not configured yet. Implement providers/deployment against the DeploymentProvider contract.";
    }
    await bus.publish("DeploymentStarted", this.id, { repo, description });
    // Branch → commit → PR → preview happens here once providers exist.
    return "Pipeline contracts are in place; connect the providers to activate.";
  }
}
