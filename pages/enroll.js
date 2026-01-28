// pages/enroll.js
import { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";

export default function EnrollPage() {
  const router = useRouter();
  const { course: courseQuery } = router.query;

  const defaultSlug = "cp-foundations";
  const slug = typeof courseQuery === "string" && courseQuery.length ? courseQuery : defaultSlug;

  const [loading, setLoading] = useState(true);
  const [course, setCourse] = useState(null);
  const [problems, setProblems] = useState([]);
  const [enrolled, setEnrolled] = useState(false);
  const [ranklist, setRanklist] = useState([]); // top 10 or fallback
  const [status, setStatus] = useState({}); // { [problem_id]: 'attempted'|'solved' }
  const [solutionUnlocked, setSolutionUnlocked] = useState({}); // { [problem_id]: true }
  const [solvedCounts, setSolvedCounts] = useState({}); // { [problem_id]: number }
  const [attemptCounts, setAttemptCounts] = useState({}); // { [problem_id]: number }

  // modal state for "Mark solved"
  const [markModal, setMarkModal] = useState({ open: false, problem: null });

  // Helper: batch fetch profiles map
  async function fetchProfilesMap(userIds) {
    if (!Array.isArray(userIds) || userIds.length === 0) return new Map();
    const unique = Array.from(new Set(userIds)).slice(0, 2000);

    try {
      const { data: profiles, error } = await supabase.rpc('get_public_profiles', { ids: unique });
      if (error) {
        console.warn('get_public_profiles rpc error', error);
        return new Map();
      }
      const map = new Map();
      for (const p of profiles || []) map.set(p.id, p);
      return map;
    } catch (err) {
      console.error('fetchProfilesMap rpc error', err);
      return new Map();
    }
  }

  // Helper: choose best display name
  function chooseName(prof, userId) {
    if (prof?.display_name && !/^user\s*\d+$/i.test(prof.display_name) && prof.display_name.trim()) return prof.display_name;
    if (prof?.full_name && prof.full_name.trim()) return prof.full_name;
    if (prof?.username && prof.username.trim()) return prof.username;
    const idSource = userId || (prof && prof.id) || '';
    return `User ${String(idSource).slice(0, 6)}`;
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        // load course
        const { data: courses } = await supabase
          .from("courses")
          .select("id, slug, title, description")
          .eq("slug", slug)
          .limit(1);

        const c = courses?.[0] ?? null;
        if (!c) {
          if (mounted) {
            setCourse(null);
            setProblems([]);
            setEnrolled(false);
            setRanklist([]);
            setLoading(false);
          }
          return;
        }
        if (mounted) setCourse(c);

        // load course_problems
        const { data: cpRows, error: cpErr } = await supabase
          .from("course_problems")
          .select("ordinal, problems(*)")
          .eq("course_id", c.id)
          .order("ordinal", { ascending: true });

        if (cpErr) {
          console.error("failed to fetch course_problems:", cpErr);
          if (mounted) setProblems([]);
        } else {
          // build problems array (preserve ordinal field from course_problems)
          const probsRaw = (cpRows || []).map((r) => ({ ordinal: r.ordinal, ...(r.problems || {}) }));

          // sort by difficulty: easy -> medium -> hard, then by ordinal as tiebreaker
          const difficultyOrder = { easy: 0, medium: 1, hard: 2 };
          probsRaw.sort((a, b) => {
            const da = difficultyOrder[(a.difficulty || "").toLowerCase()] ?? 99;
            const db = difficultyOrder[(b.difficulty || "").toLowerCase()] ?? 99;
            if (da !== db) return da - db;
            // fallback: keep original ordinal order (ascending)
            const oa = Number.isFinite(a.ordinal) ? a.ordinal : 0;
            const ob = Number.isFinite(b.ordinal) ? b.ordinal : 0;
            return oa - ob;
          });

          const probs = probsRaw;

          if (mounted) {
            setProblems(probs);

            // seed attemptCounts from problems table (optional)
            const acSeed = {};
            probs.forEach((p) => {
              acSeed[p.id] = Number(p.attempt_count ?? 0);
            });
            setAttemptCounts(acSeed);
          }

          // compute solvedCounts (from solves table) and attemptCounts (from attempts table if exists)
          try {
            const problemIds = probs.map(p => p.id).filter(Boolean);
            if (problemIds.length > 0) {
              const [{ data: solvesForCounts, error: solvesCountErr }, { data: attemptsForCounts, error: attemptsCountErr }] = await Promise.all([
                supabase.from("solves").select("problem_id").in("problem_id", problemIds),
                supabase.from("attempts").select("problem_id").in("problem_id", problemIds),
              ]);

              // solvedCounts
              if (!solvesCountErr && Array.isArray(solvesForCounts)) {
                const sc = {};
                for (const id of problemIds) sc[id] = 0;
                for (const s of solvesForCounts) sc[s.problem_id] = (sc[s.problem_id] || 0) + 1;
                if (mounted) setSolvedCounts(sc);
              } else {
                const sc = {};
                probs.forEach((p) => { sc[p.id] = Number(p.solved_count ?? 0); });
                if (mounted) setSolvedCounts(sc);
              }

              // attemptCounts
              if (!attemptsCountErr && Array.isArray(attemptsForCounts)) {
                const ac = {};
                for (const id of problemIds) ac[id] = 0;
                for (const a of attemptsForCounts) ac[a.problem_id] = (ac[a.problem_id] || 0) + 1;
                if (mounted) setAttemptCounts(ac);
              } else {
                // keep seeded attemptCounts (from problems table)
              }
            } else {
              if (mounted) {
                setSolvedCounts({});
                setAttemptCounts({});
              }
            }
          } catch (innerErr) {
            console.warn("Failed to compute counts from DB:", innerErr);
            const sc = {};
            probs.forEach((p) => { sc[p.id] = Number(p.solved_count ?? 0); });
            if (mounted) setSolvedCounts(sc);
          }

          // build ranklist (same as your existing logic)
          try {
            const problemIds = probs.map(p => p.id).filter(Boolean);
            let topList = [];

            if (problemIds.length > 0) {
              const { data: solves, error: solvesErr } = await supabase
                .from("solves")
                .select("user_id, solved_at, problem_id")
                .in("problem_id", problemIds)
                .order("solved_at", { ascending: true });

              if (!solvesErr && Array.isArray(solves) && solves.length > 0) {
                const m = new Map();
                for (const s of solves) {
                  const uid = s.user_id;
                  if (!m.has(uid)) {
                    m.set(uid, { user_id: uid, total: 0, firstSolvedAt: s.solved_at || null });
                  }
                  const ent = m.get(uid);
                  ent.total += 1;
                }

                const arr = Array.from(m.values()).sort((a, b) => {
                  if (b.total !== a.total) return b.total - a.total;
                  if (!a.firstSolvedAt) return 1;
                  if (!b.firstSolvedAt) return -1;
                  return new Date(a.firstSolvedAt) - new Date(b.firstSolvedAt);
                });

                const userIds = arr.map(x => x.user_id);
                const profMap = await fetchProfilesMap(userIds);

                topList = arr.map((u, i) => {
                  const prof = profMap.get(u.user_id) || {};
                  const display =
                    (prof.display_name && !/^user\s*\d+$/i.test(prof.display_name))
                      ? prof.display_name
                      : prof.full_name || prof.username || `User ${i + 1}`;

                  return {
                    pos: i + 1,
                    id: u.user_id,
                    name: display,
                    total: u.total,
                    institution: prof.institution || null,
                    country: prof.country || null,
                  };
                });
              }
            }

            if ((!topList || topList.length === 0)) {
              const { data: ranks, error: rankErr } = await supabase
                .from("enrollments")
                .select("user_id, enrolled_at")
                .eq("course_id", c.id)
                .order("enrolled_at", { ascending: true })
                .limit(100);

              if (!rankErr && Array.isArray(ranks)) {
                const userIds = (ranks || []).map(r => r.user_id);
                const profMap = await fetchProfilesMap(userIds);

                topList = (ranks || []).map((r, i) => {
                  const p = profMap.get(r.user_id) || {};
                  const display =
                    (p.display_name && !/^user\s*\d+$/i.test(p.display_name))
                      ? p.display_name
                      : p.full_name || p.username || `User ${i + 1}`;

                  return {
                    pos: i + 1,
                    id: r.user_id,
                    name: display,
                    total: 0,
                    institution: p.institution || null,
                    country: p.country || null,
                  };
                });
              }
            }

            if (mounted) setRanklist(topList.slice(0, 10));
          } catch (rankErr) {
            console.warn("ranklist build error", rankErr);
          }
        }

        // set enrolled flag for current user
        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user ?? null;
        if (user) {
          const { data: enrollRows } = await supabase
            .from("enrollments")
            .select("id")
            .eq("course_id", c.id)
            .eq("user_id", user.id)
            .limit(1);

          if (mounted) setEnrolled((enrollRows || []).length > 0);
        } else {
          if (mounted) setEnrolled(false);
        }

        // --- load current user's solves and attempts to set status (so state persists after reload) ---
        try {
          const { data: userData2 } = await supabase.auth.getUser();
          const currentUser = userData2?.user ?? null;
          if (currentUser) {
            const problemIds = (cpRows || []).map((r) => r.problems?.id).filter(Boolean);
            if (problemIds.length > 0) {
              // fetch solves
              const { data: mySolves, error: mySolvesErr } = await supabase
                .from("solves")
                .select("problem_id, solved_at")
                .eq("user_id", currentUser.id)
                .in("problem_id", problemIds);

              if (!mySolvesErr && Array.isArray(mySolves)) {
                setStatus((s) => {
                  const out = { ...s };
                  mySolves.forEach((ms) => {
                    out[ms.problem_id] = "solved";
                  });
                  return out;
                });
              }

              // fetch attempts (so attempted state persists)
              const { data: myAttempts, error: myAttemptsErr } = await supabase
                .from("attempts")
                .select("problem_id")
                .eq("user_id", currentUser.id)
                .in("problem_id", problemIds);

              if (!myAttemptsErr && Array.isArray(myAttempts)) {
                setStatus((s) => {
                  const out = { ...s };
                  myAttempts.forEach((a) => {
                    // only set attempted if not already solved
                    if (out[a.problem_id] !== "solved") out[a.problem_id] = "attempted";
                  });
                  return out;
                });
              }
            }
          }
        } catch (e) {
          console.warn("failed to fetch user's solves/attempts", e);
        }

      } catch (err) {
        console.error("load course failed", err);
        if (mounted) {
          setCourse(null);
          setProblems([]);
          setRanklist([]);
          setEnrolled(false);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [slug]);

  async function handleEnroll() {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) {
        window.location.href = "/login";
        return;
      }

      if (!course?.id) return alert("Course not loaded");

      const { error } = await supabase.from("enrollments").insert([
        { user_id: user.id, course_id: course.id }
      ]);

      if (error) {
        if (error.code === "23505") {
          setEnrolled(true);
          return alert("Already enrolled");
        }
        console.error("enroll error", error);
        return alert("Enroll failed: " + error.message);
      }

      setEnrolled(true);
      alert("Enrolled successfully");
      router.replace(router.asPath);
    } catch (err) {
      console.error("handleEnroll error", err);
      alert("Unexpected error");
    }
  }

  // Attempt a problem: persist attempt (requires login) then update UI
  async function handleAttempt(problem) {
    if (!problem || !problem.id) return;

    // require login to persist attempt permanently
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) {
      // redirect to login so the attempt is recorded when they return
      window.location.href = "/login";
      return;
    }

    // try to insert attempt (PRIMARY KEY prevents double counting)
    const payloadAttempt = {
      user_id: user.id,
      problem_id: problem.id,
      attempted_at: new Date().toISOString(),
    };

    try {
      const { data: inserted, error } = await supabase
        .from("attempts")
        .insert([payloadAttempt]);

      // If insert succeeded (inserted array exists), increment local attempt count.
      // If error is duplicate (23505) we don't increment (already counted).
      let isNewAttempt = false;
      if (!error) {
        isNewAttempt = true;
      } else {
        // duplicate key: ignore - attempt already existed
        if (error.code && String(error.code) === "23505") {
          isNewAttempt = false;
        } else {
          console.warn("Failed to persist attempt:", error);
        }
      }

      // optimistic UI update based on DB result
      if (isNewAttempt) {
        setAttemptCounts((ac) => ({ ...ac, [problem.id]: (ac[problem.id] || 0) + 1 }));
      }

      setStatus((s) => {
        if (s[problem.id] === "solved") return s;
        return { ...s, [problem.id]: "attempted" };
      });

      if (problem.link) window.open(problem.link, "_blank");
    } catch (err) {
      console.warn("Error persisting attempt:", err);
      // still set attempted locally so user sees immediate result (non-persistent)
      setStatus((s) => ({ ...s, [problem.id]: "attempted" }));
      if (problem.link) window.open(problem.link, "_blank");
    }

    // start unlock timer (demo 20s). Change to 20*60*1000 for 20 minutes.
    setTimeout(() => {
      setSolutionUnlocked((u) => ({ ...u, [problem.id]: true }));
    }, 20000);
  }

  // open confirmation modal for marking solved
  function handleMarkSolvedClick(problem) {
    setMarkModal({ open: true, problem });
  }

  // when confirming mark solved: ensure attempt exists first, then insert solve
  async function handleConfirmMarkSolved() {
    const p = markModal.problem;
    if (!p) return setMarkModal({ open: false, problem: null });

    try {
      // require login
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) {
        setMarkModal({ open: false, problem: null });
        window.location.href = "/login";
        return;
      }

      // 1) ensure there is an attempts row (insert; ignore duplicate)
      try {
        const attemptPayload = {
          user_id: user.id,
          problem_id: p.id,
          attempted_at: new Date().toISOString(),
        };
        const { error: attemptErr } = await supabase.from("attempts").insert([attemptPayload]);
        // if attemptErr and duplicate, ignore; otherwise log
        if (attemptErr && String(attemptErr.code) !== "23505") {
          console.warn("attempt insert warning:", attemptErr);
        } else if (!attemptErr) {
          // increment local attemptCounts if inserted
          setAttemptCounts((ac) => ({ ...ac, [p.id]: (ac[p.id] || 0) + 1 }));
        }
      } catch (ae) {
        console.warn("error inserting attempt before solve:", ae);
      }

      // 2) insert solve (unique (user_id, problem_id) -> ignore duplicate)
      const payload = {
        user_id: user.id,
        problem_id: p.id,
        solved_at: new Date().toISOString(),
      };

      const { error: insertErr } = await supabase.from("solves").insert([payload]);

      if (insertErr) {
        if (!(insertErr.code && String(insertErr.code) === "23505")) {
          console.error("failed to insert solve:", insertErr);
          alert("Failed to mark solved: " + (insertErr.message || JSON.stringify(insertErr)));
          setMarkModal({ open: false, problem: null });
          return;
        }
        // duplicate -> already solved; nothing to do
      } else {
        // inserted successfully: increment solvedCounts locally
        setSolvedCounts((sc) => ({ ...sc, [p.id]: (sc[p.id] || 0) + 1 }));
      }

      // optimistic UI: mark solved locally
      setStatus((s) => ({ ...s, [p.id]: "solved" }));

      setMarkModal({ open: false, problem: null });

      // refresh route to ensure ranklist & counts reflect server state
      router.replace(router.asPath);
    } catch (err) {
      console.error("handleConfirmMarkSolved unexpected", err);
      alert("Unexpected error while marking solved");
      setMarkModal({ open: false, problem: null });
    }
  }

  function handleCancelMarkSolved() {
    setMarkModal({ open: false, problem: null });
  }

  if (loading) {
    return (
      <>
        <Head><title>Enroll — Loading</title></Head>
        <div className="p-6">Loading course…</div>
      </>
    );
  }

  if (!course) {
    return (
      <>
        <Head><title>Enroll — Not found</title></Head>
        <main className="min-h-screen p-6">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold mb-2">Course not found</h1>
            <p>No course found for slug <strong>{slug}</strong>.</p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Enroll — {course.title}</title>
      </Head>

      <main className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200 p-6">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-4 gap-6">

          {/* LEFT: PROBLEMS LIST */}
          <div className="lg:col-span-3 bg-white/80 backdrop-blur rounded-2xl shadow-xl p-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold mb-1">{course.title}</h1>
                <p className="text-slate-600 mb-3">{course.description || ""}</p>
              </div>
              <div>
                {enrolled ? (
                  <span className="inline-block px-3 py-1 rounded bg-emerald-100 text-emerald-700 font-medium">Enrolled</span>
                ) : (
                  <button onClick={handleEnroll} className="btn btn-cyan">Enroll</button>
                )}
              </div>
            </div>

            <p className="text-slate-600 mb-6">
              SeriousOJ problems can be integrated to auto-mark in future. For now, other judges redirect to original site.
            </p>

            <div className="space-y-4">
              {problems.length === 0 ? (
                <div className="p-4 bg-slate-50 rounded">No problems yet in this course.</div>
              ) : (
                <>
                  {/* Header row */}
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-center bg-transparent p-2 px-4">
                    <div className="md:col-span-2">
                      <div className="text-sm text-slate-500 font-medium">Problem</div>
                    </div>

                    <div className="text-sm text-slate-500 text-center">
                      <span className="font-semibold">
                        <span className="text-emerald-600">Solved</span>
                        {" / "}
                        <span className="text-amber-700">Attempted</span>
                      </span>
                    </div>

                    <div className="flex justify-center">
                      <div className="text-sm text-slate-500 font-medium">Difficulty</div>
                    </div>

                    <div className="text-sm text-slate-500 font-semibold">Status</div>

                    <div className="text-sm text-slate-500 text-right font-semibold">Solution</div>
                  </div>

                  {/* Problems */}
                  {problems.map((p) => (
                    <div
                      key={p.id}
                      className="grid grid-cols-1 md:grid-cols-6 gap-4 items-center bg-slate-50 rounded-xl p-4"
                    >
                      <div className="md:col-span-2">
                        <div className="font-semibold">{p.title}</div>
                        <div className="text-sm text-slate-500">{p.platform}</div>
                      </div>

                      {/* solved/attempted */}
                      <div className="text-sm text-slate-700 text-center">
                        <div className="font-medium">
                          <span className="text-emerald-600 font-semibold">{solvedCounts[p.id] ?? 0}</span>
                          <span className="mx-2 text-slate-400">/</span>
                          <span className="text-amber-700 font-semibold">{attemptCounts[p.id] ?? 0}</span>
                        </div>
                      </div>

                      <div className="flex justify-center">
                        <DifficultyBadge level={p.difficulty || "easy"} />
                      </div>

                      <div className="flex items-center gap-3">
                        {status[p.id] === "solved" ? (
                          <span className="text-emerald-600 font-medium">Solved ✓</span>
                        ) : status[p.id] === "attempted" ? (
                          <button
                            onClick={() => handleMarkSolvedClick(p)}
                            className="inline-block px-4 py-1.5 rounded-lg bg-amber-100 text-amber-700 font-medium hover:opacity-90 transition"
                          >
                            Attempted
                          </button>
                        ) : (
                          <button
                            onClick={() => handleAttempt(p)}
                            className="px-4 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition"
                          >
                            Attempt
                          </button>
                        )}
                      </div>

                      <div className="flex justify-end">
                        {solutionUnlocked[p.id] ? (
                          <button className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-sm font-medium">View Solution</button>
                        ) : (
                          <span className="text-slate-400 text-sm font-medium flex items-center gap-1">🔒 Locked</span>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* RIGHT: Ranklist */}
          <div className="bg-white/80 backdrop-blur rounded-2xl shadow-xl p-6">
            <h2 className="text-xl font-bold mb-4">🏆 Ranklist (Top 10)</h2>

            <div className="space-y-3">
              {ranklist.length === 0 ? (
                <div className="text-slate-500">No users yet.</div>
              ) : (
                ranklist.map((u, i) => (
                  <div key={u.id + "-" + i} className="flex justify-between items-center bg-slate-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{i + 1}.</span>
                      <span className="font-semibold" style={{ color: "#06b6d4" }}>{u.name}</span>
                    </div>
                    <span className="font-medium text-slate-700">{u.total ?? 0}</span>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={() => router.push(`/courses/${encodeURIComponent(course.slug)}/ranklist`)}
              className="mt-4 text-teal-600 font-medium hover:underline"
            >
              View all →
            </button>
          </div>
        </div>

        {/* Mark solved modal */}
        {markModal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={handleCancelMarkSolved} />
            <div className="relative z-10 bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-2">Mark as solved?</h3>
              <p className="text-sm text-slate-600 mb-4">Are you sure you want to mark "{markModal.problem?.title}" as solved? This will increment the solved count.</p>
              <div className="flex justify-end gap-3">
                <button onClick={handleCancelMarkSolved} className="px-4 py-2 rounded-lg border">Cancel</button>
                <button onClick={handleConfirmMarkSolved} className="px-4 py-2 rounded-lg bg-emerald-600 text-white">Yes, mark solved</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

function DifficultyBadge({ level }) {
  const map = {
    easy: "bg-emerald-100 text-emerald-700",
    medium: "bg-amber-100 text-amber-700",
    hard: "bg-rose-100 text-rose-700",
  };
  const cls = map[level] || map["easy"];
  return (
    <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${cls}`}>{level}</span>
  );
}