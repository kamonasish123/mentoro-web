// pages/courses/[slug]/ranklist.js
import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabase } from "@/lib/supabaseClient";


export default function CourseRanklist() {
  const router = useRouter();
  const { slug } = router.query;
  const [loading, setLoading] = useState(true);
  const [course, setCourse] = useState(null);
  const [fullList, setFullList] = useState([]); // array of {pos, id, name, institution, country, total, firstSolvedAt}
  const [fallbackEnrollList, setFallbackEnrollList] = useState([]);

  useEffect(() => {
    if (!slug) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const { data: courses } = await supabase
          .from("courses")
          .select("id, slug, title")
          .eq("slug", slug)
          .limit(1);

        const c = courses?.[0] ?? null;
        if (!c) {
          if (mounted) {
            setCourse(null);
            setFullList([]);
            setLoading(false);
          }
          return;
        }
        if (mounted) setCourse(c);

        // fetch problems for that course
        const { data: cpRows } = await supabase
          .from("course_problems")
          .select("problem_id")
          .eq("course_id", c.id);

        const problemIds = (cpRows || []).map(r => r.problem_id).filter(Boolean);

        let aggregated = [];

        if (problemIds.length > 0) {
          // fetch solves and profiles
          const { data: solves, error: solvesErr } = await supabase
            .from("solves")
            .select("user_id, solved_at, profiles(id, display_name, username, institution, country)")
            .in("problem_id", problemIds)
            .order("solved_at", { ascending: true });

          if (!solvesErr && Array.isArray(solves) && solves.length > 0) {
            const map = new Map();
            for (const s of solves) {
              const uid = s.user_id;
              const prof = s.profiles || {};
              if (!map.has(uid)) {
                map.set(uid, {
                  user_id: uid,
                  display_name: prof.display_name || prof.username || uid,
                  institution: prof.institution || null,
                  country: prof.country || null,
                  total: 0,
                  firstSolvedAt: s.solved_at || null,
                });
              }
              const ent = map.get(uid);
              ent.total += 1;
              // firstSolvedAt is already earliest due to ORDER BY solved_at
            }

            aggregated = Array.from(map.values())
              .sort((a, b) => {
                if (b.total !== a.total) return b.total - a.total;
                if (!a.firstSolvedAt) return 1;
                if (!b.firstSolvedAt) return -1;
                return new Date(a.firstSolvedAt) - new Date(b.firstSolvedAt);
              })
              .map((u, i) => ({
                pos: i + 1,
                id: u.user_id,
                name: u.display_name,
                institution: u.institution,
                country: u.country,
                total: u.total,
                firstSolvedAt: u.firstSolvedAt,
              }));
          }
        }

        // fallback: if no aggregated solves, show enrolled users ordered by enrolled_at
        if (aggregated.length === 0) {
          const { data: ranks } = await supabase
            .from("enrollments")
            .select("user_id, enrolled_at, profiles(id, display_name, username, institution, country)")
            .eq("course_id", c.id)
            .order("enrolled_at", { ascending: true });

          const list = (ranks || []).map((r, i) => {
            const p = r.profiles || {};
            return {
              pos: i + 1,
              id: p.id || r.user_id,
              name: p.display_name || p.username || `User ${i + 1}`,
              institution: p.institution || null,
              country: p.country || null,
              total: 0,
              firstSolvedAt: null,
            };
          });

          if (mounted) {
            setFallbackEnrollList(list);
            setFullList(list);
          }
        } else {
          if (mounted) {
            setFullList(aggregated);
            setFallbackEnrollList([]);
          }
        }
      } catch (err) {
        console.error("failed to load full ranklist", err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [slug]);

  if (loading) return <div className="p-6">Loading ranklist…</div>;
  if (!course) return <div className="p-6">Course not found</div>;

  return (
    <div>
      <Head>
        <title>Ranklist — {course.title}</title>
      </Head>

      <main className="min-h-screen p-6">
        <div className="max-w-4xl mx-auto">
          <header className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-center" style={{ flex: 1 }}>{course.title} — Ranklist</h1>
            <div style={{ marginLeft: 12 }}>
              <Link href={`/courses/${encodeURIComponent(course.slug)}`}>
                <a className="px-3 py-1 rounded border" style={{ textDecoration: 'none' }}>Back</a>
              </Link>
            </div>
          </header>

          <div className="card p-4">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: 8 }}>#</th>
                  <th style={{ textAlign: "left", padding: 8 }}>Name</th>
                  <th style={{ textAlign: "left", padding: 8 }}>Institution</th>
                  <th style={{ textAlign: "left", padding: 8 }}>Country</th>
                  <th style={{ textAlign: "right", padding: 8 }}>Solved</th>
                  <th style={{ textAlign: "right", padding: 8 }}>First solved</th>
                </tr>
              </thead>
              <tbody>
                {fullList.map(u => (
                  <tr key={u.id} style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                    <td style={{ padding: 8 }}>{u.pos}</td>
                    <td style={{ padding: 8 }}>{u.name}</td>
                    <td style={{ padding: 8 }}>{u.institution || "-"}</td>
                    <td style={{ padding: 8 }}>{u.country || "-"}</td>
                    <td style={{ padding: 8, textAlign: "right", fontWeight: 700, color: "#064e3b" }}>{u.total ?? 0}</td>
                    <td style={{ padding: 8, textAlign: "right", color: "rgba(0,0,0,0.6)" }}>{u.firstSolvedAt ? new Date(u.firstSolvedAt).toLocaleString() : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {fullList.length === 0 && fallbackEnrollList.length === 0 && (
              <div style={{ padding: 12, color: "gray" }}>No participants yet.</div>
            )}
          </div>
        </div>
      </main>

      <style jsx>{`
        .card {
          background: white;
          border-radius: 10px;
          border: 1px solid #e6e6e6;
          padding: 12px;
        }
        a { color: inherit; }
      `}</style>
    </div>
  );
}