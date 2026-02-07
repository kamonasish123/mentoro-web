// pages/api/resend-confirmation.js
import { createServerSupabase } from "../../lib/supabaseClient";

/*
  POST /api/resend-confirmation
  Body: { email: "user@example.com" }

  Notes:
  - Uses the SUPABASE_SERVICE_ROLE_KEY via createServerSupabase().
  - Tries admin.generateLink(...) if available (supabase-js v2 admin helper).
  - Falls back to calling the GoTrue admin REST endpoint (/auth/v1/admin/generate_link).
  - Returns 200 JSON on success: { ok: true, info: "...", action_link?: string }
*/

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email } = req.body || {};
  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Email is required" });
  }

  // create admin client (uses SUPABASE_SERVICE_ROLE_KEY)
  let supabaseAdmin;
  try {
    supabaseAdmin = createServerSupabase();
  } catch (err) {
    console.error("createServerSupabase error:", err);
    return res.status(500).json({ error: "Server configuration error" });
  }

  const trimmed = String(email).trim().toLowerCase();

  try {
    // First attempt: use supabase-js admin helper if available
    if (
      supabaseAdmin &&
      supabaseAdmin.auth &&
      supabaseAdmin.auth.admin &&
      typeof supabaseAdmin.auth.admin.generateLink === "function"
    ) {
      try {
        const { data, error } = await supabaseAdmin.auth.admin.generateLink({
          type: "signup", // 'signup' will generate confirmation email link
          email: trimmed,
        });

        if (error) {
          console.warn("admin.generateLink returned error:", error);
          return res.status(500).json({ error: error.message || "Failed to generate confirmation link." });
        }

        const actionLink = data?.action_link ?? data;
        return res.status(200).json({
          ok: true,
          info: actionLink ? "Confirmation link generated." : "Confirmation request sent.",
          action_link: actionLink ?? null,
        });
      } catch (genErr) {
        console.warn("admin.generateLink threw:", genErr);
        // fallthrough to REST fallback
      }
    }

    // Fallback: call the GoTrue admin REST endpoint directly (requires service role key)
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return res.status(500).json({ error: "Missing Supabase configuration on server." });
    }

    const endpoint = `${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/admin/generate_link`;
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
      },
      body: JSON.stringify({ type: "signup", email: trimmed }),
    });

    const payloadText = await resp.text();
    let payload;
    try {
      payload = payloadText ? JSON.parse(payloadText) : {};
    } catch (e) {
      payload = { raw: payloadText };
    }

    if (!resp.ok) {
      console.warn("admin/generate_link fallback failed:", resp.status, payload);
      const errMsg = payload?.error_description || payload?.error || payload?.message || `Status ${resp.status}`;
      return res.status(500).json({ error: `Failed to resend confirmation: ${errMsg}` });
    }

    // success — GoTrue may return an action_link, or just a success object
    return res.status(200).json({ ok: true, info: payload?.message ?? "Resent confirmation (fallback)", action_link: payload?.action_link ?? null });
  } catch (err) {
    console.error("resend-confirmation unexpected error:", err);
    return res.status(500).json({ error: "Unexpected server error while resending confirmation." });
  }
}
