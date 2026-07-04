import type { Engine, EngineContext } from "../engine";
import type { CapabilityManifest } from "@/types/domain";

/**
 * Capability Manager — Eden's app store, internally.
 * Capabilities are installable modules that register a manifest declaring
 * what they do and which authorities they need. The registry below ships
 * with Eden's built-in capabilities; installed modules add themselves.
 *
 * A manifest with both `parameters` and `handler` is also a real, callable
 * tool — listCallable() and callTool() are what turn the registry from a
 * static list into something the Conversation Engine (or a realtime voice
 * session) can actually invoke.
 */
export class CapabilityManager implements Engine {
  readonly id = "capabilities";
  readonly name = "Capability Manager";
  private ctx!: EngineContext;
  private registry = new Map<string, CapabilityManifest>();

  start(ctx: EngineContext): void {
    this.ctx = ctx;
    const builtIn: CapabilityManifest[] = [
      { id: "conversation", name: "Conversation", description: "Natural language interface", version: "1.0.0", enabled: true, authorities: ["read", "write"] },
      { id: "memory", name: "Memory", description: "Long-term knowledge and recall", version: "1.0.0", enabled: true, authorities: ["read", "write"] },
      { id: "planner", name: "Planner", description: "Goals, milestones and tasks", version: "1.0.0", enabled: true, authorities: ["read", "write"] },
      { id: "developer", name: "Developer", description: "Plans, writes and ships software", version: "0.1.0", enabled: false, authorities: ["write", "deploy"] },
      { id: "voice", name: "Voice", description: "Speech in and out", version: "0.1.0", enabled: false, authorities: ["read"] },
      { id: "research", name: "Research", description: "Web search and synthesis", version: "0.1.0", enabled: false, authorities: ["read"] },
      { id: "home", name: "Home", description: "Home automation scenes and devices", version: "0.1.0", enabled: false, authorities: ["write", "unlock"] },
      { id: "phone", name: "Phone", description: "Calls, voicemail, transcription", version: "0.1.0", enabled: false, authorities: ["communicate"] },
      { id: "finance", name: "Finance", description: "Payments and purchase approvals", version: "0.1.0", enabled: false, authorities: ["purchase"] },
    ];
    for (const cap of builtIn) this.registry.set(cap.id, cap);

    // Self-registered — this tool doesn't DO anything server-side beyond
    // shaping its own arguments into a result; the client is what actually
    // renders it as a floating panel. "read" authority means it never
    // needs approval — showing something on screen is never risky.
    this.registry.set("show_dashboard", {
      id: "show_dashboard",
      name: "Show Dashboard",
      description:
        "Shows something visually on screen — a summary, a list of items, or search results — instead of only describing it out loud. Use this whenever showing something would help more than just saying it: search results, comparisons, lists, or anything with more than a couple of details worth seeing.",
      version: "1.0.0",
      enabled: true,
      authorities: ["read"],
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short title shown at the top of the panel" },
          summary: {
            type: "string",
            description: "Optional 1-3 sentence explanation shown under the title",
          },
          items: {
            type: "array",
            description: "Optional list of items to show as cards — search results, comparison rows, or list entries",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                detail: { type: "string", description: "A short supporting line for this item" },
                url: { type: "string", description: "Optional link this item points to" },
              },
              required: ["title"],
            },
          },
        },
        required: ["title"],
      },
      handler: async (args) => {
        const { title, summary, items } = args as {
          title?: string;
          summary?: string;
          items?: Array<{ title?: string; detail?: string; url?: string }>;
        };
        if (!title) return "A title is required to show something.";
        const cleanItems = (items ?? [])
          .filter((i): i is { title: string; detail?: string; url?: string } => Boolean(i?.title))
          .slice(0, 12);
        return JSON.stringify({ dashboard: { title, summary: summary ?? "", items: cleanItems } });
      },
    });
  }

  async register(manifest: CapabilityManifest): Promise<void> {
    this.registry.set(manifest.id, manifest);
    await this.ctx.bus.publish("CapabilityRegistered", this.id, {
      capabilityId: manifest.id,
    });
  }

  list(): CapabilityManifest[] {
    return [...this.registry.values()];
  }

  /** Only manifests that are switched on and actually invocable. */
  listCallable(): CapabilityManifest[] {
    return this.list().filter((c) => c.enabled && c.parameters && c.handler);
  }

  /**
   * Runs a registered tool by name. Checks every authority the manifest
   * declares before running it — read/write pass automatically, anything
   * higher creates a pending approval (same policy as everything else in
   * Eden) and the call stops there until a person signs off. This is the
   * one place tool authorization happens, so no engine's handler needs
   * to remember to gate itself.
   *
   * Pass opts.approvalId only when resuming an already-approved call
   * (the kernel's resumeApproval does this) — it skips re-authorizing.
   */
  async callTool(
    name: string,
    args: Record<string, unknown>,
    opts: { approvalId?: string } = {}
  ): Promise<string> {
    const manifest = this.registry.get(name);
    if (!manifest || !manifest.enabled || !manifest.parameters || !manifest.handler) {
      return `Tool "${name}" is not available.`;
    }

    if (!opts.approvalId) {
      for (const authority of manifest.authorities) {
        // Store args flat, not nested — this is what lets resuming an
        // approval later hand the exact same shape back to the handler,
        // regardless of whether the call originally came from here or
        // from an engine's own direct authorize() check.
        const { allowed, pendingApprovalId } = await this.ctx.authorize(name, authority, args);
        if (!allowed) {
          return `That needs your approval first${
            pendingApprovalId ? ` (request ${pendingApprovalId})` : ""
          }.`;
        }
      }
    }

    return manifest.handler(args, opts);
  }
}
