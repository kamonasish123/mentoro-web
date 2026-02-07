// pages/api/create-profile.js
import { createServerSupabase } from "../../lib/supabaseClient";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { id, email, full_name } = req.body || {};
  if (!id || !email) {
    return res.status(400).json({ error: "Missing id or email" });
  }

  const supabaseAdmin = createServerSupabase();

  try {
    // 🔹 1. Read auth.users to get metadata if frontend didn't send name
    const { data: authUser, error: authError } =
      await supabaseAdmin.auth.admin.getUserById(id);

    if (authError) {
      console.error("auth.users fetch error:", authError);
    }

    const metaFullName =
      authUser?.user?.raw_user_meta_data?.full_name ?? null;

    // 🔹 2. Decide final full name
    const finalFullName = full_name || metaFullName;

    // 🔹 3. Decide display name (ALWAYS prefer full name)
    const displayName =
      finalFullName && finalFullName.trim() !== ""
        ? finalFullName
        : email.split("@")[0];

    const username = email.split("@")[0];

    const payload = {
      id,
      email,
      username,
      full_name: finalFullName,
      display_name: displayName,
      is_admin: false,
    };

    const { error } = await supabaseAdmin
      .from("profiles")
      .upsert(payload, { onConflict: "id" });

    if (error) {
      console.error("profiles upsert error:", error);
      return res.status(500).json({ error: "Profile save failed" });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("create-profile fatal:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
