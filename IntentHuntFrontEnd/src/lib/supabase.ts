"use client";

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SUPABASE_ANON) {
  // eslint-disable-next-line no-console
  console.warn(
    "[supabase] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing. Realtime will not work.",
  );
}

export const supabase = createClient(SUPABASE_URL ?? "", SUPABASE_ANON ?? "", {
  auth:   { persistSession: false },
  realtime: { params: { eventsPerSecond: 10 } },
});
