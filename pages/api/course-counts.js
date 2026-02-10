import { createServerSupabase } from "../../lib/supabaseClient";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { courseIds } = req.body || {};
  const ids = Array.isArray(courseIds)
    ? Array.from(new Set(courseIds.filter((id) => id !== null && id !== undefined && id !== "")))
    : [];
  if (ids.length === 0) {
    return res.status(200).json({ ok: true, counts: {} });
  }

  try {
    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("enrollments")
      .select("course_id")
      .in("course_id", ids);

    if (error) {
      return res.status(500).json({ ok: false, error: error.message || "Failed to fetch counts" });
    }

    const counts = {};
    for (const row of data || []) {
      const id = row.course_id;
      if (!id) continue;
      counts[id] = (counts[id] || 0) + 1;
    }

    return res.status(200).json({ ok: true, counts });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "Unexpected server error" });
  }
}
