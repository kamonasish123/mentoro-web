// pages/api/check-email.js
import { createServerSupabase } from "@/lib/supabaseClient";


export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email } = req.body || {};
  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Email is required" });
  }

  // Debug: non-secret env visibility (helps diagnose missing envs)
  try {
    console.log("CHECK-EMAIL DEBUG: NEXT_PUBLIC_SUPABASE_URL =", (process.env.NEXT_PUBLIC_SUPABASE_URL || "").slice(0, 120));
    console.log("CHECK-EMAIL DEBUG: SUPABASE_SERVICE_ROLE_KEY present? =", !!process.env.SUPABASE_SERVICE_ROLE_KEY);
  } catch (e) {
    console.warn("DEBUG log failed", e?.message || e);
  }

  let supabaseAdmin;
  try {
    supabaseAdmin = createServerSupabase();
  } catch (err) {
    console.error("createServerSupabase error:", err?.message || err);
    return res.status(500).json({ error: "Server configuration error (missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL)." });
  }

  const trimmed = String(email).trim().toLowerCase();

  try {
    // 1) Try direct auth.users lookup (service role required). If successful, return exists + confirmed.
    try {
      const { data: authRows, error: authErr } = await supabaseAdmin
        .from("auth.users")
        .select("id, email, email_confirmed_at")
        .ilike("email", trimmed)
        .limit(1);

      if (!authErr && Array.isArray(authRows) && authRows.length > 0) {
        const row = authRows[0];
        const confirmed = !!row.email_confirmed_at;
        return res.status(200).json({ exists: true, confirmed });
      }
    } catch (authLookupErr) {
      // Not fatal — some projects do not expose auth.users via PostgREST. Continue to RPC/fallbacks.
      console.warn("auth.users lookup failed (may be expected):", authLookupErr?.message || authLookupErr);
    }

    // 2) Try RPC if present (user_exists_by_email or user_exists_with_confirmed etc)
    try {
      const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc("user_exists_by_email", { e: trimmed });
      if (!rpcErr && rpcData != null) {
        // rpcData can be boolean, array, object; be defensive.
        if (typeof rpcData === "boolean") {
          return res.status(200).json({ exists: rpcData, confirmed: false });
        }
        if (Array.isArray(rpcData) && rpcData.length > 0) {
          const first = rpcData[0];
          if (typeof first === "boolean") return res.status(200).json({ exists: first, confirmed: false });
          if (first && typeof first.exists === "boolean") {
            return res.status(200).json({ exists: first.exists, confirmed: !!first.confirmed });
          }
          // if RPC returned rows, assume exists
          return res.status(200).json({ exists: true, confirmed: !!(first && first.confirmed) });
        }
        if (typeof rpcData === "object") {
          if (typeof rpcData.exists === "boolean") return res.status(200).json({ exists: rpcData.exists, confirmed: !!rpcData.confirmed });
          // otherwise treat object as "exists"
          return res.status(200).json({ exists: true, confirmed: !!rpcData.confirmed });
        }
      }
    } catch (rpcCallErr) {
      console.warn("rpc user_exists_by_email call failed (continuing to profiles):", rpcCallErr?.message || rpcCallErr);
    }

    // 3) Fallback: check public.profiles (service role client used)
    try {
      const { data: profRows, error: profErr } = await supabaseAdmin
        .from("profiles")
        .select("id, email")
        .ilike("email", trimmed)
        .limit(1);

      if (profErr) {
        console.warn("profiles fallback error:", profErr);
        return res.status(502).json({ error: "Database lookup failed (profiles).", details: profErr.message || profErr });
      }

      if (Array.isArray(profRows) && profRows.length > 0) {
        // profile row exists -> treat as confirmed account (profiles are created only after confirmation in your setup)
        return res.status(200).json({ exists: true, confirmed: true });
      }

      // not found
      return res.status(200).json({ exists: false, confirmed: false });
    } catch (profInnerErr) {
      console.error("profiles fallback threw:", profInnerErr?.message || profInnerErr);
      return res.status(502).json({ error: "Database lookup failed (profiles)", details: profInnerErr?.message || String(profInnerErr) });
    }
  } catch (err) {
    console.error("check-email unexpected error:", err?.message || err);
    return res.status(500).json({ error: "Internal error", details: err?.message || String(err) });
  }
}
