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
