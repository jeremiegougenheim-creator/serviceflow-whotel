"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { supabasePublishableKey, supabaseUrl } from "./env";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

/** Browser client (one per tab). Sessions live in cookies so server components see the same user. */
export function createClient() {
  if (!browserClient) {
    browserClient = createBrowserClient<Database>(supabaseUrl(), supabasePublishableKey());
  }
  return browserClient;
}
