import { createAIProvider, type AIProvider } from "./ai";
import { createDatabaseProvider, type DatabaseProvider } from "./database";
import { createVoiceProvider, type VoiceProvider } from "./voice";
import type { MapsProvider } from "./maps/types";
import { createEmailProvider, type EmailProvider } from "./email";
import type { CalendarProvider } from "./calendar/types";
import type { StorageProvider } from "./storage/types";
import type { DeploymentProvider } from "./deployment/types";
import { createGitHubProvider, type GitHubProvider } from "./github";
import type { PhoneProvider } from "./phone/types";
import type { PaymentsProvider } from "./payments/types";
import type { HomeProvider } from "./home/types";
import { createSearchProvider, type SearchProvider } from "./search";
import { createRealtimeProvider, type RealtimeProvider } from "./realtime";

/**
 * Everything external to Eden lives behind this registry.
 * Engines receive it at start and never construct providers themselves.
 * Optional providers are null until an implementation is configured —
 * the contracts are already defined so implementations drop straight in.
 */
export interface ProviderRegistry {
  ai: AIProvider;
  database: DatabaseProvider;
  voice: VoiceProvider | null;
  maps: MapsProvider | null;
  email: EmailProvider | null;
  calendar: CalendarProvider | null;
  storage: StorageProvider | null;
  deployment: DeploymentProvider | null;
  github: GitHubProvider | null;
  phone: PhoneProvider | null;
  payments: PaymentsProvider | null;
  home: HomeProvider | null;
  search: SearchProvider | null;
  realtime: RealtimeProvider | null;
}

export function createProviders(): ProviderRegistry {
  return {
    ai: createAIProvider(),
    database: createDatabaseProvider(),
    voice: createVoiceProvider(),
    maps: null,
    email: createEmailProvider(),
    calendar: null,
    storage: null,
    deployment: null,
    github: null,
    phone: null,
    payments: null,
    home: null,
    search: createSearchProvider(),
    realtime: createRealtimeProvider(),
  };
}
