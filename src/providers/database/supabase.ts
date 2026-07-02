import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "@/lib/config";
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
 * Supabase implementation of the database contract.
 * Uses the service-role key on the server only. Nothing outside this file
 * knows Supabase exists.
 */
export class SupabaseDatabaseProvider implements DatabaseProvider {
  readonly id = "supabase";
  readonly persistent = true;
  private client: SupabaseClient;

  constructor() {
    this.client = createClient(
      config.database.supabaseUrl,
      config.database.supabaseServiceKey,
      { auth: { persistSession: false } }
    );
  }

  async health(): Promise<boolean> {
    const { error } = await this.client.from("memories").select("id").limit(1);
    return !error;
  }

  conversations = {
    create: async (title: string | null = null): Promise<Conversation> => {
      const { data, error } = await this.client
        .from("conversations")
        .insert({ title })
        .select()
        .single();
      if (error) throw error;
      return data as Conversation;
    },
    get: async (id: string): Promise<Conversation | null> => {
      const { data } = await this.client
        .from("conversations")
        .select()
        .eq("id", id)
        .maybeSingle();
      return (data as Conversation) ?? null;
    },
  };

  messages = {
    add: async (message: Omit<Message, "id" | "created_at">): Promise<Message> => {
      const { data, error } = await this.client
        .from("messages")
        .insert(message)
        .select()
        .single();
      if (error) throw error;
      return data as Message;
    },
    listByConversation: async (conversationId: string, limit = 30): Promise<Message[]> => {
      const { data, error } = await this.client
        .from("messages")
        .select()
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as Message[];
    },
  };

  memories = {
    add: async (memory: Omit<Memory, "id" | "created_at">): Promise<Memory> => {
      const { data, error } = await this.client
        .from("memories")
        .insert(memory)
        .select()
        .single();
      if (error) throw error;
      return data as Memory;
    },
    search: async (query: string, limit = 5): Promise<Memory[]> => {
      const terms = query
        .split(/\s+/)
        .filter((t) => t.length > 3)
        .slice(0, 6);
      if (terms.length === 0) return [];
      const ors = terms.map((t) => `content.ilike.%${t.replace(/[%,()]/g, "")}%`).join(",");
      const { data } = await this.client
        .from("memories")
        .select()
        .or(ors)
        .order("importance", { ascending: false })
        .limit(limit);
      return (data ?? []) as Memory[];
    },
    recent: async (limit = 10): Promise<Memory[]> => {
      const { data } = await this.client
        .from("memories")
        .select()
        .order("created_at", { ascending: false })
        .limit(limit);
      return (data ?? []) as Memory[];
    },
  };

  events = {
    log: async (event: EdenEvent): Promise<void> => {
      await this.client.from("events").insert({
        id: event.id,
        type: event.type,
        source: event.source,
        payload: event.payload,
        created_at: event.at,
      });
    },
    recent: async (limit = 50): Promise<EdenEvent[]> => {
      const { data } = await this.client
        .from("events")
        .select()
        .order("created_at", { ascending: false })
        .limit(limit);
      return ((data ?? []) as Array<{ id: string; type: string; source: string; payload: Record<string, unknown>; created_at: string }>).map(
        (row) => ({
          id: row.id,
          type: row.type as EdenEvent["type"],
          source: row.source,
          payload: row.payload,
          at: row.created_at,
        })
      );
    },
  };

  goals = {
    add: async (goal: Omit<Goal, "id" | "created_at">): Promise<Goal> => {
      const { data, error } = await this.client.from("goals").insert(goal).select().single();
      if (error) throw error;
      return data as Goal;
    },
    list: async (): Promise<Goal[]> => {
      const { data } = await this.client
        .from("goals")
        .select()
        .order("created_at", { ascending: false });
      return (data ?? []) as Goal[];
    },
  };

  tasks = {
    add: async (task: Omit<Task, "id" | "created_at">): Promise<Task> => {
      const { data, error } = await this.client.from("tasks").insert(task).select().single();
      if (error) throw error;
      return data as Task;
    },
    listByGoal: async (goalId: string): Promise<Task[]> => {
      const { data } = await this.client
        .from("tasks")
        .select()
        .eq("goal_id", goalId)
        .order("created_at", { ascending: true });
      return (data ?? []) as Task[];
    },
  };

  entities = {
    upsert: async (entity: Omit<EntityNode, "id" | "created_at">): Promise<EntityNode> => {
      const existing = await this.entities.findByName(entity.name);
      if (existing) return existing;
      const { data, error } = await this.client
        .from("entities")
        .insert(entity)
        .select()
        .single();
      if (error) throw error;
      return data as EntityNode;
    },
    findByName: async (name: string): Promise<EntityNode | null> => {
      const { data } = await this.client
        .from("entities")
        .select()
        .ilike("name", name)
        .maybeSingle();
      return (data as EntityNode) ?? null;
    },
  };

  relationships = {
    link: async (
      rel: Omit<EntityRelationship, "id" | "created_at">
    ): Promise<EntityRelationship> => {
      const { data, error } = await this.client
        .from("relationships")
        .insert(rel)
        .select()
        .single();
      if (error) throw error;
      return data as EntityRelationship;
    },
  };

  notifications = {
    add: async (
      n: Omit<EdenNotification, "id" | "created_at" | "read">
    ): Promise<EdenNotification> => {
      const { data, error } = await this.client
        .from("notifications")
        .insert({ ...n, read: false })
        .select()
        .single();
      if (error) throw error;
      return data as EdenNotification;
    },
    unread: async (limit = 20): Promise<EdenNotification[]> => {
      const { data } = await this.client
        .from("notifications")
        .select()
        .eq("read", false)
        .order("created_at", { ascending: false })
        .limit(limit);
      return (data ?? []) as EdenNotification[];
    },
  };

  approvals = {
    request: async (
      a: Omit<Approval, "id" | "created_at" | "resolved_at" | "status">
    ): Promise<Approval> => {
      const { data, error } = await this.client
        .from("approvals")
        .insert({ ...a, status: "pending" })
        .select()
        .single();
      if (error) throw error;
      return data as Approval;
    },
    pending: async (): Promise<Approval[]> => {
      const { data } = await this.client
        .from("approvals")
        .select()
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      return (data ?? []) as Approval[];
    },
  };
}
