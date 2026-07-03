import type { EventBus } from "./events/EventBus";
import type { ProviderRegistry } from "@/providers";
import type { Authority } from "@/types/domain";

/**
 * Every part of Eden is an Engine with exactly one responsibility.
 * Engines receive the Event Bus and the Provider Registry at start —
 * they never construct providers themselves and never import each other.
 */
export interface EngineContext {
  bus: EventBus;
  providers: ProviderRegistry;
  /**
   * Checks whether an action is allowed to proceed under Eden's authority
   * policy. Low-risk authorities resolve immediately; high-risk ones
   * create a pending approval and return allowed: false until a person
   * signs off. This is how an engine consults the Permissions Engine
   * without importing it — the kernel wires this to the real thing.
   */
  authorize(
    action: string,
    authority: Authority,
    payload?: Record<string, unknown>
  ): Promise<{ allowed: boolean; pendingApprovalId?: string }>;
  /**
   * Sends an email through the Communications Engine (still gated by
   * approval — this doesn't bypass anything, it's just how another
   * engine reaches Communications without importing it).
   */
  sendEmail(to: string, subject: string, body: string): Promise<string>;
}

export interface Engine {
  /** Stable machine id, e.g. "memory" */
  readonly id: string;
  /** Human name shown in the UI, e.g. "Memory Engine" */
  readonly name: string;
  start(ctx: EngineContext): Promise<void> | void;
  stop?(): Promise<void> | void;
}
