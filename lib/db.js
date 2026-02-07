// lib/db.js
// Exports:
//  - `pool` (named) : a pg Pool instance for server-side queries (API routes) or null
//  - `supabase` (named) : the Supabase client adapter (no default export here)

import { supabase } from "@/lib/supabaseClient";

let pool = null;

if (typeof process !== "undefined" && process.env.DATABASE_URL) {
  try {
    // Use a runtime require so bundlers don't try to resolve 'pg' during build.
    // This ensures Vercel builds don't fail if 'pg' isn't present or DATABASE_URL is not set.
    const requireFunc =
      typeof __non_webpack_require__ === "function"
        ? __non_webpack_require__
        : eval("require");

    const pkg = requireFunc("pg");
    const Pool = pkg.Pool || pkg.default?.Pool || pkg;
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000,
    });
  } catch (err) {
    // If pg isn't installed or not available, keep pool null and warn.
    // This avoids crashing imports in environments that don't have pg.
    // eslint-disable-next-line no-console
    console.warn("pg Pool not created (pg missing or not available):", err?.message || err);
    pool = null;
  }
} else {
  // If no DATABASE_URL set, we simply leave pool as null.
  // This is fine if you rely exclusively on Supabase client for DB access.
  pool = null;
}

export { pool, supabase };
