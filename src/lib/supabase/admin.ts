import "server-only";
import { createClient } from "@supabase/supabase-js";

// Privileged client for background jobs only (NASA sync). It bypasses Row Level Security,
// so it must never be imported from client components or used to answer a user's own query.
export const hasServiceRole = () => !!process.env.SUPABASE_SERVICE_ROLE_KEY;

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
