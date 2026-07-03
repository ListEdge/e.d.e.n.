import { newId } from "@/lib/id";
import type { EdenEvent } from "@/core/events/types";
import type {
  Approval,
  Conversation,
  EdenNotification,
  EntityNode,
  EntityRelationship,
  Goal,
  Memory,
  Message,
  Task,
} from "@/types/domain";
import type { DatabaseProvider } from "./types";

/**
 * In-memory implementation of the database contract.
 * Used automatically when Supabase keys are absent, so Eden always runs.
 * Nothing survives a restart — the UI makes this clearly visible.
 */
export class InMemoryDatabaseProvider implements DatabaseProvider {
  readonly id = "in-memory";
  readonly persistent = false;

  private store = {
    conversations: [] as Conversation[],
    messages: [] as Message[],
    memories: [] as Memory[],
    events: [] as EdenEvent[],
    goals: [] as Goal[],
    tasks: [] as Task[],
    entities: [] as EntityNode[],
    relationships: [] as EntityRelationship[],
    notifications: [] as EdenNotification[],
    approvals: [] as Approval[],
  };

  async health(): Promise<boolean> {
    return true;
  }

  conversations = {
    create: async (title: string | null = null): Promise<Conversation> => {
      const c: Conversation = { id: newId(), title, created_at: new Date().toISOString() };
      this.store.conversations.push(c);
      return c;
    },
    get: async (id: string): Promise<Conversation | null> =>
      this.store.conversations.find((c) => c.id === id) ?? null,
  };

  messages = {
    add: async (message: Omit<Message, "id" | "created_at">): Promise<Message> => {
      const m: Message = { ...message, id: newId(), created_at: new Date().toISOString() };
      this.store.messages.push(m);
      return m;
    },
    listByConversation: async (conversationId: string, limit = 30): Promise<Message[]> =>
      this.store.messages.filter((m) => m.conversation_id === conversationId).slice(-limit),
  };

  memories = {
    add: async (memory: Omit<Memory, "id" | "created_at">): Promise<Memory> => {
      const m: Memory = { ...memory, id: newId(), created_at: new Date().toISOString() };
      this.store.memories.push(m);
      return m;
    },
    search: async (query: string, limit = 5): Promise<Memory[]> => {
      const terms = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 3);
      if (terms.length === 0) return [];
      return this.store.memories
        .filter((m) => terms.some((t) => m.content.toLowerCase().includes(t)))
        .sort((a, b) => b.importance - a.importance)
        .slice(0, limit);
    },
    recent: async (limit = 10): Promise<Memory[]> =>
      [...this.store.memories].reverse().slice(0, limit),
  };

  events = {
    log: async (event: EdenEvent): Promise<void> => {
      this.store.events.push(event);
      if (this.store.events.length > 500) this.store.events.shift();
    },
    recent: async (limit = 50): Promise<EdenEvent[]> =>
      [...this.store.events].reverse().slice(0, limit),
  };

  goals = {
    add: async (goal: Omit<Goal, "id" | "created_at">): Promise<Goal> => {
      const g: Goal = { ...goal, id: newId(), created_at: new Date().toISOString() };
      this.store.goals.push(g);
      return g;
    },
    list: async (): Promise<Goal[]> => [...this.store.goals].reverse(),
  };

  tasks = {
    add: async (task: Omit<Task, "id" | "created_at">): Promise<Task> => {
      const t: Task = { ...task, id: newId(), created_at: new Date().toISOString() };
      this.store.tasks.push(t);
      return t;
    },
    listByGoal: async (goalId: string): Promise<Task[]> =>
      this.store.tasks.filter((t) => t.goal_id === goalId),
  };

  entities = {
    upsert: async (entity: Omit<EntityNode, "id" | "created_at">): Promise<EntityNode> => {
      const existing = this.store.entities.find(
        (e) => e.name.toLowerCase() === entity.name.toLowerCase()
      );
      if (existing) return existing;
      const e: EntityNode = { ...entity, id: newId(), created_at: new Date().toISOString() };
      this.store.entities.push(e);
      return e;
    },
    findByName: async (name: string): Promise<EntityNode | null> =>
      this.store.entities.find((e) => e.name.toLowerCase() === name.toLowerCase()) ?? null,
  };

  relationships = {
    link: async (
      rel: Omit<EntityRelationship, "id" | "created_at">
    ): Promise<EntityRelationship> => {
      const r: EntityRelationship = {
        ...rel,
        id: newId(),
        created_at: new Date().toISOString(),
      };
      this.store.relationships.push(r);
      return r;
    },
  };

  notifications = {
    add: async (
      n: Omit<EdenNotification, "id" | "created_at" | "read">
    ): Promise<EdenNotification> => {
      const item: EdenNotification = {
        ...n,
        read: false,
        id: newId(),
        created_at: new Date().toISOString(),
      };
      this.store.notifications.push(item);
      return item;
    },
    unread: async (limit = 20): Promise<EdenNotification[]> =>
      this.store.notifications.filter((n) => !n.read).slice(-limit),
  };

  approvals = {
    request: async (
      a: Omit<Approval, "id" | "created_at" | "resolved_at" | "status">
    ): Promise<Approval> => {
      const approval: Approval = {
        ...a,
        status: "pending",
        id: newId(),
        created_at: new Date().toISOString(),
        resolved_at: null,
      };
      this.store.approvals.push(approval);
      return approval;
    },
    pending: async (): Promise<Approval[]> =>
      this.store.approvals.filter((a) => a.status === "pending"),
    resolve: async (id: string, status: "approved" | "denied"): Promise<Approval> => {
      const approval = this.store.approvals.find((a) => a.id === id);
      if (!approval) throw new Error(`Approval ${id} not found`);
      approval.status = status;
      approval.resolved_at = new Date().toISOString();
      return approval;
    },
  };
}
