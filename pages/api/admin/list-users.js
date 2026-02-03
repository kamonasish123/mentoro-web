// pages/api/admin/list-users.js
import { createServerSupabase } from "../../../lib/supabaseClient";

/**
 GET /api/admin/list-users
 Query params:
   page (1-based), pageSize, search, role
 Header: Authorization: Bearer <access_token>
*/
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

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
    // validate token -> operator user
    let userData;
    try {
      const resp = await supabaseAdmin.auth.getUser(token);
      userData = resp?.data;
      if (!userData?.user) {
        // fallback form (some versions)
        const resp2 = await supabaseAdmin.auth.getUser({ access_token: token });
        userData = resp2?.data;
      }
    } catch (e) {
      console.warn("auth.getUser error", e);
    }

    const operator = userData?.user;
    if (!operator?.id) {
      return res.status(401).json({ error: "Invalid access token" });
    }

    // load operator profile server-side
    const { data: opProf, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("id, role, is_admin, email")
      .eq("id", operator.id)
      .limit(1)
      .single();

    if (profErr || !opProf) return res.status(403).json({ error: "Operator profile not found" });

    const opRole = (opProf.role || "").toLowerCase();
    const allowedOps = ["super_admin", "admin", "moderator"];
    if (!allowedOps.includes(opRole)) return res.status(403).json({ error: "Not authorized to list users" });

    // parse query
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const pageSize = Math.max(1, Math.min(200, parseInt(req.query.pageSize || "20", 10)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const search = (req.query.search || "").trim();
    const roleFilter = (req.query.role || "").trim();

    // build profiles query using service-role (bypass RLS)
    let q = supabaseAdmin
      .from("profiles")
      .select("id, username, display_name, email, role, is_admin, created_at", { count: "exact" })
      .order("created_at", { ascending: false });

    if (roleFilter && roleFilter !== "all") {
      q = q.eq("role", roleFilter);
    }

    if (search) {
      const esc = search.replace(/%/g, "\\%").replace(/,/g, " ");
      const pattern = `%${esc}%`;
      const orExpr = `username.ilike.${pattern},display_name.ilike.${pattern},email.ilike.${pattern}`;
      q = q.range(from, to).or(orExpr);
    } else {
      q = q.range(from, to);
    }

    const { data: profilesData, error: pErr, count } = await q;

    if (!pErr && Array.isArray(profilesData) && profilesData.length > 0) {
      return res.status(200).json({ data: profilesData, count: Number(count || profilesData.length) });
    }

    // if no profiles matched and search contains '@', try auth.users by email for placeholders
    if (search && search.includes("@")) {
      try {
        const emailPattern = `%${search}%`;
        const { data: authRows, error: authErr } = await supabaseAdmin
          .from("auth.users")
          .select("id, email, created_at")
          .ilike("email", emailPattern)
          .range(from, to)
          .limit(pageSize);

        if (!authErr && Array.isArray(authRows) && authRows.length > 0) {
          // For each auth user found, attempt to fetch profile -- if not found provide placeholder
          const placeholders = [];
          for (const a of authRows) {
            const { data: profById, error: profByIdErr } = await supabaseAdmin
              .from("profiles")
              .select("id, username, display_name, email, role, is_admin, created_at")
              .eq("id", a.id)
              .limit(1);

            if (!profByIdErr && Array.isArray(profById) && profById.length > 0) {
              placeholders.push(profById[0]);
            } else {
              placeholders.push({
                id: a.id,
                username: (a.email || "").split("@")[0],
                display_name: null,
                email: a.email || null,
                role: "user",
                is_admin: false,
                created_at: a.created_at || null,
              });
            }
          }
          return res.status(200).json({ data: placeholders, count: placeholders.length });
        }
      } catch (e) {
        // ignore
      }
    }

    // if no profiles found (empty), return empty set w/ count 0
    return res.status(200).json({ data: [], count: 0 });
  } catch (err) {
    console.error("list-users error", err);
    return res.status(500).json({ error: err?.message || "Unexpected server error" });
  }
}
