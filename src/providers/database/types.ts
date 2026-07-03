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
import type { EdenEvent } from "@/core/events/types";

/**
 * The database contract.
 * Eden's engines talk to these repositories — never to Supabase directly.
 * To move off Supabase, implement this interface against any PostgreSQL
 * host and change one line in providers/database/index.ts.
 */

export interface ConversationRepo {
  create(title?: string | null): Promise<Conversation>;
  get(id: string): Promise<Conversation | null>;
}

export interface MessageRepo {
  add(message: Omit<Message, "id" | "created_at">): Promise<Message>;
  listByConversation(conversationId: string, limit?: number): Promise<Message[]>;
}

export interface MemoryRepo {
  add(memory: Omit<Memory, "id" | "created_at">): Promise<Memory>;
  search(query: string, limit?: number): Promise<Memory[]>;
  recent(limit?: number): Promise<Memory[]>;
}

export interface EventRepo {
  log(event: EdenEvent): Promise<void>;
  recent(limit?: number): Promise<EdenEvent[]>;
}

export interface GoalRepo {
  add(goal: Omit<Goal, "id" | "created_at">): Promise<Goal>;
  list(): Promise<Goal[]>;
}

export interface TaskRepo {
  add(task: Omit<Task, "id" | "created_at">): Promise<Task>;
  listByGoal(goalId: string): Promise<Task[]>;
}

export interface EntityRepo {
  upsert(entity: Omit<EntityNode, "id" | "created_at">): Promise<EntityNode>;
  findByName(name: string): Promise<EntityNode | null>;
}

export interface RelationshipRepo {
  link(rel: Omit<EntityRelationship, "id" | "created_at">): Promise<EntityRelationship>;
}

export interface NotificationRepo {
  add(n: Omit<EdenNotification, "id" | "created_at" | "read">): Promise<EdenNotification>;
  unread(limit?: number): Promise<EdenNotification[]>;
}

export interface ApprovalRepo {
  request(a: Omit<Approval, "id" | "created_at" | "resolved_at" | "status">): Promise<Approval>;
  pending(): Promise<Approval[]>;
  resolve(id: string, status: "approved" | "denied"): Promise<Approval>;
}

export interface DatabaseProvider {
  readonly id: string;
  readonly persistent: boolean;
  conversations: ConversationRepo;
  messages: MessageRepo;
  memories: MemoryRepo;
  events: EventRepo;
  goals: GoalRepo;
  tasks: TaskRepo;
  entities: EntityRepo;
  relationships: RelationshipRepo;
  notifications: NotificationRepo;
  approvals: ApprovalRepo;
  health(): Promise<boolean>;
}
