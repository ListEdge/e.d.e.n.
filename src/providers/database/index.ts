import { config } from "@/lib/config";
import { InMemoryDatabaseProvider } from "./memory";
import { SupabaseDatabaseProvider } from "./supabase";
import type { DatabaseProvider } from "./types";

export type { DatabaseProvider } from "./types";

/**
 * Chooses the database provider.
 * Supabase when configured; in-memory otherwise so Eden always boots.
 * Replacing Supabase with another PostgreSQL host means writing one new
 * class against the DatabaseProvider contract and changing this function.
 */
export function createDatabaseProvider(): DatabaseProvider {
  if (config.database.supabaseUrl && config.database.supabaseServiceKey) {
    return new SupabaseDatabaseProvider();
  }
  return new InMemoryDatabaseProvider();
}
