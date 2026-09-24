"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client, used for Realtime lead updates only. Auth goes through our
 * own backend, not this client.
 *
 * Both values are optional on purpose. `createClient` THROWS on an empty URL,
 * and this module is evaluated at import time — so on an environment missing
 * these vars it took down every route that transitively imports it during SSR
 * with a 500, not just Realtime. That is exactly what happened on the test
 * site, where the product page 500'd for every product id while the same code
 * was fine in production.
 *
 * A missing key should cost you live updates, nothing more. So when the config
 * is absent we export a stub covering the surface we actually use — the list
 * still renders and still refetches, it just doesn't stream.
 */

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isRealtimeConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON);

if (!isRealtimeConfigured && typeof window !== "undefined") {
  // eslint-disable-next-line no-console
  console.warn(
    "[supabase] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is " +
      "missing. Leads will still load, but they won't stream in live.",
  );
}

/**
 * Only the three members useLeadsRealtime touches. Typed as the real client so
 * callers need no branching; `channel()` hands back an object whose chained
 * calls are all no-ops, matching how the real one is used.
 */
function makeStub(): SupabaseClient {
  const channel = {
    on:          () => channel,
    subscribe:   () => channel,
    unsubscribe: async () => "ok" as const,
  };
  return {
    channel:       () => channel,
    removeChannel: async () => "ok" as const,
    realtime:      { setAuth: () => {} },
  } as unknown as SupabaseClient;
}

export const supabase: SupabaseClient = isRealtimeConfigured
  ? createClient(SUPABASE_URL!, SUPABASE_ANON!, {
      auth:     { persistSession: false },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : makeStub();
