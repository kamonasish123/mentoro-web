// pages/api/admin/list-users.js
import { createServerSupabase } from "@/lib/supabaseClient";


/*
 POST /api/admin/list-users
 Query/body:
  - page (number, default 1)
  - pageSize (number, default 20)
  - search (string)
  - role (string, default "all")

 Returns:
  { ok: true, data: [...profiles], count: totalCount }
  on error: { ok: false, error: "message" }
  
 NOTE: This endpoint uses SUPABASE_SERVICE_ROLE_KEY to bypass RLS.
 It's designed for admin UI only; protect it in production if needed.
*/

export default async function handler(req, res) {
  // allow GET or POST
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const params = req.method === "GET" ? req.query : req.body || {};
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.max(1, Number(params.pageSize) || 20);
  const search = (params.search || "").trim();
  const role = (params.role || "all").trim();

  // create admin client with service role
  let supabaseAdmin;
  try {
    supabaseAdmin = createServerSupabase();
  } catch (err) {
    console.error("createServerSupabase error:", err);
    return res.status(500).json({ ok: false, error: "Server configuration error" });
  }

  try {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // base select
    let q = supabaseAdmin
      .from("profiles")
      .select("id, username, display_name, email, role, is_admin, created_at, is_blocked", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (role && role !== "all") {
      q = q.eq("role", role);
    }

    if (search) {
      const esc = search.replace(/%/g, "\\%").replace(/,/g, " ");
      const pattern = `%${esc}%`;
      const orExpr = `username.ilike.${pattern},display_name.ilike.${pattern},email.ilike.${pattern}`;
      q = q.or(orExpr);
    }

    const { data, error, count } = await q;

    if (error) {
      console.error("admin/list-users profiles query error:", error);
      return res.status(500).json({ ok: false, error: error.message || "DB error" });
    }

    // return as-is; mark has_profile true (these are actual profiles rows)
    const final = Array.isArray(data) ? data.map(r => ({ ...r, has_profile: true })) : [];

    return res.status(200).json({ ok: true, data: final, count: Number(count || final.length) });
  } catch (err) {
    console.error("admin/list-users unexpected:", err);
    return res.status(500).json({ ok: false, error: "Unexpected server error" });
  }
}
