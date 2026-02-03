// pages/api/admin/set-role.js
import { createServerSupabase } from "../../../lib/supabaseClient";

/*
  POST /api/admin/set-role
  Body: { profileId: "<uuid>", role: "<role>" }
  Header: Authorization: Bearer <access_token>  (client sends current user's access token)
*/

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { profileId, role } = req.body || {};
  if (!profileId || typeof profileId !== "string") {
    return res.status(400).json({ error: "profileId required" });
  }
  if (!role || typeof role !== "string") {
    return res.status(400).json({ error: "role required" });
  }

  // Access token passed from client
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing access token" });

  // Create server (service-role) supabase client
  let supabaseAdmin;
  try {
    supabaseAdmin = createServerSupabase();
  } catch (err) {
    console.error("createServerSupabase error", err);
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  try {
    // 1) Validate token -> get the calling user
    // supabase-js v2: pass access_token as param
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      // Some installations / versions may require getUser({ access_token: token }) — if getUser(token) fails, fallback:
      try {
        const { data: userData2, error: userErr2 } = await supabaseAdmin.auth.getUser({ access_token: token });
        if (userErr2 || !userData2?.user) {
          console.warn("auth.getUser failed", userErr || userErr2);
          return res.status(401).json({ error: "Invalid token" });
        }
        // use userData2
        userData.user = userData2.user;
      } catch (e) {
        console.warn("auth.getUser fallback failed", e);
        return res.status(401).json({ error: "Invalid token" });
      }
    }

    const operator = userData.user;
    if (!operator || !operator.id) return res.status(401).json({ error: "Invalid operator" });

    // 2) Load operator profile (server-side using service key)
    const { data: opProf, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("id, role, is_admin, email")
      .eq("id", operator.id)
      .single();

    if (profErr || !opProf) {
      return res.status(403).json({ error: "Operator profile not found or not permitted" });
    }

    const opRole = (opProf.role || "").toLowerCase();

    // Only allow super_admin / admin / moderator (as you defined in UI)
    const allowedOperators = ["super_admin", "admin", "moderator"];
    if (!allowedOperators.includes(opRole)) {
      return res.status(403).json({ error: "Not authorized to set roles" });
    }

    // prevent operator from changing their own role
    if (operator.id === profileId && opRole !== "super_admin") {
      return res.status(400).json({ error: "You cannot change your own role" });
    }

    // prevent demoting the OWNER (hard-coded email) for safety (your UI had OWNER_EMAIL)
    const OWNER_EMAIL = "rkamonasish@gmail.com";
    // fetch target profile email
    const { data: targetProf, error: tpErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email, role, is_admin")
      .eq("id", profileId)
      .limit(1)
      .single();

    if (tpErr) {
      // If target profile doesn't exist, we still allow creating/upserting it (as placeholder) but don't allow changing owner
      // To be safe: fetch auth.users by id to inspect email
      const { data: authRow, error: authErr } = await supabaseAdmin
        .from("auth.users")
        .select("id, email")
        .eq("id", profileId)
        .limit(1)
        .single();

      const targetEmail = authRow?.email || null;
      if (targetEmail === OWNER_EMAIL) {
        return res.status(400).json({ error: "Cannot change owner role" });
      }
    } else {
      if ((targetProf.email || "").toLowerCase() === OWNER_EMAIL.toLowerCase()) {
        return res.status(400).json({ error: "Cannot change owner role" });
      }
    }

    // Validate requested role allowed for operator:
    const ALL_ROLES = ["super_admin", "admin", "moderator", "premium", "user"];
    const MODERATOR_ALLOWED = ["premium", "user"];
    const desired = (role || "").toLowerCase();
    if (!ALL_ROLES.includes(desired)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    if (opRole === "moderator" && !MODERATOR_ALLOWED.includes(desired)) {
      return res.status(403).json({ error: "Moderator cannot set that role" });
    }

    // 3) Perform upsert using service role (bypasses RLS; safe because we checked authorization above).
    const upsertPayload = {
      id: profileId,
      role: desired,
      // set is_admin true for admin/super_admin, false otherwise (optional)
      is_admin: desired === "admin" || desired === "super_admin" ? true : false,
    };

    const { data: upRes, error: upErr } = await supabaseAdmin
      .from("profiles")
      .upsert(upsertPayload, { onConflict: "id" })
      .select()
      .single();

    if (upErr) {
      console.error("upsert failed", upErr);
      return res.status(500).json({ error: upErr.message || "Failed to upsert profile" });
    }

    return res.status(200).json({ ok: true, data: upRes });
  } catch (err) {
    console.error("set-role handler error", err);
    return res.status(500).json({ error: err?.message || "Unexpected server error" });
  }
}
