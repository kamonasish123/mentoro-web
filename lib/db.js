// lib/db.js
// Exports:
//  - `pool` (named) : a pg Pool instance for server-side queries (API routes)
//  - `supabase` (named & default) : the Supabase client adapter

import supabase from "@/lib/supabaseClient"; // uses your existing client
// Create a Postgres Pool for server-side API routes (only if DATABASE_URL available)
let pool = null;

if (typeof process !== "undefined" && process.env.DATABASE_URL) {
  // Use the 'pg' package. On Vercel this will work in serverless functions.
  // If your project uses `pg` >= 8 (ESM), importing like below handles both CJS/ESM.
  try {
    // dynamic require so client-side bundlers won't include pg
    // (this file should only be used in server-side contexts)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require("pg");
    const Pool = pkg.Pool || pkg.Pool; // defensive
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000,
    });
  } catch (err) {
    // If pg isn't installed or in environments where it's not supported, log and keep pool null.
    // This prevents hard crashes at import-time in non-server contexts.
    // In production (Vercel serverless) pg should be installed and DATABASE_URL set.
    // eslint-disable-next-line no-console
    console.warn("pg Pool not created (pg missing or not available):", err?.message || err);
    pool = null;
  }
}

export { pool, supabase };
export default supabase;
