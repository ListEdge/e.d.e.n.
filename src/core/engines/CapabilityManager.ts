import type { Engine, EngineContext } from "../engine";
import type { CapabilityManifest } from "@/types/domain";

/**
 * Capability Manager - Eden's app store, internally.
 * Capabilities are installable modules that register a manifest declaring
 * what they do and which authorities they need. The registry below ships
 * with Eden's built-in capabilities; installed modules add themselves.
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
      { id: "developer", name: "Developer", description: "Plans, writes and ships software", version: "1.0.0", enabled: true, authorities: ["write", "deploy"] },
      { id: "voice", name: "Voice", description: "Speech in and out", version: "0.1.0", enabled: false, authorities: ["read"] },
      { id: "research", name: "Research", description: "Web search and synthesis", version: "0.1.0", enabled: false, authorities: ["read"] },
      { id: "home", name: "Home", description: "Home automation scenes and devices", version: "0.1.0", enabled: false, authorities: ["write", "unlock"] },
      { id: "phone", name: "Phone", description: "Calls, voicemail, transcription", version: "0.1.0", enabled: false, authorities: ["communicate"] },
      { id: "finance", name: "Finance", description: "Payments and purchase approvals", version: "0.1.0", enabled: false, authorities: ["purchase"] },
    ];
    for (const cap of builtIn) this.registry.set(cap.id, cap);

    // Self-registered - this tool mostly just shapes its own arguments into
    // a result the client renders as a floating panel. "read" authority
    // means it never needs approval - showing something is never risky.
    // When searchQuery is set, it also does a real web search itself
    // (rather than trusting the model to retype search results by hand)
    // so what's shown is exactly what was found, not a paraphrase of it.
    //
    // size/region let more than one thing be visible at once - up to four
    // "quadrant" items in the corners, or one "full" item that takes over
    // completely. The actual placement math happens client-side (only the
    // browser knows what's currently occupying which corner), so this
    // handler just passes size/region through as part of its result.
    this.registry.set("show_dashboard", {
      id: "show_dashboard",
      name: "Show Dashboard",
      description:
        "Shows something visually on screen instead of only describing it out loud - a summary, a list of items, search results, news, or a simple bar chart. Multiple things can be visible at once in different corners of the screen. Check get_dashboard_state first if you want to know what's already showing before deciding where to put something new. Set searchQuery to have Eden search the web and show the real results instead of writing the items yourself.",
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
            description: "Manually written items to show as cards. Ignored if searchQuery is set.",
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
          chart: {
            type: "object",
            description: "Optional simple bar chart - use this for comparisons, rankings, or any numeric data worth visualizing.",
            properties: {
              labels: { type: "array", items: { type: "string" }, description: "One label per bar" },
              values: { type: "array", items: { type: "number" }, description: "One number per bar, same order as labels" },
            },
          },
          searchQuery: {
            type: "string",
            description: "If set, Eden searches the web for this and shows the real results as items instead of using the items field.",
          },
          newsOnly: {
            type: "boolean",
            description: "When searchQuery is set, true narrows to real-time news sources for current-events questions.",
          },
          withImages: {
            type: "boolean",
            description: "When searchQuery is set, true includes a picture with each result where one is available.",
          },
          size: {
            type: "string",
            enum: ["quadrant", "full"],
            description: "How much space this takes. Default to quadrant so multiple things can be visible together. Use full only for one big, detailed thing when nothing else needs to be on screen at the same time.",
          },
          region: {
            type: "string",
            enum: ["topLeft", "topRight", "bottomLeft", "bottomRight"],
            description: "Optional preferred corner when size is quadrant. If omitted, or already occupied, an empty corner is chosen automatically.",
          },
        },
        required: ["title"],
      },
      handler: async (args) => {
        const parsed = args as {
          title?: string;
          summary?: string;
          items?: Array<{ title?: string; detail?: string; url?: string }>;
          chart?: { labels?: string[]; values?: number[] };
          searchQuery?: string;
          newsOnly?: boolean;
          withImages?: boolean;
          size?: string;
          region?: string;
        };
        const title = parsed.title;
        if (!title) return "A title is required to show something.";

        let finalItems = (parsed.items ?? [])
          .filter((i): i is { title: string; detail?: string; url?: string } => Boolean(i?.title))
          .slice(0, 12);

        if (typeof parsed.searchQuery === "string" && parsed.searchQuery.trim()) {
          const search = ctx.providers.search;
          if (search && search.available()) {
            try {
              const hits = await search.search(parsed.searchQuery, 8, {
                topic: parsed.newsOnly ? "news" : "general",
                images: Boolean(parsed.withImages),
              });
              finalItems = hits.map((hit) => ({
                title: hit.title,
                detail: hit.snippet,
                url: hit.url,
                imageUrl: hit.imageUrl,
              }));
            } catch {
              // search failed - fall through with whatever manual items existed
            }
          }
        }

        let chart: { labels: string[]; values: number[] } | undefined;
        if (
          parsed.chart &&
          Array.isArray(parsed.chart.labels) &&
          Array.isArray(parsed.chart.values) &&
          parsed.chart.values.length > 0
        ) {
          chart = {
            labels: parsed.chart.labels.slice(0, 12).map(function (l) { return String(l); }),
            values: parsed.chart.values.slice(0, 12).map(function (v) { return Number(v) || 0; }),
          };
        }

        const size = parsed.size === "full" ? "full" : "quadrant";
        const validRegions = ["topLeft", "topRight", "bottomLeft", "bottomRight"];
        const region = validRegions.indexOf(parsed.region ?? "") >= 0 ? parsed.region : undefined;

        return JSON.stringify({
          dashboard: {
            title: title,
            summary: parsed.summary ?? "",
            items: finalItems,
            chart: chart,
            size: size,
            region: region,
          },
        });
      },
    });

    // These two are answered entirely on the client side - the server has
    // no idea what's actually rendered in the browser, only the browser
    // does. They're still registered here so the model knows they exist
    // and so there's an honest fallback if that interception is ever
    // bypassed for some reason.
    this.registry.set("get_dashboard_state", {
      id: "get_dashboard_state",
      name: "Get Dashboard State",
      description:
        "Returns exactly what is currently shown on screen right now, if anything - which corners are occupied and what each one contains. Check this before placing something new if you want a specific empty spot, and whenever asked what's currently on screen.",
      version: "1.0.0",
      enabled: true,
      authorities: ["read"],
      parameters: { type: "object", properties: {} },
      handler: async function () {
        return JSON.stringify({ screen: [], note: "Dashboard state is tracked in the browser and should have been answered there directly." });
      },
    });

    this.registry.set("dismiss_dashboard", {
      id: "dismiss_dashboard",
      name: "Dismiss Dashboard",
      description:
        "Closes whatever is currently on screen that matches the given reference - usually its title or a close description of it, like 'the news one' or 'the chart'.",
      version: "1.0.0",
      enabled: true,
      authorities: ["read"],
      parameters: {
        type: "object",
        properties: {
          reference: { type: "string", description: "What to close - matched against what's currently on screen" },
        },
        required: ["reference"],
      },
      handler: async function () {
        return "Dashboard dismissal should have been handled directly in the browser.";
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
   * declares before running it - read/write pass automatically, anything
   * higher creates a pending approval (same policy as everything else in
   * Eden) and the call stops there until a person signs off. This is the
   * one place tool authorization happens, so no engine's handler needs
   * to remember to gate itself.
   *
   * Pass opts.approvalId only when resuming an already-approved call
   * (the kernel's resumeApproval does this) - it skips re-authorizing.
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
