/**
 * Eden domain types.
 * These are the nouns Eden thinks in. Everything else is plumbing.
 */

export type Role = "user" | "assistant" | "system" | "tool";

export interface Conversation {
  id: string;
  title: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: Role;
  content: string;
  provider?: string | null;
  model?: string | null;
  /** Present on assistant messages that called a tool. */
  tool_call?: { id: string; name: string; arguments: Record<string, unknown> } | null;
  /** Present on tool-result messages — which call this result answers. */
  tool_call_id?: string | null;
  created_at: string;
}

export type MemoryType =
  | "conversation"
  | "knowledge"
  | "long_term"
  | "semantic"
  | "preference"
  | "goal"
  | "project"
  | "relationship"
  | "business";

export interface Memory {
  id: string;
  type: MemoryType;
  content: string;
  importance: number; // 1 (trivial) → 5 (core identity)
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface EntityNode {
  id: string;
  kind: string; // person | business | project | goal | document | meeting | device | property | idea
  name: string;
  attributes: Record<string, unknown>;
  created_at: string;
}

export interface EntityRelationship {
  id: string;
  from_entity: string;
  to_entity: string;
  kind: string; // owns | works_on | knows | part_of | located_at | relates_to ...
  attributes: Record<string, unknown>;
  created_at: string;
}

export interface Goal {
  id: string;
  title: string;
  description: string | null;
  status: "active" | "paused" | "done" | "abandoned";
  created_at: string;
}

export interface Task {
  id: string;
  goal_id: string | null;
  title: string;
  status: "todo" | "in_progress" | "blocked" | "done";
  complexity: number; // 1–5
  depends_on: string[];
  created_at: string;
}

export interface EdenNotification {
  id: string;
  title: string;
  body: string | null;
  level: "info" | "warning" | "critical";
  read: boolean;
  created_at: string;
}

/** Authority levels every action in Eden is classified under. */
export type Authority =
  | "read"
  | "write"
  | "communicate"
  | "deploy"
  | "purchase"
  | "delete"
  | "unlock";

export interface Approval {
  id: string;
  action: string;
  authority: Authority;
  status: "pending" | "approved" | "denied";
  payload: Record<string, unknown>;
  created_at: string;
  resolved_at: string | null;
}

export type PresenceState =
  | "home"
  | "office"
  | "driving"
  | "working"
  | "sleeping"
  | "travelling"
  | "focus"
  | "meeting"
  | "unknown";

export type SceneName =
  | "working"
  | "deep_focus"
  | "presentation"
  | "relaxing"
  | "sleeping"
  | "ambient";

export interface CapabilityManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  authorities: Authority[];
  /** JSON Schema of arguments. Present + handler present = this manifest is a callable tool. */
  parameters?: Record<string, unknown>;
  /** What actually runs when this tool is called. Receives the pre-authorization bypass when resuming an approved call. */
  handler?: (
    args: Record<string, unknown>,
    opts?: { approvalId?: string }
  ) => Promise<string>;
}
