// pages/courses/[slug]/ranklist.js
import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabase } from "../../../lib/supabaseClient";

export default function CourseRanklist() {
  const router = useRouter();
  const { slug } = router.query;

  const [loading, setLoading] = useState(true);
  const [course, setCourse] = useState(null);
  const [fullList, setFullList] = useState([]); // aggregated solves or enroll fallback
  const [fallbackEnrollList, setFallbackEnrollList] = useState([]);
  const [profilesMap, setProfilesMap] = useState(new Map());

  // Helper: fetch profiles for a list of user IDs and return a Map(id -> profile)
  // client-side helper: call RPC to fetch public profile fields (avoids RLS)
  async function fetchProfilesMap(userIds) {
    if (!Array.isArray(userIds) || userIds.length === 0) return new Map();
    const unique = Array.from(new Set(userIds)).slice(0, 2000);

    try {
      const { data: profiles, error } = await supabase.rpc("get_public_profiles", { ids: unique });
      if (error) {
        console.warn("get_public_profiles rpc error", error);
        return new Map();
      }
      const map = new Map();
      for (const p of profiles || []) map.set(p.id, p);
      return map;
    } catch (err) {
      console.error("fetchProfilesMap rpc error", err);
      return new Map();
    }
  }

  // Helper: choose best display name (prefers display_name -> full_name -> username -> short id)
  function chooseName(prof, userId) {
    if (prof?.display_name && !/^user\s*\d+$/i.test(prof.display_name) && prof.display_name.trim()) return prof.display_name;
    if (prof?.full_name && prof.full_name.trim()) return prof.full_name;
    if (prof?.username && prof.username.trim()) return prof.username;
    const idSource = userId || (prof && prof.id) || "";
    return `User ${String(idSource).slice(0, 6)}`;
  }

  useEffect(() => {
    if (!slug) return;
    let mounted = true;

    (async () => {
      setLoading(true);
      try {
        const { data: courses, error: courseErr } = await supabase
          .from("courses")
          .select("id, slug, title")
          .eq("slug", slug)
          .limit(1);

        if (courseErr) throw courseErr;
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

        // problems in course
        const { data: cpRows } = await supabase
          .from("course_problems")
          .select("problem_id")
          .eq("course_id", c.id);

        const problemIds = (cpRows || []).map((r) => r.problem_id).filter(Boolean);

        let aggregated = [];

        if (problemIds.length > 0) {
          // fetch solves (we only need user_id + solved_at)
          const { data: solves, error: solvesErr } = await supabase
            .from("solves")
            .select("user_id, solved_at, problem_id")
            .in("problem_id", problemIds)
            .order("solved_at", { ascending: true });

          if (!solvesErr && Array.isArray(solves) && solves.length > 0) {
            // aggregate per user
            const m = new Map();
            for (const s of solves) {
              const uid = s.user_id;
              if (!m.has(uid)) {
                m.set(uid, { user_id: uid, total: 0, firstSolvedAt: s.solved_at || null });
              }
              const ent = m.get(uid);
              ent.total += 1;
            }

            // convert to array and sort
            const arr = Array.from(m.values()).sort((a, b) => {
              if (b.total !== a.total) return b.total - a.total; // more solves first
              if (!a.firstSolvedAt) return 1;
              if (!b.firstSolvedAt) return -1;
              return new Date(a.firstSolvedAt) - new Date(b.firstSolvedAt); // earlier firstSolve wins
            });

            // fetch profile info for these users (used for institution/country and to seed profilesMap)
            const userIds = arr.map((x) => x.user_id);
            const profMap = await fetchProfilesMap(userIds);

            aggregated = arr.map((u, i) => {
              const prof = profMap.get(u.user_id) || {};
              return {
                pos: i + 1,
                id: u.user_id,
                institution: prof.institution || null,
                country: prof.country || null,
                total: u.total,
                firstSolvedAt: u.firstSolvedAt,
              };
            });

            // merge profMap into local profilesMap for quick render
            if (mounted && profMap && profMap.size > 0) {
              setProfilesMap((prev) => {
                const merged = new Map(prev);
                for (const [k, v] of profMap) merged.set(k, v);
                return merged;
              });
            }
          }
        }

        // fallback to enrollments if no solves
        if (!aggregated || aggregated.length === 0) {
          const { data: ranks, error: enrollErr } = await supabase
            .from("enrollments")
            .select("user_id, enrolled_at")
            .eq("course_id", c.id)
            .order("enrolled_at", { ascending: true });

          if (enrollErr) throw enrollErr;

          const userIds = (ranks || []).map((r) => r.user_id);
          const profMap = await fetchProfilesMap(userIds);

          const list = (ranks || []).map((r, i) => {
            const p = profMap.get(r.user_id) || {};
            return {
              pos: i + 1,
              id: r.user_id,
              institution: p.institution || null,
              country: p.country || null,
              total: 0,
              firstSolvedAt: r.enrolled_at || null,
            };
          });

          if (mounted) {
            setFallbackEnrollList(list);
            setFullList(list);
            // merge profile map
            if (profMap && profMap.size > 0) {
              setProfilesMap((prev) => {
                const merged = new Map(prev);
                for (const [k, v] of profMap) merged.set(k, v);
                return merged;
              });
            }
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

    return () => {
      mounted = false;
    };
  }, [slug]);

  // When the fullList changes, ensure we have the profile rows for all users
  useEffect(() => {
    if (!fullList || fullList.length === 0) return;

    const ids = fullList.map((u) => u.id).filter(Boolean);
    if (ids.length === 0) return;

    (async () => {
      try {
        const map = await fetchProfilesMap(ids);
        if (map && map.size > 0) {
          setProfilesMap((prev) => {
            const merged = new Map(prev);
            for (const [k, v] of map) merged.set(k, v);
            return merged;
          });
        }
      } catch (err) {
        console.warn("failed to refresh profilesMap for fullList", err);
      }
    })();
  }, [fullList.length]);

  if (loading)
    return (
      <div className="page-wrap">
        <div className="center">Loading ranklist…</div>
      </div>
    );
  if (!course)
    return (
      <div className="page-wrap">
        <div className="center">Course not found</div>
      </div>
    );

  return (
    <div className="page-wrap">
      <Head>
        <title>Ranklist — {course.title}</title>
      </Head>

      <main className="container">
        <div className="top">
          <div className="title">
            <h1>{course.title}</h1>
            <p className="muted">Course ranklist — ordered by total solves (tie-break: earliest first solve)</p>
          </div>

          <div className="actions">
            <Link href={`/courses/${encodeURIComponent(slug) || ""}`} className="btn btn-cyan" aria-label="Back to course">
              Back to course
            </Link>
          </div>
        </div>

        <section className="content-card">
          <div className="list-header">
            <div className="rank-col">#</div>
            <div className="name-col">Name</div>
            <div className="inst-col">Institution</div>
            <div className="country-col">Country</div>
            <div className="solved-col">Solved</div>
            <div className="first-col">First solved</div>
          </div>

          <div className="list-body">
            {fullList.length === 0 ? (
              <div className="empty">No participants yet.</div>
            ) : (
              fullList.map((u) => (
                <div key={u.id + "-" + u.pos} className={`row ${u.pos <= 3 ? "top-three" : ""}`}>
                  <div className="rank-col">
                    {u.pos <= 3 ? (
                      <span className={`medal m${u.pos}`}>{u.pos === 1 ? "🥇" : u.pos === 2 ? "🥈" : "🥉"}</span>
                    ) : (
                      <span className="rank-num">{u.pos}</span>
                    )}
                  </div>

                  <div className="name-col">
                    <div className="name-bold">{chooseName(profilesMap.get(u.id), u.id)}</div>
                  </div>

                  <div className="inst-col">{u.institution || "—"}</div>
                  <div className="country-col">{u.country || "—"}</div>

                  <div className="solved-col">
                    <span className="solved-badge">{u.total ?? 0}</span>
                  </div>

                  <div className="first-col">{u.firstSolvedAt ? new Date(u.firstSolvedAt).toLocaleString() : "—"}</div>
                </div>
              ))
            )}
          </div>

          <div className="footer-note">
            <small>
              Ranking prioritizes users with more solves. If two users have same total, the user who solved earlier ranks higher.
            </small>
          </div>
        </section>
      </main>

      <style jsx>{`
        :root{
          --bg-dark: #071029;
          --grid-cyan: rgba(0,210,255,0.03);
          --accent-cyan: #00d2ff;
          --card-bg: rgba(255,255,255,0.03);
          --muted: rgba(255,255,255,0.75);
          --muted-2: rgba(255,255,255,0.55);
        }

        /* page background (like your homepage) */
        .page-wrap {
          min-height: 100vh;
          background: var(--bg-dark);
          color: var(--muted);
          background-image:
            linear-gradient(var(--grid-cyan) 1px, transparent 1px),
            linear-gradient(90deg, var(--grid-cyan) 1px, transparent 1px);
          background-size: 50px 50px;
          padding: 36px 20px;
        }

        .container {
          max-width: 900px;
          margin: 0 auto;
        }

        .center { text-align:center; color: var(--muted-2); padding: 40px 0; }

        .top {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap: 18px;
          margin-bottom: 18px;
        }

        .title h1 { color: rgba(255,255,255,0.95); margin:0; font-size: 20px; }
        .muted { color: var(--muted-2); margin:4px 0 0; font-size: 13px; }

        .actions { display:flex; gap:10px; align-items:center; }

        /* buttons */
        .btn {
          padding: 8px 12px;
          border-radius: 8px;
          background: rgba(255,255,255,0.03);
          color: white;
          border: 1px solid rgba(255,255,255,0.06);
          cursor: pointer;
          font-weight: 700;
          text-decoration: none;
        }
        .btn:hover { transform: translateY(-3px); box-shadow: 0 12px 30px rgba(0,210,255,0.06); border-color: rgba(0,210,255,0.18); }

        .btn-cyan {
          background: rgba(0,210,255,0.06);
          color: #002;
          border: 1px solid rgba(0,210,255,0.18);
        }

        /* card */
        .content-card {
          background: var(--card-bg);
          border-radius: 12px;
          padding: 10px;
          border: 1px solid rgba(255,255,255,0.04);
          box-shadow: 0 8px 30px rgba(0,0,0,0.6);
        }

        .list-header {
          display:grid;
          grid-template-columns: 60px 2fr 1.4fr 1fr 100px 160px;
          gap: 12px;
          padding:10px;
          color: var(--muted-2);
          font-weight:700;
          align-items:center;
          border-bottom: 1px solid rgba(255,255,255,0.03);
        }

        .list-body { display:flex; flex-direction:column; }

        .row {
          display:grid;
          grid-template-columns: 60px 2fr 1.4fr 1fr 100px 160px;
          gap:12px;
          align-items:center;
          padding:12px;
          transition: background 180ms ease, transform 120ms ease;
        }
        .row:hover { background: rgba(0,210,255,0.04); transform: translateY(-4px); box-shadow: 0 14px 40px rgba(0,210,255,0.04); color: #fff; }

        .row + .row { border-top: 1px solid rgba(255,255,255,0.02); }

        .rank-num { font-weight:800; color: rgba(255,255,255,0.9); }
        .name-bold {
          color: #22d3ee;        /* cyan-400 */
          font-weight: 800;
          letter-spacing: 0.2px;
        }
        .id-muted { font-size:12px; color: var(--muted-2); margin-top:4px; }

        .solved-badge {
          display:inline-block;
          min-width:40px;
          padding:6px 8px;
          border-radius:8px;
          background: rgba(0,0,0,0.06);
          font-weight:800;
          color: #064e3b; /* green */
          text-align:center;
        }

        /* top 3 highlight */
        .top-three { background: linear-gradient(90deg, rgba(0,210,255,0.05), rgba(255,255,255,0.02)); }
        .medal { font-size:18px; display:inline-block; padding:6px; border-radius:8px; }
        .m1 { background: linear-gradient(90deg,#ffedd5,#fff7ed); }
        .m2 { background: linear-gradient(90deg,#eef2ff,#f5f3ff); }
        .m3 { background: linear-gradient(90deg,#fef2f2,#fff1f2); }

        .empty { padding:20px; color: var(--muted-2); text-align:center; }

        .footer-note { margin-top:10px; color: var(--muted-2); font-size:13px; text-align:center; padding:8px; }

        /* responsiveness */
        @media (max-width: 900px) {
          .list-header { display:none; }
          .row, .list-body { display:block; }
          .row { padding:12px; border-bottom: 1px solid rgba(255,255,255,0.03); margin-bottom:8px; border-radius:8px; }
          .row > div { display:block; margin-bottom:6px; }
          .rank-col { font-weight:800; }
          .solved-col { text-align:left; }
        }
      `}</style>
    </div>
  );
}