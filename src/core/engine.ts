import type { EventBus } from "./events/EventBus";
import type { ProviderRegistry } from "@/providers";

/**
 * Every part of Eden is an Engine with exactly one responsibility.
 * Engines receive the Event Bus and the Provider Registry at start —
 * they never construct providers themselves and never import each other.
 */
export interface EngineContext {
  bus: EventBus;
  providers: ProviderRegistry;
}

export interface Engine {
  /** Stable machine id, e.g. "memory" */
  readonly id: string;
  /** Human name shown in the UI, e.g. "Memory Engine" */
  readonly name: string;
  start(ctx: EngineContext): Promise<void> | void;
  stop?(): Promise<void> | void;
}
