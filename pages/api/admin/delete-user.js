// pages/api/admin/delete-user.js
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// protect owner
const OWNER_EMAIL = "rkamonasish@gmail.com";

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: "Missing userId" });

  // read bearer token
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: "Missing Authorization token" });
  }

  try {
    /* -------------------------
       1) Verify caller session
    -------------------------- */
    const { data: callerAuth, error: authErr } =
      await supabaseAdmin.auth.getUser(token);

    if (authErr || !callerAuth?.user) {
      return res.status(401).json({ error: "Invalid session" });
    }

    const callerId = callerAuth.user.id;

    /* -------------------------
       2) Load caller profile
    -------------------------- */
    const { data: callerProfile, error: callerProfErr } =
      await supabaseAdmin
        .from("profiles")
        .select("id, role, email")
        .eq("id", callerId)
        .single();

    if (callerProfErr || !callerProfile) {
      return res.status(403).json({ error: "Caller profile not found" });
    }

    if ((callerProfile.role || "").toLowerCase() !== "super_admin") {
      return res.status(403).json({
        error: "Only super_admin can permanently delete users",
      });
    }

    /* -------------------------
       3) Load target profile
    -------------------------- */
    const { data: targetProfile, error: targetErr } =
      await supabaseAdmin
        .from("profiles")
        .select("id, email, role")
        .eq("id", userId)
        .single();

    if (targetErr) {
      return res.status(404).json({ error: "Target user not found" });
    }

    // protect owner
    if (
      (targetProfile.email || "").toLowerCase() ===
      OWNER_EMAIL.toLowerCase()
    ) {
      return res.status(403).json({ error: "Cannot delete owner account" });
    }

    /* -------------------------
       4) Delete from auth.users
    -------------------------- */
    const { error: authDeleteErr } =
      await supabaseAdmin.auth.admin.deleteUser(userId);

    if (authDeleteErr) {
      console.error("Auth delete error:", authDeleteErr);
      return res.status(500).json({
        error: "Failed to delete auth user",
      });
    }

    /* -------------------------
       5) Delete profile row
    -------------------------- */
    const { error: profileDeleteErr } =
      await supabaseAdmin
        .from("profiles")
        .delete()
        .eq("id", userId);

    if (profileDeleteErr) {
      console.warn("Profile delete warning:", profileDeleteErr);
      return res.status(200).json({
        ok: true,
        note: "Auth user deleted, profile row could not be removed",
      });
    }

    return res.status(200).json({
      ok: true,
      message: "User permanently removed from Auth and database",
    });
  } catch (err) {
    console.error("delete-user API error:", err);
    return res.status(500).json({
      error: err?.message || "Server error",
    });
  }
}
