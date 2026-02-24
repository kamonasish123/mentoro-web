// pages/courses/[slug]/ranklist.js
import { useEffect, useState, useMemo, useCallback } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabase } from "@/lib/supabaseClient";


/**
 * Ranklist page - uses course_user_stats aggregate table and subscribes to realtime updates.
 *
 * Requirements (DB):
 * - table public.course_user_stats(course_id uuid, user_id uuid, total_solves int, first_solved_at timestamptz)
 * - rpc get_public_profiles(ids uuid[]) -> returns public profile fields
 *
 * Drop-in replacement for your previous ranklist; styling preserved.
 */

export default function CourseRanklist() {
  const router = useRouter();
  const { slug } = router.query;

  const [loading, setLoading] = useState(true);
  const [course, setCourse] = useState(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [pageData, setPageData] = useState([]); // rows for current page
  const [totalCount, setTotalCount] = useState(0);

  const [profilesMap, setProfilesMap] = useState(new Map());
  const [searchQuery, setSearchQuery] = useState("");
  const [countryFilter, setCountryFilter] = useState("all");
  const [institutionFilter, setInstitutionFilter] = useState("all");

  const [loadingPage, setLoadingPage] = useState(false);
  const [pollingEnabled, setPollingEnabled] = useState(false); // not needed if realtime working

  const POLL_INTERVAL_MS = 30 * 1000;

  // Helper: fetch public profiles via RPC
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

  function chooseName(prof, userId) {
    // kept for backwards compatibility in CSV export etc.
    if (prof?.display_name && !/^user\s*\d+$/i.test(prof.display_name) && prof.display_name.trim()) return prof.display_name;
    if (prof?.full_name && prof.full_name.trim()) return prof.full_name;
    if (prof?.username && prof.username.trim()) return prof.username;
    const idSource = userId || (prof && prof.id) || "";
    return `User ${String(idSource).slice(0, 6)}`;
  }

  // Fetch course by slug and ensure it exists
  useEffect(() => {
    if (!slug) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const { data: courses, error } = await supabase
          .from("courses")
          .select("id, slug, title")
          .eq("slug", slug)
          .limit(1);

        if (error) throw error;
        const c = courses?.[0] ?? null;
        if (!c) {
          if (mounted) {
            setCourse(null);
            setPageData([]);
            setTotalCount(0);
            setLoading(false);
          }
          return;
        }
        if (mounted) setCourse(c);
      } catch (err) {
        console.error("failed to load course", err);
        if (mounted) setCourse(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [slug]);

  // Core: fetch a page from course_user_stats with filters
  const fetchPage = useCallback(async (opts = {}) => {
    if (!course?.id) return;
    const { page = 1, pageSize = 20, search = "", country = "all", institution = "all", signal } = opts;
    setLoadingPage(true);
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let q = supabase
        .from("course_user_stats")
        .select("user_id, total_solves, first_solved_at", { count: "exact" })
        .eq("course_id", course.id)
        .order("total_solves", { ascending: false })
        .order("first_solved_at", { ascending: true })
        .range(from, to);

      // server-side search only on profile fields if your course_user_stats doesn't include display_name, this will not filter.
      // We will always fetch the page then filter client-side by search if needed.
      const { data, error, count } = await q;

      if (error) {
        // If query fails (missing table/permissions), fallback: set empty
        console.warn("course_user_stats query error:", error);
        setPageData([]);
        setTotalCount(0);
        setLoadingPage(false);
        return;
      }

      if (signal?.aborted) { setLoadingPage(false); return; }

      const rows = data || [];
      setTotalCount(Number(count || 0));
      setPageData(rows);

      // fetch profiles for these users
      const ids = rows.map(r => r.user_id).filter(Boolean);
      if (ids.length > 0) {
        const map = await fetchProfilesMap(ids);
        setProfilesMap((prev) => {
          const merged = new Map(prev);
          for (const [k, v] of map) merged.set(k, v);
          return merged;
        });
      }
    } catch (err) {
      console.error("fetchPage unexpected:", err);
    } finally {
      setLoadingPage(false);
    }
  }, [course?.id]);

  // load first page when course is set or filters change
  useEffect(() => {
    if (!course) return;
    setPage(1);
    fetchPage({ page: 1, pageSize, search: searchQuery, country: countryFilter, institution: institutionFilter });
  }, [course, pageSize, searchQuery, countryFilter, institutionFilter, fetchPage]);

  // Polling fallback (not required if realtime subscriptions work)
  useEffect(() => {
    if (!course || !pollingEnabled) return;
    const id = setInterval(() => {
      fetchPage({ page, pageSize, search: searchQuery, country: countryFilter, institution: institutionFilter });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [course, pollingEnabled, page, pageSize, searchQuery, countryFilter, institutionFilter, fetchPage]);

  // Re-fetch page on page change
  useEffect(() => {
    if (!course) return;
    fetchPage({ page, pageSize, search: searchQuery, country: countryFilter, institution: institutionFilter });
  }, [page, pageSize, course, searchQuery, countryFilter, institutionFilter, fetchPage]);

  // Realtime subscription: listen for changes on course_user_stats and profiles
  useEffect(() => {
    if (!course) return;
    let channel;
    const subs = [];

    // Handler simply refetches current page for authoritative data
    const handleAggChange = async (payload) => {
      // payload contains event and record; we re-fetch the current page for correctness
      try {
        await fetchPage({ page, pageSize, search: searchQuery, country: countryFilter, institution: institutionFilter });
      } catch (e) {
        console.warn("handleAggChange error", e);
      }
    };

    // Profile changes: if affected user is visible, refresh that user's profile
    const handleProfileChange = async (payload) => {
      const uid = (payload?.new && payload.new.id) || (payload?.record && payload.record.id) || payload?.old?.id || null;
      if (!uid) return;
      // If this user appears in current pageData, refresh their profile
      const visibleIds = (pageData || []).map(r => r.user_id);
      if (!visibleIds.includes(uid)) return;
      try {
        const map = await fetchProfilesMap([uid]);
        setProfilesMap((prev) => {
          const merged = new Map(prev);
          for (const [k, v] of map) merged.set(k, v);
          return merged;
        });
      } catch (err) {
        console.warn("profile refresh error", err);
      }
    };

    // Supabase v2 channel API (preferred)
    try {
      if (typeof supabase.channel === "function") {
        channel = supabase.channel(`course_user_stats_${course.id}`);

        channel
          .on("postgres_changes", { event: "*", schema: "public", table: "course_user_stats", filter: `course_id=eq.${course.id}` }, (payload) =>
            handleAggChange(payload)
          )
          .subscribe();

        channel
          .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, (payload) =>
            handleProfileChange(payload)
          )
          .subscribe();
      }
    } catch (err) {
      console.warn("channel v2 subscribe failed:", err);
    }

    // legacy API fallback
    try {
      if (!channel && supabase.from && typeof supabase.from === "function" && typeof supabase.from("course_user_stats").on === "function") {
        const s1 = supabase.from(`course_user_stats:course_id=eq.${course.id}`).on("*", payload => handleAggChange(payload)).subscribe();
        const s2 = supabase.from("profiles").on("*", payload => handleProfileChange(payload)).subscribe();
        subs.push(s1, s2);
      }
    } catch (err) {
      console.warn("legacy subscribe failed:", err);
    }

    return () => {
      try {
        if (channel && channel.unsubscribe) {
          try { supabase.removeChannel(channel); } catch (e) { /* best effort */ }
        }
      } catch (e) { /* ignore */ }

      if (subs.length) {
        subs.forEach(s => {
          try { s.unsubscribe && s.unsubscribe(); } catch (e) { /* ignore */ }
        });
      }
    };
  }, [course, page, pageSize, pageData, searchQuery, countryFilter, institutionFilter, fetchPage]);

  // derive dropdown options from profilesMap
  const availableCountries = useMemo(() => {
    const s = new Set();
    for (const [, p] of profilesMap) if (p?.country) s.add(p.country);
    return ["all", ...Array.from(s).sort()];
  }, [profilesMap]);

  const availableInstitutions = useMemo(() => {
    const s = new Set();
    for (const [, p] of profilesMap) if (p?.institution) s.add(p.institution);
    return ["all", ...Array.from(s).sort()];
  }, [profilesMap]);

  // Export CSV
  function exportCSV() {
    const rows = (pageData || []).map((r) => {
      const prof = profilesMap.get(r.user_id) || {};
      return {
        rank: "-", // rank not stored in aggregate table; we could compute relative to page & total
        user_id: r.user_id || "",
        name: chooseName(prof, r.user_id),
        institution: prof.institution || "—",
        country: prof.country || "—",
        solved: r.total_solves ?? 0,
        first_solved_at: r.first_solved_at ?? "—",
      };
    });

    const header = ["user_id","name","institution","country","solved","first_solved_at"];
    const csv = [header.join(","), ...rows.map(row => header.map(h => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug || "course"}-ranklist-page-${page}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (loading) return (
    <div className="page-wrap"><div className="center">Loading ranklist…</div></div>
  );
  if (!course) return (
    <div className="page-wrap"><div className="center">Course not found</div></div>
  );

  const displayed = pageData || [];
  const pagesCount = Math.max(1, Math.ceil((totalCount || 0) / pageSize));

  return (
    <div className="page-wrap">
      <Head><title>Ranklist — {course.title}</title></Head>

      <main className="container">
        <div className="top">
          <div className="title">
            <h1>{course.title}</h1>
          </div>

          <div className="actions" style={{ gap: 12, alignItems: "center" }}>
            <Link href={`/enroll?course=${encodeURIComponent(slug || "")}`} className="btn btn-cyan" aria-label="Back to course">Back to course</Link>
          </div>
        </div>

        {/* Controls */}
        <section style={{ marginBottom: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="search"
              placeholder="Search name..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.08)" }}
            />
            <select value={countryFilter} onChange={(e) => { setCountryFilter(e.target.value); setPage(1); }} style={{ padding: "8px", borderRadius: 8 }}>
              {availableCountries.map((c) => <option key={c} value={c}>{c === "all" ? "All countries" : c}</option>)}
            </select>

            <select value={institutionFilter} onChange={(e) => { setInstitutionFilter(e.target.value); setPage(1); }} style={{ padding: "8px", borderRadius: 8 }}>
              {availableInstitutions.map((ins) => <option key={ins} value={ins}>{ins === "all" ? "All institutions" : ins}</option>)}
            </select>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ fontSize: 13, color: "var(--muted-2)" }}>
              Showing <strong>{totalCount ?? 0}</strong> participants
            </div>

            <label style={{ fontSize: 13, color: "var(--muted-2)", display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 13 }}>Per page</span>
              <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} style={{ padding: "6px", borderRadius: 8 }}>
                {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>

            <button className="btn" onClick={() => setPollingEnabled(p => !p)} title="Toggle live polling">
              {pollingEnabled ? "Polling: On" : "Polling: Off"}
            </button>

            <button className="btn btn-cyan" onClick={exportCSV} title="Export current page as CSV">Export CSV</button>
          </div>
        </section>

        {/* List */}
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
            {displayed.length === 0 ? (
              <div className="empty">{loadingPage ? "Loading…" : "No participants match your filters."}</div>
            ) : (
              displayed.map((u, idx) => {
                const uid = u.user_id ?? u.id;
                const prof = profilesMap.get(uid) || {};
                const rank = (page - 1) * pageSize + idx + 1;
                const solved = u.total_solves ?? u.total ?? 0;
                const first = u.first_solved_at ?? u.firstSolvedAt ?? u.first_solved_at ?? null;

                // client-side filtering for search / country / institution (search only on display_name per your request)
                const displayNameLower = (prof.display_name || "").toLowerCase();
                if (searchQuery && !displayNameLower.includes(searchQuery.toLowerCase())) return null;
                if (countryFilter !== "all" && (prof.country || "—") !== countryFilter) return null;
                if (institutionFilter !== "all" && (prof.institution || "—") !== institutionFilter) return null;

                // prepare display name split (first letter + rest). No extra space between spans.
                const raw = (prof.display_name && prof.display_name.trim()) ? prof.display_name.trim() : "—";
                const firstChar = raw.charAt(0) || "";
                const restChars = raw.slice(1) || "";
                const avatarUrl = prof.avatar_url || "";
                const avatarLetter = (firstChar && firstChar !== "—") ? firstChar.toUpperCase() : "?";

                return (
                  <div key={`${uid}-${rank}`} className={`row ${rank <= 3 ? "top-three" : ""}`}>
                    <div className="rank-col">
                      {rank <= 3 ? (
                        <span className={`medal m${rank}`}>{rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉"}</span>
                      ) : (
                        <span className="rank-num">{rank}</span>
                      )}
                    </div>

                    <div className="name-col">
                      {/* Name: top-10 => first letter black + rest red; others => cyan text.
                          ONLY show display_name (no username, no fallbacks) as requested. */}
                      <div className="name-wrap">
                        <div className="avatar" aria-hidden="true">
                          {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{avatarLetter}</span>}
                        </div>
                        <div className="name-text">
                          {rank <= 10 ? (
                            <div style={{ fontWeight: 800, display: "inline-block", lineHeight: 1 }}>
                              <span style={{ color: "#000000", fontWeight: 800 }}>{firstChar}</span>
                              <span style={{ color: "#ef4444", fontWeight: 800 }}>{restChars}</span>
                            </div>
                          ) : (
                            <div className="name-bold" style={{ color: "#06b6d4" }}>{raw}</div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="inst-col">{prof.institution || "—"}</div>
                    <div className="country-col">{prof.country || "—"}</div>

                    <div className="solved-col">
                      <span className="solved-badge">{solved}</span>
                    </div>

                    <div className="first-col">{first ? new Date(first).toLocaleString() : "—"}</div>
                  </div>
                );
              })
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px" }}>
            <div style={{ color: "var(--muted-2)" }}>Page {page} of {pagesCount}</div>

            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" onClick={() => setPage(1)} disabled={page <= 1}>« First</button>
              <button className="btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>‹ Prev</button>
              <button className="btn" onClick={() => setPage(p => Math.min(pagesCount, p + 1))} disabled={page >= pagesCount}>Next ›</button>
              <button className="btn" onClick={() => setPage(pagesCount)} disabled={page >= pagesCount}>Last »</button>
            </div>
          </div>

          <div className="footer-note">
            <small>
              Ranking prioritizes users with more solves. Tie-break: earlier first solve ranks higher.
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
          position: relative;
          display:flex;
          align-items:center;
          justify-content:flex-end;
          gap: 18px;
          margin-bottom: 18px;
          min-height: 40px;
        }
        .title {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          text-align: center;
          width: 100%;
          max-width: 70%;
          pointer-events: none;
          z-index: 1;
        }

        .title h1 {
          color: #111;
          margin: 0;
          font-size: 24px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          background: rgba(255,255,255,0.92);
          border: 1px solid rgba(0,0,0,0.06);
          padding: 8px 16px;
          border-radius: 999px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.15);
          display: inline-block;
        }
        .muted { color: var(--muted-2); margin:4px 0 0; font-size: 13px; }

        .actions { display:flex; gap:10px; align-items:center; margin-left: auto; position: relative; z-index: 2; }

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

        .btn[disabled] { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }

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
          position: sticky;
          top: 8px;            /* sticky header */
          background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));
          z-index: 2;
        }

        .list-body { display:flex; flex-direction:column; }

        .row {
          display:grid;
          grid-template-columns: 60px 2fr 1.4fr 1fr 100px 160px;
          gap:12px;
          align-items:center;
          padding:12px;
          transition: background 180ms ease, transform 120ms ease;
          border: 1px solid rgba(0,0,0,0.6);
          border-radius: 10px;
          background: #fff;
        }
        .row:hover {
          background: rgba(0,210,255,0.04);
          transform: translateY(-4px);
          box-shadow: 0 14px 40px rgba(0,0,0,0.15);
          color: #000;
        }

        .row + .row { border-top: none; }

        .rank-num {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 34px;
          height: 34px;
          border-radius: 999px;
          font-weight: 800;
          color: #00131a;
          background: rgba(0, 210, 255, 0.18);
          border: 1px solid rgba(0, 210, 255, 0.35);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.35);
        }
        .name-bold {
          color: #22d3ee;        /* cyan-400 */
          font-weight: 800;
          letter-spacing: 0.2px;
        }
        .name-wrap {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .name-text { display: flex; align-items: center; }
        .avatar {
          width: 35px;
          height: 35px;
          border-radius: 50%;
          background: linear-gradient(90deg, rgba(0,210,255,0.12), rgba(255,255,255,0.04));
          border: 1px solid rgba(0,210,255,0.2);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #e6f7ff;
          font-weight: 800;
          font-size: 12px;
          overflow: hidden;
          flex: 0 0 auto;
        }
        .avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
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
