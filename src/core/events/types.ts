/**
 * The Eden event vocabulary.
 * Every engine speaks by publishing these. No engine calls another directly
 * for anything that other parts of the system might care about.
 */

export type EdenEventType =
  | "SystemBooted"
  | "ConversationStarted"
  | "ConversationEnded"
  | "MessageReceived"
  | "MessageSent"
  | "MemoryCreated"
  | "MemoryUpdated"
  | "MemoryRecalled"
  | "KnowledgeLinked"
  | "PlanCreated"
  | "TaskCreated"
  | "TaskCompleted"
  | "DeploymentStarted"
  | "DeploymentSucceeded"
  | "DeploymentFailed"
  | "EmailReceived"
  | "CallStarted"
  | "CallFinished"
  | "LocationChanged"
  | "ContextChanged"
  | "SceneActivated"
  | "DeviceConnected"
  | "MeetingStarted"
  | "BuildFinished"
  | "HomeArrived"
  | "NotificationCreated"
  | "ApprovalRequested"
  | "ApprovalResolved"
  | "CapabilityRegistered"
  | "EngineStarted"
  | "EngineStopped"
  | "ProviderError";

export interface EdenEvent<T = Record<string, unknown>> {
  id: string;
  type: EdenEventType;
  source: string; // engine or provider id that produced it
  payload: T;
  at: string; // ISO timestamp
}

export type EventHandler = (event: EdenEvent) => void | Promise<void>;
