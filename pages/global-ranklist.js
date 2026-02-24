import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function GlobalRanklist() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]); // [{ user_id, total, firstSolvedAt }]
  const [profilesMap, setProfilesMap] = useState(new Map());
  const [searchQuery, setSearchQuery] = useState("");
  const [countryFilter, setCountryFilter] = useState("all");
  const [institutionFilter, setInstitutionFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loadingProfiles, setLoadingProfiles] = useState(false);

  async function fetchProfilesMap(userIds) {
    if (!Array.isArray(userIds) || userIds.length === 0) return new Map();
    const unique = Array.from(new Set(userIds)).filter(Boolean);
    const batchSize = 2000;
    const map = new Map();
    for (let i = 0; i < unique.length; i += batchSize) {
      const chunk = unique.slice(i, i + batchSize);
      try {
        const { data, error } = await supabase.rpc("get_public_profiles", { ids: chunk });
        if (error) {
          console.warn("get_public_profiles rpc error", error);
          continue;
        }
        (data || []).forEach((p) => {
          if (p?.id) map.set(p.id, p);
        });
      } catch (err) {
        console.warn("get_public_profiles rpc error", err);
      }
    }
    return map;
  }

  function chooseName(prof, userId) {
    if (prof?.display_name && prof.display_name.trim()) return prof.display_name.trim();
    if (prof?.full_name && prof.full_name.trim()) return prof.full_name.trim();
    if (prof?.username && prof.username.trim()) return prof.username.trim();
    const idSource = userId || (prof && prof.id) || "";
    return `User ${String(idSource).slice(0, 6)}`;
  }

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        let aggregated = [];

        // Primary: course_user_stats (smaller data)
        const { data: stats, error: statsErr } = await supabase
          .from("course_user_stats")
          .select("user_id, total_solves, first_solved_at");

        if (!statsErr && Array.isArray(stats) && stats.length > 0) {
          const map = new Map();
          for (const r of stats) {
            if (!r?.user_id) continue;
            const prev = map.get(r.user_id) || {
              user_id: r.user_id,
              total: 0,
              firstSolvedAt: null,
            };
            prev.total += Number(r.total_solves || 0);
            const ts = r.first_solved_at ? new Date(r.first_solved_at).getTime() : null;
            if (ts && (!prev.firstSolvedAt || ts < new Date(prev.firstSolvedAt).getTime())) {
              prev.firstSolvedAt = r.first_solved_at;
            }
            map.set(r.user_id, prev);
          }
          aggregated = Array.from(map.values());
        } else {
          // Fallback: solves table
          const { data: solves, error: solvesErr } = await supabase
            .from("solves")
            .select("user_id, solved_at");
          if (!solvesErr && Array.isArray(solves) && solves.length > 0) {
            const map = new Map();
            for (const s of solves) {
              if (!s?.user_id) continue;
              const prev = map.get(s.user_id) || {
                user_id: s.user_id,
                total: 0,
                firstSolvedAt: null,
              };
              prev.total += 1;
              const ts = s.solved_at ? new Date(s.solved_at).getTime() : null;
              if (ts && (!prev.firstSolvedAt || ts < new Date(prev.firstSolvedAt).getTime())) {
                prev.firstSolvedAt = s.solved_at;
              }
              map.set(s.user_id, prev);
            }
            aggregated = Array.from(map.values());
          }
        }

        aggregated.sort((a, b) => {
          if ((b.total || 0) !== (a.total || 0)) return (b.total || 0) - (a.total || 0);
          const at = a.firstSolvedAt ? new Date(a.firstSolvedAt).getTime() : Number.MAX_SAFE_INTEGER;
          const bt = b.firstSolvedAt ? new Date(b.firstSolvedAt).getTime() : Number.MAX_SAFE_INTEGER;
          return at - bt;
        });

        if (active) {
          setRows(aggregated);
          setPage(1);
        }

        if (active) setLoadingProfiles(true);
        const ids = aggregated.map((r) => r.user_id);
        const map = await fetchProfilesMap(ids);
        if (active) setProfilesMap(map);
      } catch (err) {
        console.error("global ranklist load failed", err);
        if (active) setRows([]);
      } finally {
        if (active) {
          setLoading(false);
          setLoadingProfiles(false);
        }
      }
    })();

    return () => { active = false; };
  }, []);

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

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return (rows || []).filter((r) => {
      const prof = profilesMap.get(r.user_id) || {};
      const name = (prof.display_name || prof.username || "").toLowerCase();
      if (q && !name.includes(q)) return false;
      if (countryFilter !== "all" && (prof.country || "—") !== countryFilter) return false;
      if (institutionFilter !== "all" && (prof.institution || "—") !== institutionFilter) return false;
      return true;
    });
  }, [rows, profilesMap, searchQuery, countryFilter, institutionFilter]);

  const pagesCount = Math.max(1, Math.ceil((filtered.length || 0) / pageSize));
  const pageStart = (page - 1) * pageSize;
  const displayed = filtered.slice(pageStart, pageStart + pageSize);

  return (
    <div className="page-wrap">
      <Head><title>Global Ranklist</title></Head>

      <main className="container">
        <div className="top">
          <div className="title">
            <h1>Global Ranklist</h1>
          </div>

          <div className="actions" style={{ gap: 12, alignItems: "center" }}>
            <Link href="/" className="btn btn-cyan" aria-label="Back to home">Back to home</Link>
          </div>
        </div>

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
              Showing <strong>{filtered.length}</strong> users
            </div>

            <label style={{ fontSize: 13, color: "var(--muted-2)", display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 13 }}>Per page</span>
              <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} style={{ padding: "6px", borderRadius: 8 }}>
                {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
        </section>

        <section className="content-card">
          <div className="list-header">
            <div className="rank-col">#</div>
            <div className="name-col">Name</div>
            <div className="inst-col">Institution</div>
            <div className="country-col">Country</div>
            <div className="solved-col">Solved</div>
            <div className="role-col">Role</div>
          </div>

          <div className="list-body">
            {loading ? (
              <div className="empty">Loading…</div>
            ) : displayed.length === 0 ? (
              <div className="empty">{loadingProfiles ? "Loading…" : "No users match your filters."}</div>
            ) : (
              displayed.map((u, idx) => {
                const prof = profilesMap.get(u.user_id) || {};
                const rank = pageStart + idx + 1;
                const solved = u.total ?? 0;
                const role = (prof.role || "user");
                const roleClass = String(role).toLowerCase().replace(/[^a-z0-9_]/g, "");

                const raw = chooseName(prof, u.user_id);
                const firstChar = raw.charAt(0) || "";
                const restChars = raw.slice(1) || "";
                const avatarUrl = prof.avatar_url || "";
                const avatarLetter = (firstChar && firstChar !== "—") ? firstChar.toUpperCase() : "?";
                const institution = prof.institution && String(prof.institution).trim() ? prof.institution : "Not set";
                const country = prof.country && String(prof.country).trim() ? prof.country : "Not set";

                return (
                  <div key={`${u.user_id}-${rank}`} className={`row ${rank <= 3 ? "top-three" : ""}`}>
                    <div className="rank-col">
                      {rank <= 3 ? (
                        <span className={`medal m${rank}`}>{rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉"}</span>
                      ) : (
                        <span className="rank-num">{rank}</span>
                      )}
                    </div>

                    <div className="name-col">
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

                    <div className="inst-col">{institution}</div>
                    <div className="country-col">{country}</div>

                    <div className="solved-col">
                      <span className="solved-badge">{solved}</span>
                    </div>

                    <div className="role-col">
                      <span className={`role-badge role-${roleClass}`}>{String(role).toLowerCase()}</span>
                    </div>
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

        .actions { display:flex; gap:10px; align-items:center; margin-left: auto; position: relative; z-index: 2; }

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

        .content-card {
          background: var(--card-bg);
          border-radius: 12px;
          padding: 10px;
          border: 1px solid rgba(255,255,255,0.04);
          box-shadow: 0 8px 30px rgba(0,0,0,0.6);
        }

        .list-header {
          display:grid;
          grid-template-columns: 60px 2fr 1.4fr 1fr 100px 110px;
          gap: 12px;
          padding:10px;
          color: var(--muted-2);
          font-weight:700;
          align-items:center;
          border-bottom: 1px solid rgba(255,255,255,0.03);
          position: sticky;
          top: 8px;
          background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));
          z-index: 2;
        }

        .list-body { display:flex; flex-direction:column; }

        .row {
          display:grid;
          grid-template-columns: 60px 2fr 1.4fr 1fr 100px 110px;
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
          color: #22d3ee;
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
        .avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }

        .solved-badge {
          display:inline-block;
          min-width:40px;
          padding:6px 8px;
          border-radius:8px;
          background: rgba(0,0,0,0.06);
          font-weight:800;
          color: #064e3b;
          text-align:center;
        }

        .top-three { background: linear-gradient(90deg, rgba(0,210,255,0.05), rgba(255,255,255,0.02)); }
        .medal { font-size:18px; display:inline-block; padding:6px; border-radius:8px; }
        .m1 { background: linear-gradient(90deg,#ffedd5,#fff7ed); }
        .m2 { background: linear-gradient(90deg,#eef2ff,#f5f3ff); }
        .m3 { background: linear-gradient(90deg,#fef2f2,#fff1f2); }

        .empty { padding:20px; color: var(--muted-2); text-align:center; }
        .footer-note { margin-top:10px; color: var(--muted-2); font-size:13px; text-align:center; padding:8px; }

        .role-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.3px;
          text-transform: capitalize;
          border: 1px solid transparent;
          background: #eef2ff;
          border-color: #c7d2fe;
          color: #1e293b;
        }

        .role-super_admin {
          background: #fef3c7;
          border-color: #f59e0b;
          color: #92400e;
        }
        .role-admin {
          background: #dbeafe;
          border-color: #60a5fa;
          color: #1d4ed8;
        }
        .role-moderator {
          background: #dcfce7;
          border-color: #34d399;
          color: #047857;
        }
        .role-premium {
          background: #cffafe;
          border-color: #22d3ee;
          color: #0e7490;
        }
        .role-user {
          background: #f1f5f9;
          border-color: #cbd5e1;
          color: #334155;
        }

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
