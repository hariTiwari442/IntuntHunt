import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

// Public client — used for operations that run as the authenticated user
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

// Admin client — bypasses RLS, used for server-side operations (profile creation, etc.)
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
