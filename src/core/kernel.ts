import { EventBus } from "./events/EventBus";
import { createProviders, type ProviderRegistry } from "@/providers";
import type { Engine, EngineContext } from "./engine";
import { ConversationEngine } from "./engines/ConversationEngine";
import { MemoryEngine } from "./engines/MemoryEngine";
import { KnowledgeEngine } from "./engines/KnowledgeEngine";
import { PlannerEngine } from "./engines/PlannerEngine";
import { DeveloperEngine } from "./engines/DeveloperEngine";
import { PresenceEngine } from "./engines/PresenceEngine";
import { ContextEngine } from "./engines/ContextEngine";
import { SceneManager } from "./engines/SceneManager";
import { PermissionsEngine } from "./engines/PermissionsEngine";
import { NotificationEngine } from "./engines/NotificationEngine";
import { CapabilityManager } from "./engines/CapabilityManager";
import { AnalyticsEngine } from "./engines/AnalyticsEngine";
import { VoiceEngine } from "./engines/VoiceEngine";
import { CommunicationsEngine } from "./engines/CommunicationsEngine";

/**
 * The Kernel boots Eden: builds the Event Bus, resolves providers,
 * starts every engine, and hands out typed references.
 *
 * On serverless (Vercel), the kernel is cached on globalThis so warm
 * invocations reuse the running system instead of rebooting it.
 */
export interface Kernel {
  bus: EventBus;
  providers: ProviderRegistry;
  engines: Engine[];
  conversation: ConversationEngine;
  memory: MemoryEngine;
  knowledge: KnowledgeEngine;
  planner: PlannerEngine;
  developer: DeveloperEngine;
  presence: PresenceEngine;
  context: ContextEngine;
  scenes: SceneManager;
  permissions: PermissionsEngine;
  notifications: NotificationEngine;
  capabilities: CapabilityManager;
  analytics: AnalyticsEngine;
  voice: VoiceEngine;
  communications: CommunicationsEngine;
  bootedAt: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __edenKernel: Kernel | undefined;
}

async function boot(): Promise<Kernel> {
  const bus = new EventBus();
  const providers = createProviders();

  const conversation = new ConversationEngine();
  const memory = new MemoryEngine();
  const knowledge = new KnowledgeEngine();
  const planner = new PlannerEngine();
  const developer = new DeveloperEngine();
  const presence = new PresenceEngine();
  const context = new ContextEngine();
  const scenes = new SceneManager();
  const permissions = new PermissionsEngine();
  const notifications = new NotificationEngine();
  const capabilities = new CapabilityManager();
  const analytics = new AnalyticsEngine();
  const voice = new VoiceEngine();
  const communications = new CommunicationsEngine();

  const engines: Engine[] = [
    analytics, // first, so it sees every event including EngineStarted
    conversation,
    memory,
    knowledge,
    planner,
    developer,
    presence,
    context,
    scenes,
    permissions,
    notifications,
    capabilities,
    voice,
    communications,
  ];

  const ctx: EngineContext = {
    bus,
    providers,
    authorize: (action, authority, payload) => permissions.authorize(action, authority, payload),
  };
  for (const engine of engines) {
    await engine.start(ctx);
    await bus.publish("EngineStarted", "kernel", { engine: engine.id });
  }

  await bus.publish("SystemBooted", "kernel", {
    ai: providers.ai.id,
    database: providers.database.id,
    engines: engines.length,
  });

  return {
    bus,
    providers,
    engines,
    conversation,
    memory,
    knowledge,
    planner,
    developer,
    presence,
    context,
    scenes,
    permissions,
    notifications,
    capabilities,
    analytics,
    voice,
    communications,
    bootedAt: new Date().toISOString(),
  };
}

export async function getKernel(): Promise<Kernel> {
  if (!globalThis.__edenKernel) {
    globalThis.__edenKernel = await boot();
  }
  return globalThis.__edenKernel;
}
