// pages/enroll.js
import { useEffect, useState, useRef } from "react";
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
  const [unlockAtMap, setUnlockAtMap] = useState({}); // { [problem_id]: timestamp_ms }
  const [nowTick, setNowTick] = useState(Date.now());
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [sessionUser, setSessionUser] = useState(null);
  const [knownUsers, setKnownUsers] = useState([]);
  const [localUserId, setLocalUserId] = useState(null);
  const [solvedCounts, setSolvedCounts] = useState({}); // { [problem_id]: number }
  const [attemptCounts, setAttemptCounts] = useState({}); // { [problem_id]: number }
  const [voteCounts, setVoteCounts] = useState({}); // { [problem_id]: { like:number, dislike:number } }
  const [myVotes, setMyVotes] = useState({}); // { [problem_id]: 'like'|'dislike' }
  const [voteBusy, setVoteBusy] = useState({}); // { [problem_id]: boolean }

  // NEW: difficulty filter state ('all'|'easy'|'medium'|'hard')
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [hideSolved, setHideSolved] = useState(false);
  const [randomPickActive, setRandomPickActive] = useState(false);
  const [randomPickId, setRandomPickId] = useState(null);
  const [theme, setTheme] = useState("light");

  // modal state for "Mark solved"
  const [markModal, setMarkModal] = useState({ open: false, problem: null });

  // NEW: modal to show solution content (supports video + text)
  const [solutionModal, setSolutionModal] = useState({
    open: false,
    problem: null,
    video: null,   // string | null
    text: null,    // string | null
    loading: false,
    showingText: false, // toggle to display text content inside modal
  });

  // timers ref to clear on unmount
  const timersRef = useRef({}); // { [problemId]: timeoutId }

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

  async function fetchProblemVotes(problemIds, userId) {
    if (!Array.isArray(problemIds) || problemIds.length === 0) {
      setVoteCounts({});
      setMyVotes({});
      return;
    }
    const baseCounts = {};
    problemIds.forEach((pid) => {
      baseCounts[pid] = { like: 0, dislike: 0 };
    });

    try {
      const { data, error } = await supabase
        .from("problem_votes")
        .select("problem_id, user_id, vote")
        .in("problem_id", problemIds);

      if (error) {
        console.warn("problem_votes fetch error", error);
        setVoteCounts(baseCounts);
        setMyVotes({});
        return;
      }

      const counts = { ...baseCounts };
      const mine = {};
      (data || []).forEach((row) => {
        if (!row?.problem_id || !row?.vote) return;
        if (!counts[row.problem_id]) counts[row.problem_id] = { like: 0, dislike: 0 };
        if (row.vote === "like") counts[row.problem_id].like += 1;
        if (row.vote === "dislike") counts[row.problem_id].dislike += 1;
        if (userId && row.user_id === userId) mine[row.problem_id] = row.vote;
      });

      setVoteCounts(counts);
      setMyVotes(mine);
    } catch (err) {
      console.warn("problem_votes fetch error", err);
      setVoteCounts(baseCounts);
      setMyVotes({});
    }
  }

  // helper: persist unlocked IDs to localStorage per current user
  function saveUnlockedToLocal(userId, unlockedMap) {
    try {
      if (!userId) return;
      saveKnownUser(userId);
      const key = `so_unlocked_${userId}`;
      const arr = Object.keys(unlockedMap || {}).filter((k) => unlockedMap[k]);
      localStorage.setItem(key, JSON.stringify(arr));
    } catch (e) {
      // ignore
    }
  }

  function loadUnlockedFromLocal(userId) {
    try {
      if (!userId) return [];
      const key = `so_unlocked_${userId}`;
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch (e) {
      return [];
    }
  }

  function saveAttemptedToLocal(userId, attemptedIds) {
    try {
      if (!userId) return;
      saveKnownUser(userId);
      const key = `so_attempted_${userId}`;
      localStorage.setItem(key, JSON.stringify(attemptedIds || []));
    } catch (e) {
      // ignore
    }
  }

  function saveEnrolledToLocal(userId, courseId) {
    try {
      if (!userId || !courseId) return;
      saveKnownUser(userId);
      const key = `so_enrolled_${userId}`;
      const raw = localStorage.getItem(key);
      const arr = raw ? JSON.parse(raw) : [];
      const set = new Set(Array.isArray(arr) ? arr : []);
      set.add(courseId);
      localStorage.setItem(key, JSON.stringify(Array.from(set)));
    } catch (e) {
      // ignore
    }
  }

  function bumpEnrollCountDeltaLocal(courseId) {
    try {
      if (!courseId) return;
      const key = `so_enroll_delta_${courseId}`;
      const cur = Number(localStorage.getItem(key));
      const next = (Number.isFinite(cur) ? cur : 0) + 1;
      localStorage.setItem(key, String(next));
    } catch (e) {
      // ignore
    }
  }

  function isEnrolledLocal(userId, courseId) {
    try {
      if (!userId || !courseId) return false;
      const key = `so_enrolled_${userId}`;
      const raw = localStorage.getItem(key);
      if (!raw) return false;
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.includes(courseId) : false;
    } catch (e) {
      return false;
    }
  }

  function loadAttemptedFromLocal(userId) {
    try {
      if (!userId) return [];
      const key = `so_attempted_${userId}`;
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function getLastUserId() {
    try {
      const v = localStorage.getItem("so_last_user");
      return v ? v : null;
    } catch (e) {
      return null;
    }
  }

  function loadKnownUsers() {
    try {
      const raw = localStorage.getItem("so_known_users");
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter((u) => u && u.id) : [];
    } catch (e) {
      return [];
    }
  }

  function saveKnownUser(userId, label) {
    try {
      if (!userId) return;
      const list = loadKnownUsers();
      const display = label || `User ${String(userId).slice(0, 6)}`;
      const idx = list.findIndex((u) => u.id === userId);
      if (idx >= 0) {
        list[idx] = { ...list[idx], label: list[idx].label || display };
      } else {
        list.push({ id: userId, label: display });
      }
      localStorage.setItem("so_known_users", JSON.stringify(list));
      localStorage.setItem("so_last_user", userId);
      setKnownUsers(list);
      setLocalUserId(userId);
    } catch (e) {
      // ignore
    }
  }

  function clearLocalDataForUser(userId) {
    try {
      if (!userId) return;
      localStorage.removeItem(`so_attempted_${userId}`);
      localStorage.removeItem(`so_unlocked_${userId}`);
      localStorage.removeItem(`so_unlock_at_${userId}`);
      const list = loadKnownUsers().filter((u) => u.id !== userId);
      localStorage.setItem("so_known_users", JSON.stringify(list));
      const nextId = list[0]?.id || null;
      localStorage.setItem("so_last_user", nextId || "");
      setKnownUsers(list);
      setLocalUserId(nextId);
    } catch (e) {
      // ignore
    }
  }

  function setAttemptedForUser(userId, problemId, attempted) {
    try {
      if (!userId || !problemId) return;
      const current = new Set(loadAttemptedFromLocal(userId) || []);
      if (attempted) current.add(problemId);
      else current.delete(problemId);
      saveAttemptedToLocal(userId, Array.from(current));
    } catch (e) {
      // ignore
    }
  }

  function saveUnlockAtToLocal(userId, unlockMap) {
    try {
      if (!userId) return;
      const key = `so_unlock_at_${userId}`;
      localStorage.setItem(key, JSON.stringify(unlockMap || {}));
    } catch (e) {
      // ignore
    }
  }

  function loadUnlockAtFromLocal(userId) {
    try {
      if (!userId) return {};
      const key = `so_unlock_at_${userId}`;
      const raw = localStorage.getItem(key);
      if (!raw) return {};
      const obj = JSON.parse(raw);
      return obj && typeof obj === "object" ? obj : {};
    } catch (e) {
      return {};
    }
  }

  function loadUnlockAtFromLocalWithFallback(userId) {
    const fallback = userId || localUserId || getLastUserId();
    if (!fallback) return {};
    return loadUnlockAtFromLocal(fallback);
  }

  function loadAttemptedFromLocalWithFallback(userId) {
    const fallback = userId || localUserId || getLastUserId();
    if (!fallback) return [];
    return loadAttemptedFromLocal(fallback);
  }

  function setUnlockAtForUser(userId, problemId, unlockAtMs) {
    setUnlockAtMap((m) => {
      const next = { ...(m || {}), [problemId]: unlockAtMs };
      saveKnownUser(userId);
      saveUnlockAtToLocal(userId, next);
      return next;
    });
  }

  function clearUnlockAtForUser(userId, problemId) {
    setUnlockAtMap((m) => {
      const next = { ...(m || {}) };
      delete next[problemId];
      saveUnlockAtToLocal(userId, next);
      return next;
    });
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
          const problemById = {};
          probs.forEach((p) => { if (p?.id) problemById[p.id] = p; });

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
                supabase.from("attempts").select().in("problem_id", problemIds), // select all to detect unlocked_at if present
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

              // attemptCounts and also detect unlocked_at on attempts (if column exists)
              if (!attemptsCountErr && Array.isArray(attemptsForCounts)) {
                const ac = {};
                const initialUnlocked = {};
                for (const id of problemIds) ac[id] = 0;
                for (const a of attemptsForCounts) {
                  ac[a.problem_id] = (ac[a.problem_id] || 0) + 1;
                  // if DB has unlocked_at we honor it
                  if (a.unlocked_at) {
                    initialUnlocked[a.problem_id] = true;
                  }
                }
                if (mounted) {
                  setAttemptCounts(ac);
                  // merge DB unlocked into state (will be merged with localStorage below)
                  setSolutionUnlocked((s) => ({ ...s, ...initialUnlocked }));
                }
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
          setSessionUser(user);
          saveKnownUser(user.id, user.email || user.id);
          const { data: enrollRows } = await supabase
            .from("enrollments")
            .select("id")
            .eq("course_id", c.id)
            .eq("user_id", user.id)
            .limit(1);

          if (mounted) {
            const dbEnrolled = (enrollRows || []).length > 0;
            const localEnrolled = isEnrolledLocal(user.id, c.id);
            setEnrolled(dbEnrolled || localEnrolled);
          }

          // merge localStorage unlocks (persisted per-user)
          const storedUnlocked = loadUnlockedFromLocal(user.id) || [];
          if (storedUnlocked.length > 0 && mounted) {
            setSolutionUnlocked((s) => {
              const out = { ...s };
              storedUnlocked.forEach((pid) => { out[pid] = true; });
              return out;
            });
          }
          if (c?.id) saveEnrolledToLocal(user.id, c.id);
        } else {
          setSessionUser(null);
          const fallbackUserId = localUserId || getLastUserId();
          if (fallbackUserId && mounted) {
            const storedUnlocked = loadUnlockedFromLocal(fallbackUserId) || [];
            if (storedUnlocked.length > 0) {
              setSolutionUnlocked((s) => {
                const out = { ...s };
                storedUnlocked.forEach((pid) => { out[pid] = true; });
                return out;
              });
            }
          }
          if (mounted) {
            const fallbackUserId = localUserId || getLastUserId();
            const localEnrolled = fallbackUserId ? isEnrolledLocal(fallbackUserId, c.id) : false;
            setEnrolled(localEnrolled);
          }
        }

        // --- load current user's solves and attempts to set status (so state persists after reload) ---
        try {
          const { data: userData2 } = await supabase.auth.getUser();
          const currentUser = userData2?.user ?? null;
          const fallbackUserId = currentUser?.id || localUserId || getLastUserId();
          if (fallbackUserId) {
            const problemIds = (cpRows || []).map((r) => r.problems?.id).filter(Boolean);
            if (problemIds.length > 0) {
              const unlockedSet = new Set();
              const localUnlockAt = loadUnlockAtFromLocalWithFallback(currentUser?.id || null);
              const localAttempted = loadAttemptedFromLocalWithFallback(currentUser?.id || null);
              const unlockTargets = {};
              Object.entries(localUnlockAt || {}).forEach(([pid, ts]) => {
                if (!problemById[pid]) return;
                const n = Number(ts);
                if (Number.isFinite(n)) unlockTargets[pid] = n;
              });
              // fetch solves
              const { data: mySolves, error: mySolvesErr } = currentUser ? await supabase
                .from("solves")
                .select("problem_id, solved_at")
                .eq("user_id", currentUser.id)
                .in("problem_id", problemIds) : { data: null, error: null };

              if (!mySolvesErr && Array.isArray(mySolves)) {
                setStatus((s) => {
                  const out = { ...s };
                  mySolves.forEach((ms) => {
                    out[ms.problem_id] = "solved";
                  });
                  return out;
                });

                // Mark solved problem solutions unlocked for current user
                if (mySolves.length > 0) {
                  const solvedUnlocked = {};
                  mySolves.forEach((ms) => {
                    solvedUnlocked[ms.problem_id] = true;
                    unlockedSet.add(ms.problem_id);
                  });
                  setSolutionUnlocked((s) => ({ ...s, ...solvedUnlocked }));

                  // persist to localStorage for this user
                  if (currentUser?.id) saveUnlockedToLocal(currentUser.id, { ...(solutionUnlocked || {}), ...solvedUnlocked });
                }
              }

              // fetch attempts (so attempted state persists) and detect unlocked_at
              const { data: myAttempts, error: myAttemptsErr } = currentUser ? await supabase
                .from("attempts")
                .select()
                .eq("user_id", currentUser.id)
                .in("problem_id", problemIds) : { data: null, error: null };

              if (!myAttemptsErr && Array.isArray(myAttempts)) {
                setStatus((s) => {
                  const out = { ...s };
                  myAttempts.forEach((a) => {
                    // only set attempted if not already solved
                    if (out[a.problem_id] !== "solved") out[a.problem_id] = "attempted";
                    // if the attempts row has unlocked_at (schema), mark unlocked
                    if (a.unlocked_at) {
                      unlockedSet.add(a.problem_id);
                      setSolutionUnlocked((u) => ({ ...u, [a.problem_id]: true }));
                      // persist to localStorage as well
                      if (currentUser?.id) saveUnlockedToLocal(currentUser.id, { ...(solutionUnlocked || {}), [a.problem_id]: true });
                    }
                  });
                  return out;
                });

                // compute unlock countdown targets from attempts
                myAttempts.forEach((a) => {
                  if (a.unlocked_at) return;
                  const p = problemById[a.problem_id];
                  if (!p) return;
                  const attemptedAt = a.attempted_at ? new Date(a.attempted_at).getTime() : null;
                  if (!attemptedAt) return;
                  unlockTargets[a.problem_id] = attemptedAt + getUnlockDelayMs(p);
                });
              }

              // fallback: use locally stored attempted list if DB attempts are missing
              if (Array.isArray(localAttempted) && localAttempted.length > 0) {
                setStatus((s) => {
                  const out = { ...s };
                  localAttempted.forEach((pid) => {
                    if (out[pid] !== "solved") out[pid] = "attempted";
                  });
                  return out;
                });
              }

              // remove countdowns for unlocked problems
              unlockedSet.forEach((pid) => { delete unlockTargets[pid]; });

              setUnlockAtMap((m) => {
                const next = { ...(m || {}) };
                // reset for current course problem ids
                problemIds.forEach((id) => { delete next[id]; });
                Object.entries(unlockTargets).forEach(([pid, ts]) => { next[pid] = ts; });
                if (currentUser?.id) saveUnlockAtToLocal(currentUser.id, next);
                return next;
              });
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

  // cleanup timers on unmount
  useEffect(() => {
    return () => {
      const timers = timersRef.current || {};
      Object.values(timers).forEach((t) => clearTimeout(t));
      timersRef.current = {};
    };
  }, []);

  // ticking clock for countdown UI
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // load local known users for logged-out fallback
  useEffect(() => {
    const list = loadKnownUsers();
    setKnownUsers(list);
    const last = getLastUserId();
    if (last) setLocalUserId(last);
  }, []);

  // load/save theme preference
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("enrollTheme");
    if (saved === "dark" || saved === "light") setTheme(saved);
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("enrollTheme", theme);
  }, [theme]);

  // when logged out, allow switching local progress profile
  useEffect(() => {
    if (sessionUser) return;
    if (!localUserId) return;
    try { localStorage.setItem("so_last_user", localUserId); } catch (e) {}
    const storedUnlocked = loadUnlockedFromLocal(localUserId) || [];
    setSolutionUnlocked(() => {
      const out = {};
      storedUnlocked.forEach((pid) => { out[pid] = true; });
      return out;
    });
    const localAttempted = loadAttemptedFromLocal(localUserId) || [];
    setStatus(() => {
      const out = {};
      localAttempted.forEach((pid) => { out[pid] = "attempted"; });
      return out;
    });
    const localUnlockAt = loadUnlockAtFromLocal(localUserId) || {};
    const nextUnlockAt = {};
    (problems || []).forEach((p) => {
      if (p?.id && Number.isFinite(Number(localUnlockAt[p.id]))) {
        nextUnlockAt[p.id] = Number(localUnlockAt[p.id]);
      }
    });
    setUnlockAtMap(nextUnlockAt);
  }, [localUserId, sessionUser, problems]);

  // load like/dislike counts and current user's vote
  useEffect(() => {
    const ids = (problems || []).map((p) => p?.id).filter(Boolean);
    fetchProblemVotes(ids, sessionUser?.id || null);
  }, [problems, sessionUser?.id]);

  // sync client clock with server time (reduce client clock drift)
  useEffect(() => {
    let active = true;
    const sync = async () => {
      try {
        const resp = await fetch("/api/time");
        if (!resp.ok) return;
        const data = await resp.json();
        const serverTime = Number(data?.serverTime);
        if (!Number.isFinite(serverTime)) return;
        const offset = serverTime - Date.now();
        if (active) setServerOffsetMs(offset);
      } catch (e) {
        // ignore time sync errors
      }
    };
    sync();
    const id = setInterval(sync, 5 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  // If the picked problem becomes solved, re-pick from remaining unsolved
  useEffect(() => {
    if (!randomPickActive) return;
    if (!randomPickId) return;
    if (status[randomPickId] === "solved") {
      const unsolved = (problems || []).filter((p) => p?.id && status[p.id] !== "solved");
      if (unsolved.length === 0) {
        setRandomPickId(null);
        return;
      }
      const idx = Math.floor(Math.random() * unsolved.length);
      setRandomPickId(unsolved[idx].id);
    }
  }, [randomPickActive, randomPickId, status, problems]);

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
          if (course?.id) saveEnrolledToLocal(user.id, course.id);
          return alert("Already enrolled");
        }
        console.error("enroll error", error);
        return alert("Enroll failed: " + error.message);
      }

      setEnrolled(true);
      if (course?.id) {
        saveEnrolledToLocal(user.id, course.id);
        bumpEnrollCountDeltaLocal(course.id);
      }
      alert("Enrolled successfully");
      router.replace(router.asPath);
    } catch (err) {
      console.error("handleEnroll error", err);
      alert("Unexpected error");
    }
  }

  // helper: persist unlocked for a user (attempt to persist to DB but always write localStorage)
  async function persistUnlockForUser(user, problemId) {
    if (!user || !problemId) return;
    // 1) update local state + localStorage
    setSolutionUnlocked((u) => {
      const out = { ...u, [problemId]: true };
      try { saveUnlockedToLocal(user.id, out); } catch (e) {}
      return out;
    });
    clearUnlockAtForUser(user.id, problemId);

    // 2) try to persist to DB by upserting an attempts row with unlocked_at (schema dependent)
    try {
      const payload = {
        user_id: user.id,
        problem_id: problemId,
        attempted_at: new Date().toISOString(),
        unlocked_at: new Date().toISOString(),
      };
      // upsert by (user_id, problem_id) if that conflict key exists in your DB
      // Best-effort: if DB lacks unlocked_at, this may fail; we ignore errors.
      await supabase.from("attempts").upsert([payload], { onConflict: ["user_id", "problem_id"] });
    } catch (err) {
      // ignore schema errors (column missing) or other issues — we already persisted locally
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
        const next = { ...s, [problem.id]: "attempted" };
        setAttemptedForUser(user.id, problem.id, true);
        return next;
      });

      setUnlockAtForUser(user.id, problem.id, Date.now() + getUnlockDelayMs(problem));

      if (problem.link) window.open(problem.link, "_blank");
    } catch (err) {
      console.warn("Error persisting attempt:", err);
      // still set attempted locally so user sees immediate result (non-persistent)
      setStatus((s) => {
        const next = { ...s, [problem.id]: "attempted" };
        setAttemptedForUser(user.id, problem.id, true);
        return next;
      });
      setUnlockAtForUser(user.id, problem.id, Date.now() + getUnlockDelayMs(problem));
      if (problem.link) window.open(problem.link, "_blank");
    }

    // start unlock timer (difficulty-based). If user marks solved before this runs, we will unlock immediately and clear timer.
    const T = getUnlockDelayMs(problem);
    // clear existing timer for this problem (defensive)
    if (timersRef.current[problem.id]) {
      clearTimeout(timersRef.current[problem.id]);
      delete timersRef.current[problem.id];
    }

    timersRef.current[problem.id] = setTimeout(async () => {
      let curUserId = null;
      // mark unlocked permanently for this user
      try {
        const { data: ud } = await supabase.auth.getUser();
        const curUser = ud?.user ?? null;
        curUserId = curUser?.id || null;
        // persist unlock (DB attempt+localStorage) — it's OK if DB column missing
        await persistUnlockForUser(curUser, problem.id);
      } catch (e) {
        // still set local state
        const { data: ud } = await supabase.auth.getUser();
        const curUser = ud?.user ?? null;
        curUserId = curUser?.id || curUserId;
        if (curUser) persistUnlockForUser(curUser, problem.id);
      } finally {
        if (curUserId) clearUnlockAtForUser(curUserId, problem.id);
        // cleanup timer reference
        delete timersRef.current[problem.id];
      }
    }, T);
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
      setStatus((s) => {
        const next = { ...s, [p.id]: "solved" };
        if (user?.id) setAttemptedForUser(user.id, p.id, false);
        return next;
      });

      // If a pending unlock timer exists for this problem, clear it
      if (timersRef.current[p.id]) {
        clearTimeout(timersRef.current[p.id]);
        delete timersRef.current[p.id];
      }

      // Unlock solution immediately & persist for this user
      const { data: ud } = await supabase.auth.getUser();
      const curUser = ud?.user ?? null;
      await persistUnlockForUser(curUser, p.id);
      if (curUser?.id) clearUnlockAtForUser(curUser.id, p.id);

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

  function isUrl(value) {
    if (!value) return false;
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }

  function getUnlockDelayMs(problem) {
    const d = (problem?.difficulty || "").toLowerCase();
    if (d === "easy") return 15 * 60 * 1000;
    if (d === "medium") return 20 * 60 * 1000;
    if (d === "hard") return 30 * 60 * 1000;
    return 20 * 60 * 1000;
  }

  function getUnlockDelayLabel(problem) {
    const mins = Math.round(getUnlockDelayMs(problem) / 60000);
    return `${mins} min`;
  }

  function formatCountdown(ms) {
    if (ms <= 0) return "Unlocking…";
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function getUnlockCountdownText(problem) {
    const unlockAt = unlockAtMap[problem?.id];
    if (!unlockAt) return `Unlocks in ${getUnlockDelayLabel(problem)}`;
    const remaining = unlockAt - (nowTick + serverOffsetMs);
    return `Unlocks in ${formatCountdown(remaining)}`;
  }

  // NEW: View solution handler — requires solutionUnlocked[problem.id] === true
  async function handleViewSolution(problem) {
    if (!problem || !problem.id) return;

    if (!solutionUnlocked[problem.id]) {
      // encourage user to attempt first
      alert('Solution is locked. Please attempt the problem to unlock the solution (or mark it solved).');
      return;
    }

    // prepare modal, prefer explicit fields
    const localVideo = problem.video_solution ? String(problem.video_solution).trim() : null;
    const localText = problem.text_solution
      ? String(problem.text_solution).trim()
      : (problem.solution ? String(problem.solution).trim() : null);

    // If at least one solution available locally, show them; otherwise fetch row (defensive)
    if ((localVideo && String(localVideo).trim()) || (localText && String(localText).trim())) {
      setSolutionModal({
        open: true,
        problem,
        video: localVideo ? String(localVideo).trim() : null,
        text: localText ? String(localText).trim() : null,
        loading: false,
        showingText: false,
      });
      return;
    }

    // fetch full problem row safely (don't request specific columns to avoid schema cache errors)
    setSolutionModal({ open: true, problem, video: null, text: null, loading: true, showingText: false });
    try {
      const { data, error } = await supabase
        .from('problems')
        .select() // safe: gets all available columns
        .eq('id', problem.id)
        .single();

      if (error) {
        console.warn('failed to fetch problem row', error);
        setSolutionModal({ open: true, problem, video: null, text: null, loading: false, showingText: false });
        return;
      }

      const video = data.video_solution ? String(data.video_solution).trim() : null;
      const text = data.text_solution
        ? String(data.text_solution).trim()
        : (data.solution ? String(data.solution).trim() : null);

      setSolutionModal({ open: true, problem, video: video || null, text: text || null, loading: false, showingText: false });
    } catch (err) {
      console.error('error fetching solution', err);
      setSolutionModal({ open: true, problem, video: null, text: null, loading: false, showingText: false });
    }
  }

  // close solution modal
  function closeSolutionModal() {
    setSolutionModal({ open: false, problem: null, video: null, text: null, loading: false, showingText: false });
  }

  // helper: open video or generic link in new tab (safe)
  function openLink(url) {
    if (!url) {
      alert("No link available.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function handleVote(problemId, vote) {
    if (!problemId || (vote !== "like" && vote !== "dislike")) return;
    if (!sessionUser) {
      alert("Please log in to vote.");
      return;
    }
    if (myVotes[problemId]) {
      alert("You already voted on this problem.");
      return;
    }
    setVoteBusy((s) => ({ ...s, [problemId]: true }));
    try {
      const payload = {
        problem_id: problemId,
        user_id: sessionUser.id,
        vote,
      };
      const { error } = await supabase.from("problem_votes").insert([payload]);
      if (error) {
        if (String(error.code) === "23505") {
          alert("You already voted on this problem.");
          setMyVotes((m) => ({ ...m, [problemId]: vote }));
        } else {
          console.warn("vote insert error", error);
          alert("Unable to submit vote right now.");
        }
      } else {
        setMyVotes((m) => ({ ...m, [problemId]: vote }));
        setVoteCounts((c) => {
          const curr = c[problemId] || { like: 0, dislike: 0 };
          const next = {
            like: curr.like + (vote === "like" ? 1 : 0),
            dislike: curr.dislike + (vote === "dislike" ? 1 : 0),
          };
          return { ...c, [problemId]: next };
        });
      }
    } catch (err) {
      console.warn("vote insert error", err);
      alert("Unable to submit vote right now.");
    } finally {
      setVoteBusy((s) => ({ ...s, [problemId]: false }));
    }
  }

  // text button handler: open link if text is url, otherwise toggle showing text
  function handleTextButtonClick() {
    const text = solutionModal.text;
    if (!text) return;
    if (isUrl(text)) {
      openLink(text);
    } else {
      setSolutionModal((s) => ({ ...s, showingText: !s.showingText }));
    }
  }

  // toggle showing text inside modal (deprecated, replaced by handleTextButtonClick)
  function toggleShowText() {
    setSolutionModal((s) => ({ ...s, showingText: !s.showingText }));
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

  // apply difficulty filter when rendering
  const filteredProblemsBase = problems.filter((p) => {
    if (!p) return false;
    if (hideSolved && status[p?.id] === "solved") return false;
    const d = (p.difficulty || "").toLowerCase();
    if (difficultyFilter === "all") return true;
    return d === difficultyFilter;
  });
  const filteredProblems = randomPickActive
    ? filteredProblemsBase.filter((p) => p?.id === randomPickId)
    : filteredProblemsBase;

  const totalProblemCount = problems.length;
  const solvedProblemCount = problems.reduce((acc, p) => (status[p?.id] === "solved" ? acc + 1 : acc), 0);
  const remainingProblemCount = Math.max(0, totalProblemCount - solvedProblemCount);

  function pickRandomUnsolved() {
    const unsolved = (problems || []).filter((p) => {
      if (!p?.id) return false;
      if (status[p.id] === "solved") return false;
      if (difficultyFilter === "all") return true;
      return String(p.difficulty || "").toLowerCase() === difficultyFilter;
    });
    if (unsolved.length === 0) {
      setRandomPickActive(true);
      setRandomPickId(null);
      return;
    }
    const idx = Math.floor(Math.random() * unsolved.length);
    setRandomPickActive(true);
    setRandomPickId(unsolved[idx].id);
  }

  function clearRandomPick() {
    setRandomPickActive(false);
    setRandomPickId(null);
  }


  return (
    <>
      <Head>
        <title>Enroll — {course.title}</title>
      </Head>

      <main className={`min-h-screen p-6 ${theme === "dark" ? "enroll-theme-dark" : "enroll-theme-light"}`}>
        <div className="max-w-7xl mx-auto grid lg:grid-cols-4 gap-6">

          {/* LEFT: PROBLEMS LIST */}
          <div className="lg:col-span-3 problems-card" id="problems-list">
            <div className="flex items-start justify-between course-header">
              <div>
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400 mb-2">Course Overview</div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-1">{course.title}</h1>
                <p className="text-slate-500 mb-3">{course.description || ""}</p>
              </div>
              <div>
                <div className="flex items-center gap-2 justify-end">
                  {enrolled ? (
                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-sm">
                      <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                      Enrolled
                    </span>
                  ) : (
                    <button onClick={handleEnroll} className="btn btn-cyan">Enroll</button>
                  )}
                  <button
                    type="button"
                    className="theme-toggle ml-2"
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  >
                    {theme === "dark" ? "Light mode" : "Dark mode"}
                  </button>
                </div>
              </div>
            </div>

            {/* User progress summary */}
            <div className="mb-5 flex justify-center">
              <div className="w-full max-w-md grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-xl bg-slate-50/80 border border-slate-200 px-3 py-2 text-center shadow-sm progress-card">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Total</div>
                  <div className="text-base font-semibold text-slate-900">{totalProblemCount}</div>
                </div>
                <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2 text-center shadow-sm progress-card">
                  <div className="text-[11px] uppercase tracking-wide text-emerald-700">Solved</div>
                  <div className="text-base font-semibold text-emerald-700">{solvedProblemCount}</div>
                </div>
                <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-center shadow-sm progress-card">
                  <div className="text-[11px] uppercase tracking-wide text-amber-700">Remaining</div>
                  <div className="text-base font-semibold text-amber-700">{remainingProblemCount}</div>
                </div>
              </div>
            </div>

            {!sessionUser && knownUsers.length > 0 && (
              <div className="mb-4 p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-800">
                <div className="font-semibold text-sm mb-2">Local progress profile (logged out)</div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="px-3 py-1.5 rounded border border-amber-200 bg-white text-sm"
                    value={localUserId || ""}
                    onChange={(e) => setLocalUserId(e.target.value || null)}
                  >
                    <option value="">Select profile</option>
                    {knownUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.label || `User ${String(u.id).slice(0, 6)}`}</option>
                    ))}
                  </select>
                  <button
                    className="px-3 py-1.5 rounded border border-amber-300 bg-white text-sm"
                    onClick={() => {
                      if (!localUserId) return;
                      if (confirm("Clear local attempt data for this profile?")) {
                        clearLocalDataForUser(localUserId);
                      }
                    }}
                  >
                    Clear local data
                  </button>
                </div>
                <div className="text-xs mt-2 text-amber-700">
                  This controls which local countdowns are shown while logged out.
                </div>
              </div>
            )}



            {/* Difficulty filter UI */}
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 shadow-sm filter-bar">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Filter</span>
                <select
                  value={difficultyFilter}
                  onChange={(e) => setDifficultyFilter(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium shadow-sm"
                >
                  <option value="all">All</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
                <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-teal-600"
                    checked={hideSolved}
                    onChange={(e) => setHideSolved(e.target.checked)}
                  />
                  Hide solved
                </label>
                <button
                  type="button"
                  className="pick-random-btn px-4 py-2 rounded-lg bg-gradient-to-r from-teal-600 to-cyan-600 text-white text-sm font-semibold shadow-sm hover:opacity-95 transition"
                  onClick={pickRandomUnsolved}
                >
                  Pick random unsolved
                </button>
                {randomPickActive && (
                  <button
                    type="button"
                    className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium shadow-sm hover:bg-slate-50 transition"
                    onClick={clearRandomPick}
                  >
                    Clear random
                  </button>
                )}
              </div>
              <div className="ml-auto text-sm text-slate-500 showing-text">
                Showing <strong>{filteredProblems.length}</strong> of <strong>{problems.length}</strong>
              </div>
            </div>

            <div className="space-y-4">
              {filteredProblems.length === 0 ? (
                <div className="p-4 bg-slate-50 rounded">No problems yet in this course.</div>
              ) : (
                <>
                  {/* Header row */}
                  <div className="grid grid-cols-1 md:grid-cols-7 gap-4 items-center bg-transparent p-2 px-4 text-[11px] uppercase tracking-wide text-slate-400 problem-header">
                    <div className="md:col-span-2">
                      <div className="font-semibold">Problem</div>
                    </div>

                    <div className="text-center font-semibold">Solved / Attempted</div>

                    <div className="flex justify-center">
                      <div className="font-semibold">Difficulty</div>
                    </div>

                    <div className="font-semibold">Status</div>

                    <div className="text-center font-semibold">Like / Dislike</div>

                    <div className="text-right font-semibold">Solution</div>
                  </div>

                  {/* Problems */}
                  {filteredProblems.map((p) => {
                    const counts = voteCounts[p.id] || { like: 0, dislike: 0 };
                    const voted = myVotes[p.id];
                    const disabledVote = !sessionUser || !!voted || !!voteBusy[p.id];
                    const likeTitle = !sessionUser
                      ? "Log in to like."
                      : voted
                        ? "You already voted."
                        : "Like";
                    const dislikeTitle = !sessionUser
                      ? "Log in to dislike."
                      : voted
                        ? "You already voted."
                        : "Dislike";
                    return (
                      <div
                        key={p.id}
                        className="group grid grid-cols-1 md:grid-cols-7 gap-4 items-center bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition problem-row"
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
                          <div className="relative">
                            <span className="pointer-events-none absolute -top-2 left-1/2 z-10 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-slate-200 bg-slate-900/90 px-2 py-1 text-[11px] font-medium text-white shadow-sm group-hover:block">
                              Click here to mark as solved.
                            </span>
                            <button
                              onClick={() => handleMarkSolvedClick(p)}
                              className="inline-block px-4 py-1.5 rounded-lg bg-amber-100 text-amber-700 font-medium hover:opacity-90 transition"
                            >
                              Attempted
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleAttempt(p)}
                            className="px-4 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition"
                          >
                            Attempt
                          </button>
                        )}
                      </div>

                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          title={likeTitle}
                          onClick={() => handleVote(p.id, "like")}
                          disabled={disabledVote}
                          className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold transition ${
                            voted === "like"
                              ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          } ${disabledVote ? "cursor-not-allowed opacity-60" : ""}`}
                        >
                          <span aria-hidden="true">&#128077;</span>
                          <span>{counts.like}</span>
                        </button>
                        <button
                          type="button"
                          title={dislikeTitle}
                          onClick={() => handleVote(p.id, "dislike")}
                          disabled={disabledVote}
                          className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold transition ${
                            voted === "dislike"
                              ? "border-rose-500 bg-rose-50 text-rose-700"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          } ${disabledVote ? "cursor-not-allowed opacity-60" : ""}`}
                        >
                          <span aria-hidden="true">&#128078;</span>
                          <span>{counts.dislike}</span>
                        </button>
                      </div>

                      <div className="flex justify-end">
                        {solutionUnlocked[p.id] ? (
                          <button
                            onClick={() => handleViewSolution(p)}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-sm font-medium shadow-sm hover:opacity-90 transition"
                          >
                            View Solution
                          </button>
                        ) : (
                          <div className="text-right">
                            <div className="text-slate-400 text-sm font-medium flex items-center gap-1 justify-end">🔒 Locked</div>
                            {status[p.id] === "attempted" && (
                              <div className="text-xs text-slate-400 mt-1">
                                {getUnlockCountdownText(p)}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                </>
              )}
            </div>
          </div>

          {/* RIGHT: Ranklist */}
          <div className="ranklist-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-900">🏆 Ranklist (Top 10)</h2>
              <span className="text-xs uppercase tracking-wide text-slate-400">Live</span>
            </div>

            <div className="space-y-3">
              {ranklist.length === 0 ? (
                <div className="text-slate-500">No users yet.</div>
              ) : (
                ranklist.map((u, i) => {
                  // render first letter black and rest red (LGM style).
                  const raw = String(u.name || "").trim();
                  const first = raw.charAt(0) || "";
                  const rest = raw.slice(1) || "";
                  return (
                    <div key={u.id + "-" + i} className="flex justify-between items-center bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 shadow-sm ranklist-row">
                      <div className="flex items-center gap-2">
                        <span className="ranklist-num-badge">{i + 1}</span>

                        {/* display name: first letter black, rest red (no space between) */}
                        <span className="ranklist-name">
                          <span className="ranklist-name-first">{first}</span>
                          <span className="ranklist-name-rest">{rest}</span>
                        </span>
                      </div>
                      <span className="ranklist-total-badge">{u.total ?? 0}</span>
                    </div>
                  );
                })
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

        {/* Solution modal (video + text options) */}
        {solutionModal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={closeSolutionModal} />
            <div className="solution-modal relative z-10 bg-white rounded-lg shadow-xl p-6 w-full max-w-3xl max-h-[80vh] overflow-auto">
              <div className="flex justify-between items-start gap-4 mb-4">
                <div>
                  <h3 className="text-lg font-semibold">Solution — {solutionModal.problem?.title}</h3>
                  <div className="text-sm text-slate-500">{solutionModal.problem?.platform} • {solutionModal.problem?.difficulty}</div>
                </div>
                <div>
                  <button onClick={closeSolutionModal} className="px-3 py-1 rounded bg-slate-200 text-slate-900">Close</button>
                </div>
              </div>

              {solutionModal.loading ? (
                <div className="text-slate-600">Loading solution…</div>
              ) : (
                <div className="space-y-4">
                  <div className="flex gap-3">
                    {/* Video button */}
                    <button
                      onClick={() => openLink(solutionModal.video)}
                      disabled={!solutionModal.video}
                      title={solutionModal.video ? "Open video solution (external)" : "No video solution available"}
                      className={`px-4 py-2 rounded-lg font-medium inline-flex items-center gap-2 ${solutionModal.video ? 'bg-teal-600 text-white hover:opacity-95' : 'bg-slate-100 text-slate-400 opacity-50 pointer-events-none'}`}
                    >
                      <span>🎥</span>
                      <span>Video solution</span>
                    </button>

                    {/* Text button */}
                    <button
                      onClick={handleTextButtonClick}
                      disabled={!solutionModal.text}
                      title={solutionModal.text ? (isUrl(solutionModal.text) ? "Open text solution link (external)" : "Show text solution") : "No text solution available"}
                      className={`px-4 py-2 rounded-lg font-medium inline-flex items-center gap-2 ${solutionModal.text ? 'bg-amber-100 text-amber-800 hover:opacity-95' : 'bg-slate-100 text-slate-400 opacity-50 pointer-events-none'}`}
                    >
                      <span>📝</span>
                      <span>Text solution</span>
                    </button>
                  </div>

                  {/* If showing text, render it */}
                  {solutionModal.showingText && (
                    <div className="mt-2 p-4 bg-slate-50 rounded">
                      {solutionModal.text ? (
                        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: 1.5 }}>
{solutionModal.text}
                        </pre>
                      ) : (
                        <div className="text-slate-600">No text solution available.</div>
                      )}
                    </div>
                  )}

                  {/* If neither solution present */}
                  {!solutionModal.video && !solutionModal.text && (
                    <div className="text-slate-600">No solution available for this problem.</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
      <style jsx>{`
        .enroll-theme-light {
          background: linear-gradient(135deg, #f8fafc 0%, #ffffff 40%, #f1f5f9 100%);
          color: #1f2937;
        }
        .enroll-theme-dark {
          background: radial-gradient(1200px 800px at 10% 0%, rgba(56,189,248,0.08), transparent 60%),
                      radial-gradient(1200px 800px at 90% 0%, rgba(34,197,94,0.08), transparent 60%),
                      #0b1220;
          color: #e2e8f0;
        }
        .enroll-theme-dark .problems-card,
        .enroll-theme-dark .ranklist-card {
          background: rgba(15,23,42,0.92);
          border: 1px solid rgba(148,163,184,0.18);
          box-shadow: 0 18px 40px rgba(2,6,23,0.6);
        }
        .enroll-theme-light .problems-card,
        .enroll-theme-light .ranklist-card {
          background: rgba(255,255,255,0.92);
          border: 1px solid rgba(226,232,240,1);
          box-shadow: 0 18px 40px rgba(15,23,42,0.1);
          border-radius: 16px;
          padding: 24px;
        }
        .problems-card {
          border-radius: 16px;
          padding: 24px;
          backdrop-filter: blur(10px);
        }
        .ranklist-card {
          border-radius: 16px;
          padding: 24px;
          backdrop-filter: blur(10px);
        }
        .enroll-theme-dark .course-header h1,
        .enroll-theme-dark .course-header p,
        .enroll-theme-dark .course-header div {
          color: #e2e8f0;
        }
        .enroll-theme-dark .course-header .text-slate-500 {
          color: #94a3b8;
        }
        .enroll-theme-dark .progress-card {
          background: rgba(15,23,42,0.6) !important;
          border-color: rgba(148,163,184,0.2) !important;
        }
        .enroll-theme-dark .progress-card .text-slate-900 {
          color: #ffffff !important;
        }
        .enroll-theme-dark .progress-card .text-slate-500 {
          color: #94a3b8 !important;
        }
        .enroll-theme-dark .filter-bar {
          background: rgba(15,23,42,0.7) !important;
          border-color: rgba(148,163,184,0.2) !important;
        }
        .enroll-theme-dark .filter-bar select,
        .enroll-theme-dark .filter-bar button,
        .enroll-theme-dark .filter-bar label,
        .enroll-theme-dark .filter-bar span {
          color: #e2e8f0;
        }
        .enroll-theme-dark .filter-bar button {
          border-color: rgba(148,163,184,0.35);
          background: rgba(30,41,59,0.6);
        }
        .enroll-theme-dark .filter-bar .pick-random-btn {
          background: linear-gradient(90deg, #0f766e, #0891b2);
          border-color: transparent;
          color: #ffffff;
        }
        .enroll-theme-dark .filter-bar select {
          background: rgba(30,41,59,0.8);
          border-color: rgba(148,163,184,0.35);
        }
        .enroll-theme-dark .filter-bar option {
          color: #0f172a;
        }
        .enroll-theme-dark .problem-header {
          color: #94a3b8 !important;
        }
        .enroll-theme-dark .problem-row {
          background: rgba(15,23,42,0.7) !important;
          border-color: rgba(148,163,184,0.2) !important;
        }
        .enroll-theme-dark .problem-row:hover {
          background: rgba(30,41,59,0.8) !important;
        }
        .enroll-theme-dark .showing-text {
          color: #e2e8f0 !important;
        }
        .enroll-theme-dark .showing-text strong {
          color: #ffffff;
        }
        .enroll-theme-dark .ranklist-card,
        .enroll-theme-dark .ranklist-card h2,
        .enroll-theme-dark .ranklist-card span,
        .enroll-theme-dark .ranklist-card a {
          color: #e2e8f0;
        }
        .enroll-theme-dark .ranklist-card .text-slate-400 {
          color: #94a3b8 !important;
        }
        .enroll-theme-dark .ranklist-row {
          background: rgba(15,23,42,0.7) !important;
          border-color: rgba(148,163,184,0.25) !important;
        }
        .ranklist-num-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 26px;
          height: 26px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 800;
          background: rgba(0, 210, 255, 0.12);
          border: 1px solid rgba(0, 210, 255, 0.35);
          color: #0f172a;
        }
        .ranklist-name {
          font-weight: 800;
          display: inline-block;
          line-height: 1;
        }
        .ranklist-name-first { color: #0f172a; }
        .ranklist-name-rest { color: #ef4444; }
        .ranklist-total {
          font-weight: 700;
          color: #334155;
        }
        .ranklist-total-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 26px;
          height: 26px;
          padding: 0 8px;
          border-radius: 999px;
          background: rgba(16, 185, 129, 0.15);
          border: 1px solid rgba(16, 185, 129, 0.45);
          color: #065f46;
          font-weight: 800;
          font-size: 12px;
        }
        .enroll-theme-dark .ranklist-num-badge {
          background: rgba(0, 210, 255, 0.18);
          border-color: rgba(0, 210, 255, 0.35);
          color: #e2e8f0;
        }
        .enroll-theme-dark .ranklist-name {
          background: #ffffff;
          padding: 2px 6px;
          border-radius: 6px;
        }
        .enroll-theme-dark .ranklist-name-first { color: #000000 !important; }
        .enroll-theme-dark .ranklist-name-rest { color: #ef4444 !important; }
        .enroll-theme-dark .ranklist-total { color: #e2e8f0; }
        .enroll-theme-dark .ranklist-total-badge {
          background: rgba(16, 185, 129, 0.2);
          border-color: rgba(16, 185, 129, 0.5);
          color: #6ee7b7;
        }
        .enroll-theme-dark .solution-modal {
          background: #0f172a;
          color: #e2e8f0;
        }
        .enroll-theme-dark .solution-modal h3,
        .enroll-theme-dark .solution-modal .text-slate-500 {
          color: #cbd5f5 !important;
        }
        .enroll-theme-dark .solution-modal .bg-slate-50 {
          background: rgba(15,23,42,0.7) !important;
          color: #e2e8f0;
        }
        .enroll-theme-dark .solution-modal pre {
          color: #e2e8f0;
        }
        .theme-toggle {
          padding: 0.45rem 0.85rem;
          border-radius: 999px;
          border: 1px solid rgba(15,23,42,0.15);
          background: #fff;
          font-size: 0.8rem;
          font-weight: 600;
          box-shadow: 0 6px 18px rgba(15,23,42,0.08);
          transition: transform 160ms ease, box-shadow 160ms ease;
        }
        .theme-toggle:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 22px rgba(15,23,42,0.12);
        }
        .enroll-theme-dark .theme-toggle {
          background: rgba(30,41,59,0.8);
          border-color: rgba(148,163,184,0.3);
          color: #e2e8f0;
        }
      `}</style>
    </>
  );
}

function DifficultyBadge({ level }) {
  // normalize level and show capitalized label
  const norm = (level || "easy").toString().toLowerCase();
  const map = {
    easy: "bg-emerald-100 text-emerald-700",
    medium: "bg-amber-100 text-amber-700",
    hard: "bg-rose-100 text-rose-700",
  };
  const cls = map[norm] || map["easy"];
  const label = norm.charAt(0).toUpperCase() + norm.slice(1);
  return (
    <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${cls}`}>{label}</span>
  );
}
