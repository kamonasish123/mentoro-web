// /lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (process.env.NODE_ENV === "development") {
  // Helpful dev-time logging (safe; keys not printed)
  console.debug("CHECK-CLIENT: NEXT_PUBLIC_SUPABASE_URL =", supabaseUrl ? "(present)" : "(missing)");
  console.debug("CHECK-CLIENT: NEXT_PUBLIC_SUPABASE_ANON_KEY present? =", !!supabaseAnonKey);
}

// In development we want to fail fast if envs are missing so you notice.
// In production we don't throw to avoid hard build failures — instead we warn and allow
// the deployment to proceed (you should still set env vars in Vercel).
if (process.env.NODE_ENV === "development") {
  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL in environment (add to .env.local).");
  }
  if (!supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY in environment. Restart dev server after adding it.");
  }
} else {
  if (!supabaseUrl) {
    // don't throw in prod build — warn so you can add the env var in Vercel
    // but also help debugging if something calls supabase unexpectedly during build.
    // eslint-disable-next-line no-console
    console.warn("NEXT_PUBLIC_SUPABASE_URL is missing in the environment. Add it in Vercel env variables.");
  }
  if (!supabaseAnonKey) {
    // eslint-disable-next-line no-console
    console.warn("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing in the environment. Add it in Vercel env variables.");
  }
}

// Create the client (will use whatever values are present).
// If envs are missing, this client will exist but requests will fail — that's expected
// until you set correct env vars in your production environment.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server helper (do NOT use in browser)
export function createServerSupabase() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase service role key in server environment (SUPABASE_SERVICE_ROLE_KEY).");
  }
  // Return a server-side client that uses the service role key.
  return createClient(supabaseUrl, serviceRoleKey);
}

// Provide a default export for backward compatibility with older imports
export default supabase;
