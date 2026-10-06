import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabaseServiceRoleKey, supabaseUrl } from "./env";

export type AdminClient = SupabaseClient<Database>;

/**
 * Service-role client. Bypasses RLS. Only for the engine's jobs, imports and the seed,
 * always on the server, never with a user's request data mixed in.
 */
export function createAdminClient(): AdminClient {
  return createSupabaseClient<Database>(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
