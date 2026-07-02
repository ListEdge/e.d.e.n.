import type { Engine, EngineContext } from "../engine";
import type { CapabilityManifest } from "@/types/domain";

/**
 * Capability Manager — Eden's app store, internally.
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
}
