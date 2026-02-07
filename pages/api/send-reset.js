// pages/api/send-reset.js
import { createServerSupabase } from "../../lib/supabaseClient";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email } = req.body || {};
  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Email is required" });
  }

  let supabaseAdmin;
  try {
    supabaseAdmin = createServerSupabase();
  } catch (err) {
    console.error("createServerSupabase error:", err);
    return res.status(500).json({ error: "Server configuration error (missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL)." });
  }

  const trimmed = String(email).trim().toLowerCase();

  // Ensure SUPABASE config exists
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return res.status(500).json({ error: "Missing Supabase configuration on server." });
  }

  try {
    // --- Primary: Ask Supabase to perform recover (this uses project SMTP to send email) ---
    try {
      const recoverEndpoint = `${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/recover`;
      const recoverResp = await fetch(recoverEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SERVICE_ROLE,
          Authorization: `Bearer ${SERVICE_ROLE}`,
        },
        body: JSON.stringify({
          email: trimmed,
          redirect_to: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
        }),
      });

      const recoverText = await recoverResp.text();
      let recoverJson;
      try {
        recoverJson = recoverText ? JSON.parse(recoverText) : {};
      } catch (e) {
        recoverJson = { raw: recoverText };
      }

      if (recoverResp.ok) {
        // Supabase accepted the recover request and will hand off to SMTP (SendGrid)
        return res.status(200).json({ ok: true, info: "recover_ok", body: recoverJson });
      }

      // If recover failed, log and fall through to generateLink fallback
      console.warn("Supabase recover endpoint returned non-ok:", recoverResp.status, recoverJson);
    } catch (recoverErr) {
      console.warn("Supabase recover request failed:", recoverErr);
      // fall through to generateLink fallback
    }

    // --- Fallback: generate a link server-side (admin) and return it (dev useful) ---
    if (
      supabaseAdmin &&
      supabaseAdmin.auth &&
      supabaseAdmin.auth.admin &&
      typeof supabaseAdmin.auth.admin.generateLink === "function"
    ) {
      const { data, error } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery", // 'recovery' -> reset password
        email: trimmed,
        redirect_to: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
      });

      if (error) {
        console.warn("admin.generateLink error:", error);
        return res.status(500).json({ error: error.message || "Failed to generate reset link." });
      }

      const actionLink = data?.action_link ?? data;
      return res.status(200).json({ ok: true, info: "Reset link generated (fallback).", action_link: actionLink ?? null });
    }

    // If for some reason we can't call admin.generateLink, call admin REST endpoint fallback
    const endpoint = `${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/admin/generate_link`;
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
      },
      body: JSON.stringify({ type: "recovery", email: trimmed, redirect_to: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000" }),
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
      return res.status(500).json({ error: `Failed to generate reset link: ${errMsg}` });
    }

    return res.status(200).json({ ok: true, info: payload?.message ?? "Reset link generated (fallback).", action_link: payload?.action_link ?? null });
  } catch (err) {
    console.error("send-reset unexpected error:", err);
    return res.status(500).json({ error: "Unexpected server error while generating reset link." });
  }
}
