// pages/api/admin/block-user.js
import { createServerSupabase } from "@/lib/supabaseClient";

/*
  POST /api/admin/block-user
  Body: { userId: "<uuid>", block: true|false }
  Header: Authorization: Bearer <access_token>
*/

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { userId, block } = req.body || {};
  if (!userId || typeof userId !== "string") {
    return res.status(400).json({ error: "userId required" });
  }
  if (typeof block !== "boolean") {
    return res.status(400).json({ error: "block must be boolean" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing access token" });

  let supabaseAdmin;
  try {
    supabaseAdmin = createServerSupabase();
  } catch (err) {
    console.error("createServerSupabase error", err);
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  try {
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      try {
        const { data: userData2, error: userErr2 } = await supabaseAdmin.auth.getUser({ access_token: token });
        if (userErr2 || !userData2?.user) {
          return res.status(401).json({ error: "Invalid token" });
        }
        userData.user = userData2.user;
      } catch (e) {
        return res.status(401).json({ error: "Invalid token" });
      }
    }

    const operator = userData.user;
    if (!operator?.id) return res.status(401).json({ error: "Invalid operator" });

    const { data: opProf, error: opErr } = await supabaseAdmin
      .from("profiles")
      .select("id, role, email")
      .eq("id", operator.id)
      .single();
    if (opErr || !opProf) return res.status(403).json({ error: "Operator profile not found" });

    const opRole = (opProf.role || "").toLowerCase();
    if (opRole !== "super_admin") {
      return res.status(403).json({ error: "Not authorized to block/unblock users" });
    }

    // prevent blocking owner or self
    const OWNER_EMAIL = "rkamonasish@gmail.com";
    if (operator.id === userId) {
      return res.status(400).json({ error: "You cannot block your own account" });
    }

    const { data: target, error: tErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .eq("id", userId)
      .single();

    if (tErr) {
      return res.status(404).json({ error: "Target user not found" });
    }
    if ((target.email || "").toLowerCase() === OWNER_EMAIL.toLowerCase()) {
      return res.status(400).json({ error: "Cannot block the owner account" });
    }

    const { error: updErr } = await supabaseAdmin
      .from("profiles")
      .update({ is_blocked: block })
      .eq("id", userId);

    if (updErr) {
      return res.status(500).json({ error: updErr.message || "Failed to update block status" });
    }

    return res.status(200).json({ ok: true, blocked: block });
  } catch (err) {
    console.error("block-user unexpected", err);
    return res.status(500).json({ error: "Unexpected server error" });
  }
}
