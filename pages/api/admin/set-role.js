// pages/api/admin/set-role.js
import { createServerSupabase } from "@/lib/supabaseClient";


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
    // fetch target profile (may not exist)
    const { data: targetProf, error: tpErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email, role, is_admin, display_name, username")
      .eq("id", profileId)
      .maybeSingle();

    if (tpErr) {
      console.warn("profiles lookup failed (non-fatal):", tpErr);
    }

    let targetEmail = (targetProf?.email || "").toLowerCase() || "";
    if (!targetEmail) {
      // If target profile doesn't exist, or email missing, fetch auth.users by id
      const { data: authRow } = await supabaseAdmin
        .from("auth.users")
        .select("id, email")
        .eq("id", profileId)
        .limit(1)
        .single();
      targetEmail = (authRow?.email || "").toLowerCase();
    }

    if (targetEmail && targetEmail === OWNER_EMAIL.toLowerCase()) {
      return res.status(400).json({ error: "Cannot change owner role" });
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

    // 3) Update or insert (service role bypasses RLS)
    const isAdminFlag = desired === "admin" || desired === "super_admin";
    let upRes = null;
    let upErr = null;

    if (targetProf?.id) {
      const resUpdate = await supabaseAdmin
        .from("profiles")
        .update({ role: desired, is_admin: isAdminFlag })
        .eq("id", profileId)
        .select()
        .single();
      upRes = resUpdate.data;
      upErr = resUpdate.error;
    } else {
      // need display_name (NOT NULL), so fetch from auth.users
      let authUser = null;
      try {
        if (supabaseAdmin?.auth?.admin?.getUserById) {
          const { data: au } = await supabaseAdmin.auth.admin.getUserById(profileId);
          authUser = au?.user || null;
        }
      } catch (err) {
        authUser = null;
      }
      if (!authUser) {
        const { data: authRow } = await supabaseAdmin
          .from("auth.users")
          .select("id, email, raw_user_meta_data")
          .eq("id", profileId)
          .limit(1)
          .single();
        authUser = authRow
          ? {
              id: authRow.id,
              email: authRow.email,
              user_metadata: authRow.raw_user_meta_data || {},
            }
          : null;
      }

      if (!authUser) {
        return res.status(404).json({ error: "Target user not found in auth.users" });
      }

      const email = authUser.email || null;
      const metaName =
        authUser.user_metadata?.full_name ||
        authUser.user_metadata?.name ||
        authUser.user_metadata?.display_name ||
        "";
      const fallbackName = email ? String(email).split("@")[0] : "User";
      const displayName = String(metaName || fallbackName || "User").trim() || "User";
      const username = String((email ? email.split("@")[0] : authUser.id) || authUser.id).trim();

      const insertPayload = {
        id: profileId,
        role: desired,
        is_admin: isAdminFlag,
        email,
        display_name: displayName,
        username,
        full_name: metaName || displayName,
      };

      const resInsert = await supabaseAdmin
        .from("profiles")
        .insert(insertPayload)
        .select()
        .single();
      upRes = resInsert.data;
      upErr = resInsert.error;
    }

    if (upErr) {
      console.error("set-role failed", upErr);
      return res.status(500).json({ error: upErr.message || "Failed to update profile role" });
    }

    return res.status(200).json({ ok: true, data: upRes });
  } catch (err) {
    console.error("set-role handler error", err);
    return res.status(500).json({ error: err?.message || "Unexpected server error" });
  }
}
