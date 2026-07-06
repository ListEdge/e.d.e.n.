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
        "Shows something visually on screen instead of only describing it out loud - a summary, a list of items, search results, news, or a simple bar chart. Multiple things can be visible at once in different corners of the screen. A quadrant only fits a handful of items or bars - if there's more than that, it automatically becomes full-size so nothing gets cut off, regardless of what size you request. Check get_dashboard_state first if you want to know what's already showing before deciding where to put something new. Use move_dashboard afterward if something already on screen needs to be repositioned or resized. Set searchQuery to have Eden search the web and show the real results instead of writing the items yourself.",
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

        const requestedSize = parsed.size === "full" ? "full" : "quadrant";
        const validRegions = ["topLeft", "topRight", "bottomLeft", "bottomRight"];
        const region = validRegions.indexOf(parsed.region ?? "") >= 0 ? parsed.region : undefined;

        // A quadrant only has room for a handful of items or bars - rather
        // than trust the model's judgment on this every time, the code
        // enforces it: too much content and it becomes full-size
        // regardless of what was requested, so nothing silently gets
        // cramped or cut off.
        // Only charts force an upgrade now - a chart genuinely doesn't work
        // cramped into a small box, but a list of items can just scroll
        // within its own quadrant instead of needing the whole screen,
        // which is what actually lets multiple things stay visible together.
        const tooManyBars = Boolean(chart && chart.values.length > 6);
        const size = requestedSize === "quadrant" && tooManyBars ? "full" : requestedSize;

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

    this.registry.set("move_dashboard", {
      id: "move_dashboard",
      name: "Move Dashboard",
      description:
        "Moves or resizes something already on screen. Use this when something needs more room to show everything (make it full-size), or when asked to reposition something to a different corner. Reference it the same way as dismiss_dashboard - by its title or a close description of it.",
      version: "1.0.0",
      enabled: true,
      authorities: ["read"],
      parameters: {
        type: "object",
        properties: {
          reference: { type: "string", description: "What to move - matched against what's currently on screen" },
          size: {
            type: "string",
            enum: ["quadrant", "full"],
            description: "Optional new size. If omitted, toggles between full and quadrant as a sensible default.",
          },
          region: {
            type: "string",
            enum: ["topLeft", "topRight", "bottomLeft", "bottomRight"],
            description: "Optional new corner, only used when the result is a quadrant.",
          },
        },
        required: ["reference"],
      },
      handler: async function () {
        return "Moving things on screen should have been handled directly in the browser.";
      },
    });

    // Both handled entirely client-side - this is the only pair of tools
    // that actually change the live session's own instructions mid-call,
    // which only the browser holding that connection can do.
    this.registry.set("start_rehearsal", {
      id: "start_rehearsal",
      name: "Start Rehearsal",
      description:
        "Starts a rehearsal where Eden plays a character so the user can practice a real conversation before it happens - a negotiation, a difficult client, a tough interview, a hard conversation, anything at all. Use this whenever the user wants to practice or role-play a scenario. If it's not already clear, ask what they want to rehearse and who you should play before calling this. Once it starts, stay fully in character - a good rehearsal partner pushes back and raises real objections rather than being easy on them.",
      version: "1.0.0",
      enabled: true,
      authorities: ["read"],
      parameters: {
        type: "object",
        properties: {
          scenario: {
            type: "string",
            description:
              "What to rehearse and who to play - e.g. 'a buyer who thinks the price is 15% too high and wants a discount' or 'a hostile journalist asking hard questions about a business decision'.",
          },
        },
        required: ["scenario"],
      },
      handler: async function () {
        return "Rehearsal mode should have been handled directly in the browser.";
      },
    });

    this.registry.set("end_rehearsal", {
      id: "end_rehearsal",
      name: "End Rehearsal",
      description:
        "Ends the current rehearsal and returns to being Eden. Call this as soon as the user says something like 'end rehearsal', 'stop', or otherwise asks to stop practicing.",
      version: "1.0.0",
      enabled: true,
      authorities: ["read"],
      parameters: { type: "object", properties: {} },
      handler: async function () {
        return "Ending rehearsal should have been handled directly in the browser.";
      },
    });

    // Also client-side - engine status and the event log live in the
    // browser's own state (fed by polling /api/system/status and
    // /api/events), not anywhere the server can read on demand. Nothing
    // shows by default; these only appear when actually asked for.
    this.registry.set("show_system_status", {
      id: "show_system_status",
      name: "Show System Status",
      description:
        "Shows Eden's current engine status and context - presence, scene, active capabilities - as a dashboard. Use this when asked what's running, what engines are active, or how Eden is doing internally.",
      version: "1.0.0",
      enabled: true,
      authorities: ["read"],
      parameters: { type: "object", properties: {} },
      handler: async function () {
        return "System status should have been handled directly in the browser.";
      },
    });

    this.registry.set("show_event_log", {
      id: "show_event_log",
      name: "Show Event Log",
      description:
        "Shows Eden's recent internal event log as a dashboard - useful when asked what's been happening recently, or for debugging.",
      version: "1.0.0",
      enabled: true,
      authorities: ["read"],
      parameters: { type: "object", properties: {} },
      handler: async function () {
        return "Event log should have been handled directly in the browser.";
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

    // Mind-mapping - a living, branching structure that grows as the
    // conversation does. start/add/get/remove are pure state operations on
    // what's already on screen, so (like the dashboard-awareness tools)
    // they're answered entirely client-side. add_mindmap_research is the
    // one exception - it needs the search provider, so it runs server-side
    // and hands its result back for the client to attach as new nodes.
    this.registry.set("start_mindmap", {
      id: "start_mindmap",
      name: "Start Mind Map",
      description:
        "Starts a new live mind map for the given topic, shown full-screen since it needs room to grow. Use this when the user wants to think through, brainstorm, or map out an idea out loud. Replaces any existing map.",
      version: "1.0.0",
      enabled: true,
      authorities: ["read"],
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "The central topic or idea to put at the center of the map" },
        },
        required: ["topic"],
      },
      handler: async function () {
        return "Starting a mind map should have been handled directly in the browser.";
      },
    });

    this.registry.set("add_mindmap_idea", {
      id: "add_mindmap_idea",
      name: "Add Mind Map Idea",
      description:
        "Adds a new branch to the live mind map, attached under an existing point. Use this for every new concept as the conversation surfaces it, whether it came from the user or is a suggestion worth adding. Check get_mindmap_structure first if you're not sure what's already on the map.",
      version: "1.0.0",
      enabled: true,
      authorities: ["read"],
      parameters: {
        type: "object",
        properties: {
          parent: { type: "string", description: "Which existing point to attach this under - matched by its label" },
          label: { type: "string", description: "Short label for the new idea" },
          detail: { type: "string", description: "Optional one-line elaboration" },
        },
        required: ["parent", "label"],
      },
      handler: async function () {
        return "Adding to the mind map should have been handled directly in the browser.";
      },
    });

    this.registry.set("add_mindmap_research", {
      id: "add_mindmap_research",
      name: "Add Mind Map Research",
      description:
        "Searches the web and adds the real results as new branches under an existing point on the mind map. Use this when a branch would genuinely benefit from current information or real data, not for every branch.",
      version: "1.0.0",
      enabled: true,
      authorities: ["read"],
      parameters: {
        type: "object",
        properties: {
          parent: { type: "string", description: "Which existing point to attach the results under - matched by its label" },
          searchQuery: { type: "string", description: "What to search for" },
        },
        required: ["parent", "searchQuery"],
      },
      handler: async (args) => {
        const parsed = args as { parent?: string; searchQuery?: string };
        if (!parsed.parent || !parsed.searchQuery) {
          return "I need both which branch to attach to and something to search for.";
        }
        const search = ctx.providers.search;
        if (!search || !search.available()) {
          return "Search isn't connected, so I can't pull in real data for that branch.";
        }
        try {
          const hits = await search.search(parsed.searchQuery, 4, { topic: "general" });
          if (hits.length === 0) {
            return "That search didn't turn up anything to add.";
          }
          return JSON.stringify({
            mindmapResearch: {
              parent: parsed.parent,
              nodes: hits.map(function (h) {
                return { label: h.title, detail: h.snippet };
              }),
            },
          });
        } catch {
          return "That search failed, so nothing was added to the map.";
        }
      },
    });

    this.registry.set("get_mindmap_structure", {
      id: "get_mindmap_structure",
      name: "Get Mind Map Structure",
      description:
        "Returns the full current mind map - every point and how they connect - so you know exactly what's already there before adding to it or referencing a branch.",
      version: "1.0.0",
      enabled: true,
      authorities: ["read"],
      parameters: { type: "object", properties: {} },
      handler: async function () {
        return JSON.stringify({ nodes: [], note: "Mind map structure is tracked in the browser and should have been answered there directly." });
      },
    });

    this.registry.set("remove_mindmap_node", {
      id: "remove_mindmap_node",
      name: "Remove Mind Map Node",
      description:
        "Removes a branch from the mind map, along with anything under it. Use this when a point turns out to be a dead end or the user asks to drop it. Cannot remove the central topic - dismiss the whole map for that.",
      version: "1.0.0",
      enabled: true,
      authorities: ["read"],
      parameters: {
        type: "object",
        properties: {
          reference: { type: "string", description: "Which branch to remove - matched by its label" },
        },
        required: ["reference"],
      },
      handler: async function () {
        return "Removing from the mind map should have been handled directly in the browser.";
      },
    });

    // The AI generates SVG here, but this is NOT the safety boundary -
    // the raw text returned below is untrusted until the client runs it
    // through sanitizeSvg() before ever rendering it. This handler's job
    // is only generation; enforcement happens client-side, where the
    // actual DOM parser lives.
    this.registry.set("show_custom_graphic", {
      id: "show_custom_graphic",
      name: "Show Custom Graphic",
      description:
        "Generates and shows a custom diagram or simple animation to visually explain something - genuine custom artwork built for exactly what's being described, not a list or chart. Use this when a visual explanation would help more than words, especially to show how a process or mechanism works, with real motion if that helps make it clearer. Describe precisely what should be drawn and how anything should move.",
      version: "1.0.0",
      enabled: true,
      authorities: ["read"],
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short title for the graphic" },
          description: {
            type: "string",
            description: "Precise description of what to draw, including any motion or animation wanted",
          },
          size: {
            type: "string",
            enum: ["quadrant", "full"],
            description: "Defaults to full - custom illustrations usually need real room to be legible",
          },
        },
        required: ["title", "description"],
      },
      handler: async (args) => {
        const parsed = args as { title?: string; description?: string; size?: string };
        if (!parsed.title || !parsed.description) {
          return "I need both a title and a description of what to draw.";
        }

        try {
          const response = await ctx.providers.ai.chat({
            system: [
              "You are a precise SVG illustrator. Given a description, generate a single, complete, valid SVG diagram or simple animation that visually explains it clearly.",
              "Output ONLY the raw <svg>...</svg> markup - no markdown fences, no explanation, no other text whatsoever.",
              "Must be well-formed XML: every tag properly closed or self-closing, every attribute value quoted, special characters like & written as &amp;.",
              'Include a viewBox sized for the content, for example viewBox="0 0 300 200".',
              "Use only these elements: svg, g, rect, circle, ellipse, line, polyline, polygon, path, text, tspan, defs, linearGradient, radialGradient, stop, animate, animateTransform, animateMotion, marker, clipPath, title, desc, use.",
              'For any motion, use native SVG animation elements like <animate> and <animateTransform> with a sensible dur and repeatCount="indefinite" for anything that should loop.',
              "Never use script, foreignObject, iframe, object, or embed elements, any event handler attribute, inline style attributes, or any external reference - if you use href on a <use> element it must point only to a local #fragment defined in the same document.",
              "Use a palette fitting a dark interface - blues like #3B7BFF, purples like #8B6CFF, magenta like #E23FFF, light text like #E8E6F5 - and do not draw an opaque background rectangle.",
              "Keep it clean and legible, not overly busy.",
            ].join(" "),
            messages: [{ role: "user", content: parsed.description }],
            maxTokens: 2000,
            temperature: 0.4,
          });

          const svgText = response.text.trim();
          const size = parsed.size === "quadrant" ? "quadrant" : "full";

          return JSON.stringify({
            customGraphic: { title: parsed.title, svg: svgText, size: size },
          });
        } catch {
          return "I couldn't generate that graphic - try describing it a bit differently.";
        }
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
