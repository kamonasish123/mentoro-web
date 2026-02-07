// /lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

if (process.env.NODE_ENV === "development") {
  // DO NOT log actual keys to console in production.
  console.debug("CHECK-CLIENT: NEXT_PUBLIC_SUPABASE_URL =", supabaseUrl);
  console.debug("CHECK-CLIENT: NEXT_PUBLIC_SUPABASE_ANON_KEY present? =", !!supabaseAnonKey);
}

// In development, throw early so you notice misconfiguration immediately.
if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL in environment");
}
if (!supabaseAnonKey) {
  // helpful error instead of silently making requests without apikey
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY in environment. Restart dev server after adding it.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server helper (do NOT use in browser)
export function createServerSupabase() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase service role key in server environment");
  }
  // Important: server/client separate; this function is intended for server API routes only.
  return createClient(supabaseUrl, serviceRoleKey);
}
