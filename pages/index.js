// pages/index.js
import Head from 'next/head'
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const fallbackProjects = [
  { id: 'mentoro', title: 'Mentoro', desc: 'Interactive tutorial app for competitive programmers', tags: ['React Native', 'Firebase'] },
  { id: 'child-security', title: 'Child Security App', desc: 'Educational & safety features', tags: ['Kotlin', 'Firebase'] },
  { id: 'ahmed-classroom', title: "Ahmed's Classroom App", desc: 'Performance optimizations - reduced load times', tags: ['Flutter'] },
]

// Edit these values. Leave empty string '' when a link is not available.
const contacts = {
  email: 'rkamonasish@gmail.com',
  linkedin: 'https://www.linkedin.com/in/kamonasish-roy-rony',
  github: 'https://github.com/kamonasish123',
  youtube: 'https://www.youtube.com/@kamonasishroyrony',
  facebook: 'https://www.facebook.com/kamonasishroyrony',
  instagram: 'https://www.instagram.com/kamonasishr',
  // CV removed
}

/* --- Icons --- (unchanged) */
function IconMail({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 7.5L12 13L21 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )
}
function IconLinkedIn({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="3" width="20" height="18" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M7 10.5V17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="7" cy="7.5" r="1.25" fill="currentColor"/>
      <path d="M11.5 12.5V17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M11.5 9.5C13 9.5 14.5 10 14.5 12.5V17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}
function IconGitHub({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C8.13 2 5 5.13 5 9.02c0 3.86 2.44 5.66 4.75 6.22.35.06.48-.15.48-.34 0-.17-.01-.62-.01-1.22-1.94.42-2.35-.94-2.35-.94-.32-.82-.78-1.04-.78-1.04-.64-.44.05-.43.05-.43.71.05 1.08.73 1.08.73.63 1.08 1.66.77 2.07.59.06-.46.25-.77.45-.95-1.55-.18-3.18-.78-3.18-3.47 0-.77.27-1.4.72-1.9-.07-.18-.31-.9.07-1.88 0 0 .59-.19 1.93.72.56-.16 1.16-.24 1.76-.24.6 0 1.2.08 1.76.24 1.34-.91 1.93-.72 1.93-.72.38.98.14 1.7.07 1.88.45.5.72 1.13.72 1.9 0 2.7-1.63 3.29-3.18 3.47.26.22.49.66.49 1.33 0 .96-.01 1.73-.01 1.97 0 .19.13.41.49.34C16.56 14.68 19 12.88 19 9.02 19 5.13 15.87 2 12 2z" stroke="currentColor" strokeWidth="0.5" />
    </svg>
  )
}
function IconYouTube({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="6" width="20" height="12" rx="3" stroke="currentColor" strokeWidth="1.2" />
      <path d="M10 9.5L15.5 12L10 14.5V9.5Z" fill="currentColor" />
    </svg>
  )
}
function IconFacebook({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 8.5h1.8V5.8H15c-1.1 0-1.8.7-1.8 1.8V9.5H11v2.2h2.2V19h2.6v-7.3H17.8L18 9.5h-1.4V8.5z" fill="currentColor"/>
    </svg>
  )
}
function IconInstagram({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor"/>
    </svg>
  )
}

/* ---------- Helper: extract topics defensively ---------- */
function parseTopicsFromRow(row) {
  if (!row) return [];
  if (Array.isArray(row.topics) && row.topics.length) {
    return row.topics.slice(0, 10).map(String);
  }
  const textCandidates = [row.topics_text, row.topics_str, row.topicsList, row.topics_list, row.topicsText];
  for (const t of textCandidates) {
    if (typeof t === 'string' && t.trim()) {
      const parts = t.split(/\r?\n|[,;]+/).map(s => s.trim()).filter(Boolean);
      return parts.slice(0, 10);
    }
  }
  return [];
}

function normalizeTopic(t) {
  return String(t || "").trim().toLowerCase();
}

function loadLocalEnrolledIds(userId) {
  if (!userId) return new Set();
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(`so_enrolled_${userId}`);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveLocalEnrolledId(userId, courseId) {
  if (!userId || !courseId || typeof window === "undefined") return;
  try {
    const key = `so_enrolled_${userId}`;
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    const set = new Set(Array.isArray(arr) ? arr : []);
    set.add(courseId);
    localStorage.setItem(key, JSON.stringify(Array.from(set)));
    localStorage.setItem("so_last_user", userId);
  } catch {}
}

function applyEnrollCountDelta(courseId, baseCount) {
  if (typeof window === "undefined" || !courseId) return baseCount;
  try {
    const baseKey = `so_enroll_base_${courseId}`;
    const deltaKey = `so_enroll_delta_${courseId}`;
    const baseStored = Number(localStorage.getItem(baseKey));
    let delta = Number(localStorage.getItem(deltaKey));
    if (!Number.isFinite(delta)) delta = 0;
    const baseNum = Number.isFinite(baseCount) ? baseCount : 0;

    if (Number.isFinite(baseStored)) {
      if (baseNum > baseStored) {
        delta = 0;
        localStorage.setItem(deltaKey, "0");
        localStorage.setItem(baseKey, String(baseNum));
      } else if (baseNum < baseStored) {
        localStorage.setItem(baseKey, String(baseNum));
      }
    } else {
      localStorage.setItem(baseKey, String(baseNum));
    }

    return baseNum + delta;
  } catch {
    return baseCount;
  }
}

function bumpEnrollCountDelta(courseId) {
  if (typeof window === "undefined" || !courseId) return;
  try {
    const deltaKey = `so_enroll_delta_${courseId}`;
    const cur = Number(localStorage.getItem(deltaKey));
    const next = (Number.isFinite(cur) ? cur : 0) + 1;
    localStorage.setItem(deltaKey, String(next));
  } catch {}
}

async function fetchEnrollCounts(courseIds) {
  try {
    if (!Array.isArray(courseIds) || courseIds.length === 0) return {};
    const resp = await fetch("/api/course-counts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseIds }),
    });
    let data = null;
    try {
      data = await resp.json();
    } catch {}
    if (!resp.ok || !data || !data.ok) return null;
    return data.counts && typeof data.counts === "object" ? data.counts : {};
  } catch {
    return null;
  }
}

export default function Home() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);

  // auth + profile
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileStats, setProfileStats] = useState({
    totalCourses: 0,
    totalSolved: 0,
    globalRank: null,
    globalTotalUsers: 0,
  });
  const [profileStatsLoading, setProfileStatsLoading] = useState(false);

  // avatar upload & preview
  const [avatarPreview, setAvatarPreview] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // modal state
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editInstitution, setEditInstitution] = useState("");
  const [editCountry, setEditCountry] = useState("");

  // store cp-foundations course and its problem count + enrolled count
  const [cpCourse, setCpCourse] = useState(null);
  const [loadingCpCourse, setLoadingCpCourse] = useState(true);
  const [userEnrolledOnHome, setUserEnrolledOnHome] = useState(false);
  const [enrollActionLoading, setEnrollActionLoading] = useState(false);
  const [enrollingCourseId, setEnrollingCourseId] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // list of all courses to show on homepage (with counts & whether user enrolled)
  const [coursesList, setCoursesList] = useState([]);
  const [loadingCoursesList, setLoadingCoursesList] = useState(true);

  // blog posts (latest 3)
  const [homePosts, setHomePosts] = useState([]);
  const [homeCommentsCount, setHomeCommentsCount] = useState({});
  const [homeLikedByUser, setHomeLikedByUser] = useState({}); // map postId => true
  const [homeLikesLocal, setHomeLikesLocal] = useState({}); // map postId => likes number (local override)

  // featured projects (homepage)
  const [featuredProjects, setFeaturedProjects] = useState([]);
  const [featuredProjectsLoading, setFeaturedProjectsLoading] = useState(true);
  const [showAllProjects, setShowAllProjects] = useState(false);

  // Topic filtering & selection state
  const [uniqueTopics, setUniqueTopics] = useState([]); // ordered list of unique topics for filter chips
  const [selectedTopics, setSelectedTopics] = useState([]); // topics currently selected (order preserved)
  const [topicPickerValue, setTopicPickerValue] = useState(""); // select value for adding a topic
  const [showTopicControls, setShowTopicControls] = useState(false); // checkbox controls visibility
  const [topicInputValue, setTopicInputValue] = useState("");

  const CP_FALLBACK_TOPICS = ["Big-O & greedy", "Binary search", "Basic graphs"];

  // show limited cards on homepage
  const [showAllCourses, setShowAllCourses] = useState(false);

  // choose featured projects from DB; fallback to local list
  const projectsToRender = (featuredProjects && featuredProjects.length > 0)
    ? featuredProjects
    : fallbackProjects;
  const visibleProjects = showAllProjects ? projectsToRender : projectsToRender.slice(0, 3);
  const hasMoreProjects = projectsToRender.length > 3;

  // derive operator capability: admins and moderators (and super_admin) should see admin UI
  const isOperator = !!(profile && (["super_admin","admin","moderator"].includes((profile.role || "").toLowerCase()) || !!profile.is_admin));
  const roleLabel = (profile?.role || "user").toLowerCase();
  const roleClass = roleLabel.replace(/[^a-z0-9_]/g, "");

  // load session + profile
  useEffect(() => {
    let mounted = true;
    (async () => {
      setProfileLoading(true);
      try {
        const { data: userData } = await supabase.auth.getUser();
        const u = userData?.user ?? null;
        if (!u) {
          if (mounted) {
            setUser(null);
            setProfile(null);
            setIsAdmin(false);
            setCheckingAdmin(false);
            setProfileLoading(false);
          }
          return;
        }
        if (mounted) setUser(u);

        // load profile fields (display_name, username, institution, country, role, avatar_url, is_admin)
        const { data: prof, error: profErr } = await supabase
          .from("profiles")
          .select("id, username, display_name, institution, country, role, avatar_url, is_admin")
          .eq("id", u.id)
          .single();

        if (profErr) {
          console.warn("failed to fetch profile:", profErr.message || profErr);
          if (mounted) {
            setProfile({
              id: u.id,
              username: (u.email || "").split("@")[0],
              display_name: "",
              institution: "",
              country: "",
              role: "user",
              avatar_url: "",
              is_admin: false,
            });
            setIsAdmin(false);
            setProfileLoading(false);
          }
        } else {
          if (mounted) {
            setProfile({
              id: prof.id,
              username: prof.username ?? (u.email || "").split("@")[0],
              display_name: prof.display_name ?? "",
              institution: prof.institution ?? "",
              country: prof.country ?? "",
              role: prof.role ?? "user",
              avatar_url: prof.avatar_url ?? "",
              is_admin: !!prof.is_admin,
            });
            setIsAdmin(!!prof.is_admin);
            setProfileLoading(false);
            if (prof.avatar_url) setAvatarPreview(prof.avatar_url);
          }
        }
      } catch (err) {
        console.error("profile load failed", err);
        if (mounted) {
          setUser(null);
          setProfile(null);
          setIsAdmin(false);
          setCheckingAdmin(false);
          setProfileLoading(false);
        }
      } finally {
        if (mounted) setCheckingAdmin(false);
      }
    })();
    return () => { mounted = false };
  }, []);

  // load profile stats (total courses, solved, global rank)
  useEffect(() => {
    let active = true;
    if (!user?.id) {
      setProfileStats({ totalCourses: 0, totalSolved: 0, globalRank: null, globalTotalUsers: 0 });
      return () => { active = false; };
    }
    (async () => {
      setProfileStatsLoading(true);
      try {
        const [{ count: totalCoursesRaw }, { count: totalSolvedRaw }] = await Promise.all([
          supabase
            .from("enrollments")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id),
          supabase
            .from("solves")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id),
        ]);

        const localCourseSet = loadLocalEnrolledIds(user.id);
        const localCourseCount = localCourseSet ? localCourseSet.size : 0;
        const totalCourses = Math.max(
          Number.isFinite(totalCoursesRaw) ? totalCoursesRaw : 0,
          localCourseCount
        );

        let totalSolved = Number(totalSolvedRaw);
        if (!Number.isFinite(totalSolved)) {
          const { data: solvedRows, error: solvedErr } = await supabase
            .from("solves")
            .select("id")
            .eq("user_id", user.id);
          if (!solvedErr && Array.isArray(solvedRows)) {
            totalSolved = solvedRows.length;
          } else {
            totalSolved = 0;
          }
        }

        let globalRank = null;
        let globalTotalUsers = 0;

        // Prefer course_user_stats (has first_solved_at per course). Tie-break: earliest first solve.
        let usedStats = false;
        try {
          const { data: statsRows, error: statsErr } = await supabase
            .from("course_user_stats")
            .select("user_id, total_solves, first_solved_at");

          if (!statsErr && Array.isArray(statsRows) && statsRows.length > 0) {
            usedStats = true;
            const map = new Map();
            for (const row of statsRows) {
              if (!row?.user_id) continue;
              const prev = map.get(row.user_id) || { id: row.user_id, total: 0, firstSolvedAt: null };
              prev.total += Number(row.total_solves || 0);
              const ts = row.first_solved_at ? new Date(row.first_solved_at).getTime() : null;
              if (ts && (!prev.firstSolvedAt || ts < new Date(prev.firstSolvedAt).getTime())) {
                prev.firstSolvedAt = row.first_solved_at;
              }
              map.set(row.user_id, prev);
            }
            const list = Array.from(map.values()).sort((a, b) => {
              if ((b.total || 0) !== (a.total || 0)) return (b.total || 0) - (a.total || 0);
              const at = a.firstSolvedAt ? new Date(a.firstSolvedAt).getTime() : Number.MAX_SAFE_INTEGER;
              const bt = b.firstSolvedAt ? new Date(b.firstSolvedAt).getTime() : Number.MAX_SAFE_INTEGER;
              return at - bt;
            });
            globalTotalUsers = list.length;
            const idx = list.findIndex((x) => x.id === user.id);
            if (idx >= 0) globalRank = idx + 1;
          }
        } catch {}

        // Fallback to solves table (tie-break: earliest solved_at)
        if (!usedStats) {
          const { data: allSolves, error: allSolvesErr } = await supabase
            .from("solves")
            .select("user_id, solved_at");

          if (!allSolvesErr && Array.isArray(allSolves) && allSolves.length > 0) {
            const map = new Map();
            for (const row of allSolves) {
              if (!row?.user_id) continue;
              const prev = map.get(row.user_id) || { id: row.user_id, total: 0, firstSolvedAt: null };
              prev.total += 1;
              const ts = row.solved_at ? new Date(row.solved_at).getTime() : null;
              if (ts && (!prev.firstSolvedAt || ts < new Date(prev.firstSolvedAt).getTime())) {
                prev.firstSolvedAt = row.solved_at;
              }
              map.set(row.user_id, prev);
            }
            const list = Array.from(map.values()).sort((a, b) => {
              if ((b.total || 0) !== (a.total || 0)) return (b.total || 0) - (a.total || 0);
              const at = a.firstSolvedAt ? new Date(a.firstSolvedAt).getTime() : Number.MAX_SAFE_INTEGER;
              const bt = b.firstSolvedAt ? new Date(b.firstSolvedAt).getTime() : Number.MAX_SAFE_INTEGER;
              return at - bt;
            });
            globalTotalUsers = list.length;
            const idx = list.findIndex((x) => x.id === user.id);
            if (idx >= 0) globalRank = idx + 1;
          }
        }

        // fallback for total solved from course_user_stats if solves are empty
        if (!totalSolved || totalSolved === 0) {
          try {
            const { data: statsMine, error: statsMineErr } = await supabase
              .from("course_user_stats")
              .select("total_solves")
              .eq("user_id", user.id);
            if (!statsMineErr && Array.isArray(statsMine) && statsMine.length > 0) {
              const sum = statsMine.reduce((acc, r) => acc + Number(r.total_solves || 0), 0);
              if (sum > 0) totalSolved = sum;
            }
          } catch {}
        }

        if (active) {
          setProfileStats({
            totalCourses: Number.isFinite(totalCourses) ? totalCourses : 0,
            totalSolved: Number.isFinite(totalSolved) ? totalSolved : 0,
            globalRank,
            globalTotalUsers,
          });
        }
      } catch (err) {
        console.warn("profile stats load failed", err);
        if (active) {
          setProfileStats({
            totalCourses: 0,
            totalSolved: 0,
            globalRank: null,
            globalTotalUsers: 0,
          });
        }
      } finally {
        if (active) setProfileStatsLoading(false);
      }
    })();

    return () => { active = false; };
  }, [user?.id]);

  // lock body scroll when mobile menu is open
  useEffect(() => {
    if (typeof document === "undefined") return;
    const original = document.body.style.overflow;
    document.body.style.overflow = mobileMenuOpen ? "hidden" : original;
    return () => {
      document.body.style.overflow = original;
    };
  }, [mobileMenuOpen]);

  // load featured projects for homepage
  useEffect(() => {
    let mounted = true;
    (async () => {
      setFeaturedProjectsLoading(true);
      try {
        const { data, error } = await supabase
          .from("featured_projects")
          .select("id, title, desc, tags, thumbnail, url, github_url, created_at, position")
          .order("position", { ascending: false })
          .order("created_at", { ascending: false });

        if (error) {
          console.warn("failed to fetch featured projects", error);
          if (mounted) setFeaturedProjects([]);
          return;
        }

        const rows = (data || []).map((r) => ({
          id: r.id,
          title: r.title,
          desc: r.desc || "",
          tags: Array.isArray(r.tags)
            ? r.tags
            : (typeof r.tags === "string" ? r.tags.split(",").map(t => t.trim()).filter(Boolean) : []),
          thumbnail: r.thumbnail || "",
          url: r.url || "",
          github_url: r.github_url || "",
        }));

        if (mounted) setFeaturedProjects(rows);
      } catch (err) {
        console.error("featured projects load error", err);
        if (mounted) setFeaturedProjects([]);
      } finally {
        if (mounted) setFeaturedProjectsLoading(false);
      }
    })();
    return () => { mounted = false };
  }, []);

  // fetch course by slug 'cp-foundations', its problem count and enrolled count
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingCpCourse(true);
      try {
        const { data: courses } = await supabase
          .from("courses")
          .select("*")
          .eq("slug", "cp-foundations")
          .limit(1);

        const c = courses?.[0];
        if (!c) {
          if (mounted) {
            setCpCourse(null);
            setLoadingCpCourse(false);
          }
          return;
        }

        const { count: problemCount } = await supabase
          .from("course_problems")
          .select("id", { count: "exact", head: false })
          .eq("course_id", c.id);

        let enrolledCount = 0;
        try {
          const counts = await fetchEnrollCounts([c.id]);
          if (counts && typeof counts[c.id] === "number") {
            enrolledCount = counts[c.id];
          } else if (typeof c.enrolled_count === "number") {
            enrolledCount = c.enrolled_count;
          } else if (counts) {
            enrolledCount = 0;
          } else {
            const { count } = await supabase
              .from("enrollments")
              .select("id", { count: "exact", head: false })
              .eq("course_id", c.id);
            enrolledCount = typeof count === "number" ? count : 0;
          }
        } catch (e) {
          const { count } = await supabase
            .from("enrollments")
            .select("id", { count: "exact", head: false })
            .eq("course_id", c.id);
          enrolledCount = typeof count === "number" ? count : 0;
        }

        const { data: userData } = await supabase.auth.getUser();
        const u = userData?.user ?? null;
        let userEnrolled = false;
        if (u) {
          const { data: own } = await supabase
            .from("enrollments")
            .select("id")
            .eq("course_id", c.id)
            .eq("user_id", u.id)
            .limit(1);
          userEnrolled = (own || []).length > 0;
          if (!userEnrolled) {
            const localSet = loadLocalEnrolledIds(u.id);
            userEnrolled = localSet.has(c.id);
          }
        }

        if (mounted) {
          setCpCourse({
            id: c.id,
            slug: c.slug,
            title: c.title,
            description: c.description || "",
            problemCount: typeof problemCount === "number" ? problemCount : 0,
            enrolledCount: typeof enrolledCount === "number" ? enrolledCount : 0,
          });
          setUserEnrolledOnHome(userEnrolled);
          setLoadingCpCourse(false);
        }
      } catch (err) {
        console.error("failed to load cp course", err);
        if (mounted) {
          setCpCourse(null);
          setLoadingCpCourse(false);
        }
      }
    })();
    return () => { mounted = false };
  }, []);

  // fetch all courses to display on homepage (so newly created courses show up on homepage)
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingCoursesList(true);
      try {
        // fetch base course rows
        const { data: baseCourses, error: baseErr } = await supabase
          .from("courses")
          .select("*")
          .order("created_at", { ascending: false });

        if (baseErr) {
          console.warn("failed to fetch courses list:", baseErr);
          if (mounted) setCoursesList([]);
          return;
        }
        const courses = baseCourses || [];

        // fetch enrollment counts in one call (bypass RLS via server)
        const enrollCounts = await fetchEnrollCounts(courses.map(c => c.id));
        const serverCountsOk = enrollCounts !== null;

        // get current user id (if any)
        const { data: userData } = await supabase.auth.getUser();
        const u = userData?.user ?? null;
        const uid = u?.id ?? null;
        const localEnrolledSet = uid ? loadLocalEnrolledIds(uid) : new Set();

        // for each course, fetch counts and whether current user enrolled.
        const enhanced = await Promise.all(courses.map(async (c) => {
          try {
            const [{ count: problemCount }] = await Promise.all([
              supabase.from("course_problems").select("id", { count: "exact", head: false }).eq("course_id", c.id),
            ]);

            let userEnrolled = false;
            if (uid) {
              const { data: own } = await supabase
                .from("enrollments")
                .select("id")
                .eq("course_id", c.id)
                .eq("user_id", uid)
                .limit(1);
              userEnrolled = (own || []).length > 0;
            }
            if (!userEnrolled && uid && localEnrolledSet.has(c.id)) {
              userEnrolled = true;
            }

            let finalEnrolledCount = (enrollCounts && typeof enrollCounts[c.id] === "number")
              ? enrollCounts[c.id]
              : null;
            if (finalEnrolledCount === null) {
              if (typeof c.enrolled_count === "number") {
                finalEnrolledCount = c.enrolled_count;
              } else if (serverCountsOk) {
                finalEnrolledCount = 0;
              } else {
                const { count } = await supabase
                  .from("enrollments")
                  .select("id", { count: "exact", head: false })
                  .eq("course_id", c.id);
                finalEnrolledCount = typeof count === "number" ? count : 0;
              }
            }

            return {
              ...c,
              problemCount: typeof problemCount === "number" ? problemCount : 0,
              enrolledCount: finalEnrolledCount,
              userEnrolled,
            };
          } catch (err) {
            // if a per-course fetch fails, fallback to zeros but keep the row
            console.warn("failed to fetch counts for course", c.id, err);
            return {
              ...c,
              problemCount: 0,
              enrolledCount: 0,
              userEnrolled: false,
            };
          }
        }));

        if (mounted) {
          setCoursesList(enhanced);
          const seen = new Set();
          const ordered = [];
          const addTopic = (t) => {
            const raw = String(t || "").trim();
            if (!raw) return;
            const key = normalizeTopic(raw);
            if (seen.has(key)) return;
            seen.add(key);
            ordered.push(raw);
          };
          for (const c of enhanced) {
            const topics = parseTopicsFromRow(c);
            if (topics.length > 0) {
              topics.forEach(addTopic);
            } else if ((c.slug || "").toLowerCase() === "cp-foundations") {
              CP_FALLBACK_TOPICS.forEach(addTopic);
            }
          }
          setUniqueTopics(ordered);
        }
      } catch (err) {
        console.error("unexpected error fetching courses list", err);
        if (mounted) setCoursesList([]);
      } finally {
        if (mounted) setLoadingCoursesList(false);
      }
    })();
    return () => { mounted = false };
  }, []);

  // load latest 3 blog posts for homepage (and counts + whether liked by current user)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // fetch latest 3 posts
        const { data: posts, error: postsErr } = await supabase
          .from("blog_posts")
          .select("id, title, excerpt, thumbnail, reads, likes, created_at")
          .order("created_at", { ascending: false })
          .limit(3);

        if (postsErr) {
          console.warn("failed to fetch home posts", postsErr);
          if (mounted) setHomePosts([]);
          return;
        }
        const p = posts || [];
        if (!mounted) return;

        setHomePosts(p.map(x => ({
          id: x.id,
          title: x.title,
          excerpt: x.excerpt,
          thumbnail: x.thumbnail || '/avatar.jpg',
          reads: Number(x.reads ?? 0),
          likes: Number(x.likes ?? 0),
          created_at: x.created_at || '',
        })));

        // fetch comment counts for these posts
        const postIds = (p || []).map(x => x.id).filter(Boolean);
        if (postIds.length > 0) {
          const { data: commentRows } = await supabase
            .from("blog_comments")
            .select("post_id")
            .in("post_id", postIds);

          const counts = {};
          for (const r of commentRows || []) counts[r.post_id] = (counts[r.post_id] || 0) + 1;
          if (mounted) setHomeCommentsCount(counts);
        } else {
          if (mounted) setHomeCommentsCount({});
        }

        // detect likes by current user for these posts
        const { data: ud } = await supabase.auth.getUser();
        const curUser = ud?.user ?? null;
        if (curUser && postIds.length > 0) {
          try {
            const { data: likeRows } = await supabase
              .from("blog_likes")
              .select("post_id")
              .eq("user_id", curUser.id)
              .in("post_id", postIds);
            const likedMap = {};
            for (const lr of likeRows || []) likedMap[lr.post_id] = true;
            if (mounted) setHomeLikedByUser(likedMap);
          } catch (e) {
            if (mounted) setHomeLikedByUser({});
          }
        } else {
          if (mounted) setHomeLikedByUser({});
        }

        // set local likes map
        const likesLocal = {};
        for (const x of p || []) likesLocal[x.id] = Number(x.likes ?? 0);
        if (mounted) setHomeLikesLocal(likesLocal);
      } catch (e) {
        console.error("home posts load error", e);
      }
    })();
    return () => { mounted = false };
  }, []);

  // enroll directly from homepage (simple UX for CP Foundations)
  async function handleHomeEnroll() {
    if (!cpCourse?.id) return alert("Course not loaded");
    setEnrollActionLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const u = userData?.user;
      if (!u) {
        // redirect to login if no session
        // include next param to return to enroll after login
        const next = encodeURIComponent(`/enroll?course=${encodeURIComponent(cpCourse.slug)}`);
        window.location.href = `/login?next=${next}`;
        return;
      }

      const { error } = await supabase.from("enrollments").insert([
        { user_id: u.id, course_id: cpCourse.id }
      ]);

      if (error) {
        // already enrolled? update state
        if (error.code === "23505" || error.message?.includes("duplicate")) {
          setUserEnrolledOnHome(true);
          saveLocalEnrolledId(u.id, cpCourse.id);
        } else {
          console.error("enroll failed", error);
          alert("Enroll failed: " + error.message);
        }
      } else {
        // success: bump enrolled count and mark user enrolled
        setUserEnrolledOnHome(true);
        bumpEnrollCountDelta(cpCourse.id);
        saveLocalEnrolledId(u.id, cpCourse.id);
        setCpCourse((prev) => prev ? { ...prev, enrolledCount: (prev.enrolledCount || 0) + 1 } : prev);
        // also update coursesList entry if present
        setCoursesList((prev) => prev.map(row => row.id === cpCourse.id ? { ...row, enrolledCount: (row.enrolledCount || 0) + 1, userEnrolled: true } : row));
        // auto-open course after successful enrollment
        window.location.href = `/enroll?course=${encodeURIComponent(cpCourse.slug)}`;
      }
    } catch (err) {
      console.error("unexpected enroll error", err);
      alert("Unexpected error while enrolling");
    } finally {
      setEnrollActionLoading(false);
    }
  }

  async function handleCourseEnroll(courseObj) {
    if (!courseObj || !courseObj.id) return;
    if (enrollingCourseId) return;
    try {
      setEnrollingCourseId(courseObj.id);
      const { data: userData } = await supabase.auth.getUser();
      const u = userData?.user ?? null;
      if (!u) {
        const next = encodeURIComponent(`/enroll?course=${encodeURIComponent(courseObj.slug || "")}`);
        window.location.href = `/login?next=${next}`;
        return;
      }

      const { error } = await supabase.from("enrollments").insert([
        { user_id: u.id, course_id: courseObj.id }
      ]);

      if (error) {
        if (error.code === "23505" || error.message?.includes("duplicate")) {
          saveLocalEnrolledId(u.id, courseObj.id);
          setCoursesList((prev) => prev.map(row =>
            row.id === courseObj.id ? { ...row, userEnrolled: true } : row
          ));
          return;
        }
        console.error("enroll failed", error);
        alert("Enroll failed: " + error.message);
        return;
      }

      saveLocalEnrolledId(u.id, courseObj.id);
      bumpEnrollCountDelta(courseObj.id);
      setCoursesList((prev) => prev.map(row =>
        row.id === courseObj.id
          ? { ...row, enrolledCount: (row.enrolledCount || 0) + 1, userEnrolled: true }
          : row
      ));
      // auto-open course after successful enrollment
      const slug = courseObj.slug || "";
      window.location.href = `/enroll?course=${encodeURIComponent(slug)}`;
    } catch (err) {
      console.error("unexpected enroll error", err);
      alert("Unexpected error while enrolling");
    } finally {
      setEnrollingCourseId(null);
    }
  }

  // logout
  async function handleLogout() {
    try {
      await supabase.auth.signOut();
      // reset local state and reload page
      setUser(null);
      setProfile(null);
      window.location.href = "/";
    } catch (err) {
      console.error("logout failed", err);
      alert("Logout failed");
    }
  }

  // profile updates (institution, country)
  async function handleSaveProfile(e) {
    e?.preventDefault();
    if (!user) return alert("No user");
    try {
      // ensure display_name is set (profiles.display_name is NOT NULL in your DB)
      const usernameFallback = user.email ? (user.email.split("@")[0]) : user.id;
      const displayNameValue = (profile && profile.display_name) ? profile.display_name : usernameFallback;

      const update = {
        id: user.id,
        institution: editInstitution ?? null,
        country: editCountry ?? null,
        display_name: displayNameValue,
      };
      // upsert the profile fields (include display_name to avoid NOT NULL violation)
      const { error } = await supabase.from("profiles").upsert(update, { onConflict: "id" });
      if (error) {
        console.error("profile update error", error);
        return alert("Failed to update profile: " + (error.message || JSON.stringify(error)));
      }

      // fetch back the saved profile row to ensure local state matches DB (fixes visibility issues)
      const { data: savedProf, error: fetchErr } = await supabase
        .from("profiles")
        .select("id, username, display_name, institution, country, role, avatar_url, is_admin")
        .eq("id", user.id)
        .single();

      if (fetchErr) {
        console.warn("failed to re-fetch profile after save", fetchErr);
        // fallback to local optimistic update
        setProfile((p) => p ? { ...p, institution: update.institution, country: update.country, display_name: update.display_name } : p);
      } else {
        setProfile({
          id: savedProf.id,
          username: savedProf.username ?? (user.email || "").split("@")[0],
          display_name: savedProf.display_name ?? "",
          institution: savedProf.institution ?? "",
          country: savedProf.country ?? "",
          role: savedProf.role ?? "user",
          avatar_url: savedProf.avatar_url ?? "",
          is_admin: !!savedProf.is_admin,
        });
        if (savedProf.avatar_url) setAvatarPreview(savedProf.avatar_url);
      }

      setShowProfileModal(false);
    } catch (err) {
      console.error("profile save err", err);
      alert("Unexpected error");
    }
  }

  // avatar upload handler
  async function handleAvatarFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!user) return alert("Login to upload avatar");

    setUploadingAvatar(true);
    try {
      // set a path like "userId/timestamp_filename"
      const filePath = `${user.id}/${Date.now()}_${file.name.replace(/\s+/g, "_")}`;

      // upload to 'avatars' bucket - ensure the bucket exists and is public or you handle signed URLs
      const { error: uploadErr } = await supabase.storage.from("avatars").upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
      });

      if (uploadErr) {
        console.error("avatar upload error", uploadErr);
        alert(`Upload failed: ${uploadErr.message || uploadErr}`);
        setUploadingAvatar(false);
        return;
      }

      // get public URL
      const { data: publicData } = supabase.storage.from("avatars").getPublicUrl(filePath);
      const publicUrl = publicData?.publicUrl || "";

      // ensure display_name fallback to avoid NOT NULL violation (same pattern as save)
      const usernameFallback = user.email ? (user.email.split("@")[0]) : user.id;
      const displayNameValue = (profile && profile.display_name) ? profile.display_name : usernameFallback;

      // save to profiles.avatar_url (include display_name so upsert won't insert a row with null display_name)
      const { error: profErr } = await supabase.from("profiles").upsert({
        id: user.id,
        avatar_url: publicUrl,
        display_name: displayNameValue,
      }, { onConflict: "id" });

      if (profErr) {
        console.warn("failed to save avatar url to profile", profErr);
        alert("Avatar uploaded but saving profile failed");
      } else {
        // re-fetch profile to keep consistent
        const { data: savedProf } = await supabase
          .from("profiles")
          .select("id, username, display_name, institution, country, role, avatar_url, is_admin")
          .eq("id", user.id)
          .single();

        if (savedProf) {
          setProfile({
            id: savedProf.id,
            username: savedProf.username ?? (user.email || "").split("@")[0],
            display_name: savedProf.display_name ?? "",
            institution: savedProf.institution ?? "",
            country: savedProf.country ?? "",
            role: savedProf.role ?? "user",
            avatar_url: savedProf.avatar_url ?? "",
            is_admin: !!savedProf.is_admin,
          });
          setAvatarPreview(savedProf.avatar_url || publicUrl);
        }
      }
    } catch (err) {
      console.error("avatar upload unexpected", err);
      alert("Unexpected error while uploading avatar");
    } finally {
      setUploadingAvatar(false);
    }
  }

  // small helper render for nav profile avatar
  function NavAvatar({ src, size = 28 }) {
    return (
      <div style={{
        width: size,
        height: size,
        borderRadius: 8,
        overflow: "hidden",
        background: "rgba(255,255,255,0.04)",
        display: "inline-block",
      }}>
        {src ? <img src={src} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.6)", fontWeight: 700 }}>
            {profile?.display_name ? (profile.display_name[0] || profile.display_name) : "U"}
          </div>
        )}
      </div>
    );
  }

  // open modal and seed fields
  function openProfileModal() {
    setEditInstitution(profile?.institution ?? "");
    setEditCountry(profile?.country ?? "");
    setShowProfileModal(true);
  }

  const normalizeCourseType = (value) => {
    const v = String(value || '').trim().toLowerCase();
    if (!v) return 'Free';
    if (v === 'free' || v === 'premium' || v === 'paid') return v[0].toUpperCase() + v.slice(1);
    if (v === 'cp' || v === 'competitive programming' || v === 'competitive') return 'Free';
    return 'Free';
  };

  /* ---------- Render helpers for course cards (unchanged) ---------- */
  function CourseCard({ courseObj, isCpFallback = false }) {
    // topics (admin will provide these fields)
    const topics = parseTopicsFromRow(courseObj);
    const finalTopics = topics.length ? topics.slice(0, 8) : (isCpFallback ? CP_FALLBACK_TOPICS : []);

    // counts - try multiple common field names, otherwise fallback to provided fields
    const enrolledCount = (typeof courseObj.enrolledCount === 'number') ? courseObj.enrolledCount : (typeof courseObj.enrolled_count === 'number' ? courseObj.enrolled_count : 0);
    const displayEnrolledCount = applyEnrollCountDelta(courseObj.id, enrolledCount);
    const problemCount = (typeof courseObj.problemCount === 'number') ? courseObj.problemCount : (typeof courseObj.problem_count === 'number' ? courseObj.problem_count : 0);

    // course type (defensive naming)
    const rawCourseType = courseObj.course_type || courseObj.courseType || courseObj.type || "";
    const courseType = normalizeCourseType(rawCourseType);

    // per-course user enrolled flag (set when we enhanced coursesList)
    const userEnrolled = !!courseObj.userEnrolled;

    // helper to link visitors to login first (with next target)
    const buildLoginWithNext = (targetPath) => {
      const next = encodeURIComponent(targetPath);
      return `/login?next=${next}`;
    };

    // clicking a tag toggles it in the filter
    const onTagClick = (t, e) => {
      e.stopPropagation();
      toggleTopicFilter(t);
    };

    return (
      <div className="hover-card p-6 text-left" style={{ minHeight: 300 }}>
        <div className="flex items-start justify-between">
          <div style={{ flex: 1 }}>
            <h3 className="font-semibold title text-lg">{courseObj.title}</h3>
            <p className="muted-2 text-sm mt-1">{courseObj.description || ''}</p>
          </div>

          {/* Course type badge in top-right */}
          {courseType ? (
            <div style={{ marginLeft: 12 }}>
              <span className="course-type-badge">{String(courseType)}</span>
            </div>
          ) : null}
        </div>

        {/* Topics mention as tags */}
        <div className="mt-3">
          <div className="text-sm muted-2 mb-2 font-semibold">Course topics:</div>
          {finalTopics.length ? (
            <div className="muted-2 text-sm course-topics-inline">
              {finalTopics.map((t, i) => (
                <button
                  key={i}
                  onClick={(e) => onTagClick(t, e)}
                  className={`topic-chip ${selectedTopics.includes(t) ? 'selected' : ''}`}
                  title={`Filter by ${t}`}
                >
                  {t}
                </button>
              ))}
            </div>
          ) : (
            <div className="muted-2 text-sm">Topics will be added from admin dashboard.</div>
          )}
        </div>

        {/* NEW: counts on single centered row */}
        <div style={{ marginTop: 18 }}>
          <div className="course-stats muted-2" style={{ textAlign: 'center', display: 'flex', justifyContent: 'center', gap: 18, alignItems: 'center' }}>
            <span style={{ fontWeight: 700, color: 'var(--muted-2)' }}>&#128101; {typeof displayEnrolledCount === 'number' ? displayEnrolledCount : '-'} enrolled</span>
            <span style={{ fontWeight: 700, color: 'var(--muted-2)' }}>&#128218; {typeof problemCount === 'number' ? problemCount : '-'} problems</span>
          </div>

          {/* center the action button below counts */}
          <div style={{ marginTop: 14, textAlign: 'center' }}>
            {isCpFallback ? (
              loadingCpCourse ? (
                <button className="btn btn-cyan" disabled>Loading...</button>
              ) : cpCourse ? (
                userEnrolledOnHome ? (
                  // Only allow opening the course if user is enrolled
                  <Link href={`/enroll?course=${encodeURIComponent(cpCourse.slug)}`} className="btn btn-cyan" style={{ display: 'inline-block' }}>Open Course</Link>
                ) : (
                  // handleHomeEnroll will redirect to login if needed
                  <button className="btn btn-cyan" onClick={handleHomeEnroll} disabled={enrollActionLoading} style={{ display: 'inline-block' }}>
                    {enrollActionLoading ? "Enrolling..." : "Enroll Now"}
                  </button>
                )
              ) : (
                <a className="btn btn-cyan" href="#enroll" style={{ display: 'inline-block' }}>Enroll Now</a>
              )
            ) : (
              // generic courses: enforce login before allowing enroll/open
              userEnrolled ? (
                // Only show Open Course if the current user is enrolled
                user ? (
                  <Link href={`/enroll?course=${encodeURIComponent(courseObj.slug)}`} className="btn btn-cyan" style={{ display: 'inline-block' }}>Open Course</Link>
                ) : (
                  // unlikely path, but redirect to login if somehow userEnrolled true but no `user` loaded
                  <Link href={buildLoginWithNext(`/enroll?course=${encodeURIComponent(courseObj.slug)}`)} className="btn btn-cyan" style={{ display: 'inline-block' }}>Open Course</Link>
                )
              ) : (
                // not enrolled: if visitor not logged in -> send to login, else go to enroll page
                user ? (
                  <button
                    className="btn btn-cyan"
                    onClick={() => handleCourseEnroll(courseObj)}
                    disabled={enrollingCourseId === courseObj.id}
                    style={{ display: 'inline-block' }}
                  >
                    {enrollingCourseId === courseObj.id ? "Enrolling..." : "Enroll Now"}
                  </button>
                ) : (
                  <Link href={buildLoginWithNext(`/enroll?course=${encodeURIComponent(courseObj.slug)}`)} className="btn btn-cyan" style={{ display: 'inline-block' }}>Enroll Now</Link>
                )
              )
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ---------- Topic filter helpers (select & toggle) ---------- */
  function toggleTopicFilter(topic) {
    setSelectedTopics(prev => {
      const key = normalizeTopic(topic);
      const idx = prev.findIndex(t => normalizeTopic(t) === key);
      if (idx >= 0) return prev.filter((_, i) => i !== idx);
      return [...prev, topic];
    });
  }

  function clearFilters() {
    setSelectedTopics([]);
  }

  function addTopicFromInput(raw) {
    const v = String(raw || "").trim();
    if (!v) return;
    if (!selectedTopics.some(t => normalizeTopic(t) === normalizeTopic(v))) {
      setSelectedTopics(prev => [...prev, v]);
    }
    setTopicInputValue("");
  }

  // compute which courses to show based on selectedTopics (AND filter)
  const coursesToShow = (coursesList || []).filter(c => {
    if (!showTopicControls) return true;
    if (!selectedTopics || selectedTopics.length === 0) return true;
    const topics = parseTopicsFromRow(c).map(normalizeTopic);
    // require all selected topics to be present (narrowing filter)
    return selectedTopics.map(normalizeTopic).every(st => topics.includes(st));
  });

  // helper to show first N cards unless showAllCourses is true
  const visibleCourses = showAllCourses ? coursesToShow : coursesToShow.slice(0, 6);

  // --- Homepage blog like handler (calls same server endpoint used in blog page) ---
  async function handleHomeLike(postId) {
    try {
      const { data: ud } = await supabase.auth.getUser();
      const curUser = ud?.user ?? null;
      if (!curUser) {
        alert("Please log in to like this post.");
        return;
      }
      // if already liked locally, ignore
      if (homeLikedByUser[postId]) {
        return; // already liked in this session
      }

      const res = await fetch('/api/blog/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, user_id: curUser.id })
      });
      const j = await res.json().catch(()=>({}));

      if (res.ok && j && (j.liked || j.success)) {
        // update local UI
        setHomeLikedByUser(prev => ({ ...prev, [postId]: true }));
        setHomeLikesLocal(prev => ({ ...prev, [postId]: (Number(prev[postId] || 0) + 1) }));
      } else {
        // treat it as already liked or failure - ignore silently
        console.warn("like response", j);
      }
    } catch (e) {
      console.error("home like failed", e);
    }
  }

  return (
    <div>
      <Head>
        <title>Kamonasish Roy</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Kamonasish Roy - Software Engineer, Competitive Programmer, and Mentor." />
      </Head>

      {/* Global styles (unchanged except nav hover & panel top tweak & hover-card + topic styles) */}
      <style jsx global>{`
        :root {
          --font-body: Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
          --bg-dark: #0f172a;
          --grid-cyan: rgba(0,210,255,0.03);
          --accent-cyan: #00d2ff;
          --card-bg: rgba(255,255,255,0.03);
          --card-hover-bg: rgba(0, 210, 255, 0.14);
          --card-border: rgba(255,255,255,0.06);
          --text-light: rgba(255,255,255,0.95);
          --muted: rgba(255,255,255,0.75);
          --muted-2: rgba(255,255,255,0.55);
        }
        html, body, #__next { height: 100%; }
        body {
          font-family: var(--font-body);
          background: var(--bg-dark);
          color: var(--muted);
          overflow-x: hidden;
          line-height: 1.6;
          background-image:
            linear-gradient(var(--grid-cyan) 1px, transparent 1px),
            linear-gradient(90deg, var(--grid-cyan) 1px, transparent 1px);
          background-size: 50px 50px;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        main { background: transparent; }
        .btn {
          padding: 0.75rem 1.5rem;
          border-radius: 6px;
          font-family: var(--font-body);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          cursor: pointer;
          transition: transform 220ms cubic-bezier(.2,.9,.2,1), box-shadow 220ms ease, background-color 220ms ease, color 220ms ease, border-color 220ms ease;
          position: relative;
          overflow: hidden;
          border: 1px solid transparent;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
        }
        /* small btn for profile */
        .btn-sm {
          padding: 0.45rem 0.85rem;
          font-size: 0.9rem;
          border-radius: 8px;
          letter-spacing: 0.5px;
        }
        .btn-xs {
          padding: 0.35rem 0.7rem;
          font-size: 0.82rem;
          border-radius: 7px;
          letter-spacing: 0.4px;
        }
        .btn-cyan {
          background: rgba(0, 210, 255, 0.06);
          border-color: rgba(0,210,255,0.18);
          color: var(--accent-cyan);
        }
        .project-action {
          padding: 0.45rem 0.75rem;
          border-radius: 8px;
          font-size: 0.85rem;
          font-weight: 600;
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.02);
          color: var(--muted);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          text-decoration: none;
          cursor: pointer;
          transition: transform 200ms ease, box-shadow 200ms ease, background-color 200ms ease, color 200ms ease, border-color 200ms ease;
        }
        .project-action:hover,
        .project-action:focus {
          background: rgba(0, 210, 255, 0.10);
          border-color: var(--accent-cyan);
          color: var(--accent-cyan);
          transform: translateY(-3px);
          box-shadow: 0 10px 30px rgba(0, 210, 255, 0.08);
          outline: none;
        }
        .project-action:disabled,
        .project-action[disabled] {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }
.project-desc {
  font-size: 0.85rem;
  line-height: 1.45;
  text-align: left;
  display: -webkit-box;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.hero-stats-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  align-items: center;
  justify-items: center;
}
.hero-stats-grid > div { width: 100%; }
        .btn:hover,
        .btn:focus {
          background: rgba(0, 210, 255, 0.10);
          border-color: var(--accent-cyan);
          color: var(--accent-cyan);
          transform: translateY(-3px);
          box-shadow: 0 10px 30px rgba(0, 210, 255, 0.08);
          outline: none;
        }
        .btn-cyan:hover,
        .btn-cyan:focus {
          background: rgba(0, 210, 255, 0.14);
          border-color: var(--accent-cyan);
          color: var(--bg-dark);
          transform: translateY(-4px) scale(1.02);
          box-shadow: 0 14px 40px rgba(0, 210, 255, 0.12);
        }
        .btn:focus-visible,
        .btn-cyan:focus-visible {
          box-shadow: 0 0 0 6px rgba(0,210,255,0.10);
        }
        .card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.04);
          border-radius: 12px;
        }
        .contact-card {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem;
          border-radius: 12px;
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          color: var(--muted);
          text-decoration: none;
          transition:
            transform 220ms cubic-bezier(.2,.9,.2,1),
            box-shadow 220ms ease,
            background-color 220ms ease,
            color 220ms ease;
          will-change: transform, box-shadow, background-color;
        }
        .contact-card:hover,
        .contact-card:focus {
          transform: translateY(-4px) scale(1.02);
          box-shadow: 0 14px 40px rgba(0, 210, 255, 0.12);
          background: var(--card-hover-bg);
          border-color: var(--accent-cyan);
          color: var(--bg-dark);
          outline: none;
        }
        .contact-card svg { color: var(--muted); transition: color 220ms ease, transform 220ms ease; }
        .contact-card:hover svg,
        .contact-card:focus svg { color: var(--bg-dark); transform: scale(1.08); }
        .contact-title { font-weight: 600; color: inherit; }
        .contact-sub { font-size: 0.75rem; color: var(--muted-2); transition: color 220ms ease; }

        /* New: grid for contacts to show exactly 3 columns on wide screens */
        .grid-responsive {
          display: grid;
          grid-template-columns: repeat(1, minmax(0, 1fr));
          gap: 0.75rem;
        }
        @media (min-width: 640px) { .grid-responsive { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (min-width: 1024px) { .grid-responsive { grid-template-columns: repeat(3, minmax(0, 1fr)); } }

        .muted { color: var(--muted); }
        .muted-2 { color: var(--muted-2); }
        .title { color: var(--text-light); }
        .admin-fab {
          position: fixed;
          right: 16px;
          bottom: 16px;
          z-index: 60;
          border-radius: 10px;
          padding: 10px 14px;
          background: rgba(0,210,255,0.09);
          border: 1px solid rgba(0,210,255,0.18);
          color: var(--accent-cyan);
          font-weight: 700;
          box-shadow: 0 10px 30px rgba(0,210,255,0.06);
        }
        .stat-inline { display:inline-block; margin-left:8px; color:var(--muted-2); font-weight:600; }

       /* NAV link style: plain text by default, becomes a rounded cyan button on hover */
.nav-link {
  color: var(--muted);
  text-decoration: none;
  transition: color 180ms ease, transform 160ms ease, background-color 180ms ease, box-shadow 180ms ease, padding 160ms ease;
  font-weight: 600;
  display: inline-block;       /* allows padding/background on hover without shifting layout */
  padding: 4px 6px;            /* small neutral padding so layout doesn't jump when hovered */
  border-radius: 10px;
  background: transparent;
}

/* Hover / focus: show cyan rounded box and lift */
.nav-link:hover,
.nav-link:focus {
  color: var(--bg-dark);                     /* dark text on light cyan background for contrast */
  background: var(--accent-cyan);            /* cyan box */
  transform: translateY(-3px);
  box-shadow: 0 10px 30px rgba(0,210,255,0.10);
}

/* Left profile panel (desktop) - moved slightly up for better alignment with header avatar */
.profile-panel {
  position: fixed;
  left: 18px;
  top: 96px;            /* nudged upward to align closer with header avatar */
  width: 220px;
  padding: 14px;
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(14,26,52,0.92), rgba(10,20,42,0.92));
  border: 1px solid rgba(60,140,255,0.18);
  box-shadow: 0 16px 40px rgba(2,6,23,0.55), inset 0 1px 0 rgba(255,255,255,0.05);
  backdrop-filter: blur(12px);
  z-index: 50;
  transition: transform 200ms ease, box-shadow 200ms ease, background-color 200ms ease, border-color 200ms ease;
  cursor: default;
}

/* hover highlight (mimic btn-cyan hover) */
.profile-panel:hover {
  background: linear-gradient(180deg, rgba(18,34,70,0.96), rgba(10,20,42,0.96));
  border-color: rgba(0,210,255,0.45);
  transform: translateY(-4px) scale(1.01);
  box-shadow: 0 18px 46px rgba(0,210,255,0.16), inset 0 1px 0 rgba(255,255,255,0.08);
}

/* keep main content clear of fixed profile panel */
.with-profile-panel {
  padding-left: 0;
}

@media (max-width: 1280px) {
  .with-profile-panel {
    padding-left: 260px;
  }
}

@media (max-width: 768px) {
  .with-profile-panel {
    padding-left: 0;
  }
}

/* text color changes on hover to match button contrast */
.profile-panel .panel-name { color: var(--text-light); font-weight:700; font-size:16px; margin-top:10px; letter-spacing: 0.2px; }
.profile-panel .panel-meta { color: var(--muted-2); font-size:12.5px; font-weight:600; margin-top:4px; }

.profile-panel .panel-stats {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  margin: 10px 0 12px;
}

.profile-panel .panel-stat {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02));
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
}

.profile-panel .panel-stat-label {
  font-size: 11px;
  color: var(--muted-2);
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.profile-panel .panel-stat-value {
  font-size: 12px;
  color: var(--text-light);
  font-weight: 700;
}

.profile-panel .panel-avatar {
  position: relative;
  border-radius: 14px;
  padding: 2px;
  background: conic-gradient(from 120deg, rgba(0,210,255,0.7), rgba(56,189,248,0.25), rgba(251,191,36,0.4), rgba(0,210,255,0.7));
  box-shadow: 0 10px 24px rgba(0,0,0,0.35);
}

.profile-panel .panel-avatar img {
  border-radius: 12px;
}

.profile-panel .panel-stat-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-weight: 800;
  font-size: 12px;
  letter-spacing: 0.2px;
  box-shadow: 0 6px 16px rgba(0,0,0,0.18);
}

.profile-panel .panel-stat-rank-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(251, 191, 36, 0.18);
  border: 1px solid rgba(251, 191, 36, 0.55);
  color: #fbbf24;
  font-weight: 800;
  font-size: 12px;
  letter-spacing: 0.2px;
  box-shadow: 0 6px 16px rgba(0,0,0,0.18);
}

.profile-panel .badge-course {
  background: rgba(59, 130, 246, 0.18);
  border-color: rgba(59, 130, 246, 0.55);
  color: #60a5fa;
}

.profile-panel .badge-solved {
  background: rgba(16, 185, 129, 0.18);
  border-color: rgba(16, 185, 129, 0.55);
  color: #34d399;
}

.profile-panel .badge-users {
  background: rgba(148, 163, 184, 0.18);
  border-color: rgba(148, 163, 184, 0.55);
  color: #cbd5f5;
}

.profile-panel .panel-stat-icon {
  width: 20px;
  height: 20px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  border: 1px solid transparent;
  flex-shrink: 0;
  box-shadow: 0 4px 10px rgba(0,0,0,0.18);
}

.profile-panel .stat-course {
  background: rgba(59, 130, 246, 0.18);
  border-color: rgba(59, 130, 246, 0.45);
  color: #60a5fa;
}

.profile-panel .stat-solved {
  background: rgba(16, 185, 129, 0.18);
  border-color: rgba(16, 185, 129, 0.45);
  color: #34d399;
}

.profile-panel .stat-rank {
  background: rgba(251, 191, 36, 0.18);
  border-color: rgba(251, 191, 36, 0.45);
  color: #fbbf24;
}

.profile-panel .stat-users {
  background: rgba(148, 163, 184, 0.18);
  border-color: rgba(148, 163, 184, 0.45);
  color: #cbd5f5;
}

.profile-panel .panel-role {
  display: flex;
  justify-content: center;
}

.profile-panel .panel-actions {
  display: flex;
  justify-content: center;
  margin-top: 4px;
}

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
}

.role-super_admin {
  background: rgba(251, 191, 36, 0.18);
  border-color: rgba(251, 191, 36, 0.5);
  color: #fbbf24;
}

.role-admin {
  background: rgba(59, 130, 246, 0.18);
  border-color: rgba(59, 130, 246, 0.5);
  color: #60a5fa;
}

.role-moderator {
  background: rgba(16, 185, 129, 0.18);
  border-color: rgba(16, 185, 129, 0.5);
  color: #34d399;
}

.role-user {
  background: rgba(148, 163, 184, 0.18);
  border-color: rgba(148, 163, 184, 0.45);
  color: #cbd5f5;
}

/* when hovered, make meta/dark text for contrast */
.profile-panel:hover .panel-name,
.profile-panel:hover .panel-meta,
.profile-panel:hover .panel-stat-label,
.profile-panel:hover .panel-stat-value {
  color: var(--bg-dark);
}

/* show panel inline on very small screens */
@media (max-width: 768px) {
  .profile-panel {
    position: static;
    left: auto;
    top: auto;
    width: 100%;
    max-width: 420px;
    margin: 12px auto 0;
  }
}

/* modal overlay */
.profile-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(2,6,23,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}
.profile-modal {
  width: 420px;
  background: #071029;
  border: 1px solid rgba(255,255,255,0.04);
  padding: 20px;
  border-radius: 12px;
}

/* make inputs visible on dark bg */
.profile-modal input[type="text"],
.profile-modal input[type="file"],
.profile-modal input[type="email"],
.profile-modal input[type="password"] {
  background: rgba(255,255,255,0.02);
  color: var(--muted);
  border: 1px solid rgba(255,255,255,0.06);
  padding: 8px;
  border-radius: 6px;
  width: 100%;
}
.profile-modal input::placeholder {
  color: rgba(255,255,255,0.4);
}

/* HOVER-CARD: apply to any card you want to "light up" on hover/touch */
.hover-card {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.04);
  border-radius: 12px;
  transition: transform 200ms ease, box-shadow 200ms ease, background-color 200ms ease, border-color 200ms ease;
  cursor: default;
  overflow: visible; /* allow subtle shadows */
}
.hover-card:hover,
.hover-card:focus {
  background: var(--card-hover-bg);
  border-color: var(--accent-cyan);
  transform: translateY(-4px) scale(1.01);
  box-shadow: 0 14px 40px rgba(0,210,255,0.12);
}
/* adjust text color for contrast when card hovered */
.hover-card:hover .title,
.hover-card:hover .muted-2,
.hover-card:hover .contact-title,
.hover-card:hover .contact-sub {
  color: var(--bg-dark);
}

/* topic chips styling */
.topic-chip {
  display: inline-block;
  margin: 4px 6px 4px 0;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 0.85rem;
  background: rgba(255,255,255,0.04);
  color: var(--muted-2);
  border: 1px solid rgba(255,255,255,0.03);
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease, background 150ms ease, color 150ms ease;
}
.topic-chip:hover { transform: translateY(-3px); background: rgba(0,210,255,0.08); color: var(--text-light); }
.topic-chip.selected { background: var(--accent-cyan); color: var(--bg-dark); border-color: rgba(0,210,255,0.18); box-shadow: 0 8px 30px rgba(0,210,255,0.08); }

/* course type badge */
.course-type-badge {
  display: inline-block;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.05);
  color: var(--muted-2);
  text-transform: capitalize;
}

/* filter toolbar */
.topic-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 12px;
}
.topic-toolbar .drag-hint { font-size: 12px; color: var(--muted-2); margin-right: 8px; }

/* small topics inline style (kept for fallback) */
.course-topics-inline {
  font-size: 0.95rem;
  color: var(--muted-2);
  margin-top: 4px;
}

/* responsiveness minor tweak for chip area */
@media (max-width: 640px) {
  .topic-chip { font-size: 0.82rem; padding: 6px 8px; }
}
@media (max-width: 480px) {
  .project-desc { font-size: 0.82rem; -webkit-line-clamp: 6; }
}

/* FIX: filter & typing box visibility */
.topic-toolbar select,
.topic-toolbar input,
.topic-toolbar .field,
select.p-2.field,
input.p-2.field {
  background: rgba(255,255,255,0.02) !important; /* subtle dark surface */
  color: var(--text-light) !important;            /* bright text for readability */
  border: 1px solid rgba(255,255,255,0.06) !important;
  caret-color: var(--text-light) !important;
}
.topic-filter-input {
  background: rgba(8,16,36,0.9) !important;
  color: #e6f7ff !important;
  border-color: rgba(255,255,255,0.12) !important;
  caret-color: #e6f7ff !important;
}
.topic-filter-input option {
  color: #e6f7ff;
  background: #0b1633;
}
.topic-toolbar input::placeholder,
.topic-toolbar select::placeholder,
.topic-toolbar .field::placeholder {
  color: rgba(255,255,255,0.45) !important;
}

/* course stats: allow wrap on narrower cards */
.course-stats { white-space: normal; display: flex; flex-wrap: wrap; row-gap: 6px; column-gap: 18px; align-items: center; justify-content: center; }

/* -----------------------
   HOMEPAGE BLOG: layout fix
   - place stats in one row, and controls (Like + Read more) in their own row
   - reduce read button size so it fits visually
------------------------*/
.home-read-btn {
  padding: 10px 12px !important;
  border-radius: 10px !important;
  font-size: 14px !important;
  text-transform: none !important;
  letter-spacing: 0.6px !important;
  transition: box-shadow 160ms ease, background-color 160ms ease, color 160ms ease !important;
  transform: none !important;
}
.home-like-btn {
  padding: 10px 12px !important;
  border-radius: 12px !important;
  font-size: 16px !important;
  text-transform: none !important;
  color: #e5e7eb !important;
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  transition: box-shadow 160ms ease, background-color 160ms ease, color 160ms ease !important;
  transform: none !important;
}
.home-like-btn:disabled {
  opacity: 0.55 !important;
  cursor: not-allowed !important;
  box-shadow: none !important;
}
.home-like-icon { color: #ff2d55; font-size: 16px; line-height: 1; }
.home-like-count { color: #e5e7eb; font-weight: 600; font-size: 16px; }
.home-like-count { color: #e5e7eb; font-weight: 600; }
.home-blog-actions-row {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  align-items: center;
  margin-top: 10px;
}

/* ensure small read button won't get translated by global hover */
.home-read-btn:hover,
.home-like-btn:hover {
  transform: none !important;
}

/* -----------------------
   MOBILE MENU (drawer)
------------------------*/
.mobile-menu-overlay {
  position: fixed;
  inset: 0;
  background: rgba(5, 8, 20, 0.55);
  z-index: 60;
}
.mobile-menu-panel {
  position: absolute;
  top: 0;
  right: 0;
  width: min(80vw, 320px);
  height: 100%;
  background: rgba(8, 12, 26, 0.98);
  border-left: 1px solid rgba(255,255,255,0.08);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  animation: slideIn 180ms ease;
}
.mobile-menu-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.mobile-menu-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  color: #cfe3ff;
  text-decoration: none;
  font-weight: 600;
  letter-spacing: 0.4px;
}
.mobile-menu-link:hover,
.mobile-menu-link:focus {
  background: rgba(255,255,255,0.08);
  color: #ffffff;
}
.mobile-menu-meta {
  color: rgba(255,255,255,0.55);
  font-size: 12px;
  margin-top: 6px;
}
@keyframes slideIn {
  from { transform: translateX(12px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

      `}</style>

      <main className={`min-h-screen ${user && profile ? 'with-profile-panel' : ''}`}>
        <header className="max-w-5xl mx-auto p-6 sm:p-10">
          <nav className="flex items-center justify-between" aria-label="Main navigation">
            <div className="text-lg font-semibold title" aria-hidden="true"></div>
            <div className="space-x-4 hidden md:inline-flex items-center">
              <a className="nav-link" href="#projects">Projects</a>
              <a className="nav-link" href="#competitive-programming">Competitive Programming</a>
              <Link href="/blog" className="nav-link" >Blog</Link>

              {/* Login / Signup OR Logout & Avatar */}
              {!user ? (
                <>
                  <Link href="/login" className="nav-link">Login</Link>
                  <Link href="/signup" className="nav-link">Sign up</Link>
                </>
              ) : (
                <>
                  <button onClick={handleLogout} className="nav-link" style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>Logout</button>
                  {/* small avatar shown in nav */}
                  <span style={{ marginLeft: 6 }} title={profile?.display_name || profile?.username || ""}>
                    <NavAvatar src={avatarPreview || profile?.avatar_url} />
                  </span>
                </>
              )}

              {/* Admin stays visible only for admins */}
              {isOperator && (
                <Link href="/admin" className="btn btn-cyan">
                  Admin
                </Link>
              )}
            </div>
            <button
              className="md:hidden p-2 muted"
              type="button"
              aria-expanded={mobileMenuOpen ? "true" : "false"}
              aria-controls="mobile-menu"
              onClick={() => setMobileMenuOpen((v) => !v)}
            >
              Menu
            </button>
          </nav>

          {mobileMenuOpen && (
            <div
              id="mobile-menu"
              className="mobile-menu-overlay"
              role="dialog"
              aria-modal="true"
              onClick={() => setMobileMenuOpen(false)}
            >
              <div className="mobile-menu-panel" onClick={(e) => e.stopPropagation()}>
                <div className="mobile-menu-header">
                  <div className="text-base font-semibold title">Menu</div>
                  <button className="btn btn-cyan btn-sm" onClick={() => setMobileMenuOpen(false)}>Close</button>
                </div>

                <a className="mobile-menu-link" href="#projects" onClick={() => setMobileMenuOpen(false)}>Projects</a>
                <a className="mobile-menu-link" href="#competitive-programming" onClick={() => setMobileMenuOpen(false)}>Competitive Programming</a>
                <Link href="/blog" className="mobile-menu-link" onClick={() => setMobileMenuOpen(false)}>Blog</Link>

                {!user ? (
                  <>
                    <Link href="/login" className="mobile-menu-link" onClick={() => setMobileMenuOpen(false)}>Login</Link>
                    <Link href="/signup" className="mobile-menu-link" onClick={() => setMobileMenuOpen(false)}>Sign up</Link>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => { setMobileMenuOpen(false); handleLogout(); }}
                      className="mobile-menu-link"
                      style={{ background: "transparent", border: "none", textAlign: "left", cursor: "pointer" }}
                    >
                      Logout
                    </button>
                  </>
                )}

                {isOperator && (
                  <Link href="/admin" className="mobile-menu-link" onClick={() => setMobileMenuOpen(false)}>Admin</Link>
                )}

                {user && (
                  <div className="mobile-menu-meta">
                    Signed in as {profile?.display_name || profile?.username || "User"}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mt-8 card p-6 sm:p-8 shadow">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <img className="w-40 h-52 sm:w-48 sm:h-64 rounded-2xl object-cover shadow-lg" src="/avatar.jpg" alt="Kamonasish Roy portrait" />
              <div className="flex-1">
                <h1 className="text-2xl sm:text-3xl font-extrabold title">
                  <span className="font-medium muted">Hello, I am </span>
                  <span style={{ color: 'white' }}>Kamonasish Roy</span>
                  <span className="font-medium muted">. Welcome to my page!</span>
                </h1>
                <ul className="mt-3 muted" style={{ listStyle: 'none', padding: 0, margin: 0, lineHeight: 1.8 }}>
                  <li>&bull; Software Engineer</li>
                  <li>&bull; Competitive Programmer</li>
                  <li>&bull; Mentor</li>
                  <li>&bull; Blogger</li>
                </ul>
                <div className="mt-4 flex gap-3">
                  <Link className="btn btn-cyan" href="/about" title="Click here to visit Portfolio">About Me</Link>
                </div>
              </div>
            </div>

            <div className="mt-6 p-3 rounded-lg hero-stats-grid text-center" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <div>
                <div className="text-sm muted-2">Experience</div>
                <div className="font-semibold title">2+ yrs</div>
              </div>
              <div>
                <div className="text-sm muted-2">Competitive Programming</div>
                <div className="font-semibold title">7+ yrs</div>
              </div>
              <div>
                <div className="text-sm muted-2">Solved</div>
                <div className="font-semibold title">5000+</div>
              </div>
            </div>
          </div>
        </header>

        {/* LEFT PROFILE PANEL (desktop) */}
        {user && profile && (
          <aside className="profile-panel">
            <div style={{ textAlign: 'center', marginBottom: 10 }}>
              <div className="panel-avatar" style={{ width: 84, height: 84, margin: "0 auto", borderRadius: 12, overflow: "hidden" }}>
                {avatarPreview || profile.avatar_url ? (
                  <img src={avatarPreview || profile.avatar_url} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.6)", fontWeight: 700 }}>
                    {profile.display_name ? profile.display_name[0] : (profile.username ? profile.username[0] : "U")}
                  </div>
                )}
              </div>

              <div className="panel-name">{profile.display_name || profile.username || "User"}</div>
              <div className="panel-meta">{profile.institution || "No institution"}</div>
              <div className="panel-meta">{profile.country || "No country"}</div>
              <div className="panel-role" style={{ marginTop: 8 }}>
                <span className={`role-badge role-${roleClass}`}>{roleLabel}</span>
              </div>
            </div>

            <div className="panel-stats">
              <div className="panel-stat">
                <span className="panel-stat-label">
                  <span className="panel-stat-icon stat-course" aria-hidden="true">&#127891;</span>
                  Total Courses Assigned
                </span>
                <span className="panel-stat-badge badge-course">
                  {profileStatsLoading ? "..." : profileStats.totalCourses}
                </span>
              </div>
              <div className="panel-stat">
                <span className="panel-stat-label">
                  <span className="panel-stat-icon stat-solved" aria-hidden="true">&#9989;</span>
                  Total Problems Solved
                </span>
                <span className="panel-stat-badge badge-solved">
                  {profileStatsLoading ? "..." : profileStats.totalSolved}
                </span>
              </div>
              <div className="panel-stat">
                <span className="panel-stat-label">
                  <span className="panel-stat-icon stat-rank" aria-hidden="true">&#127942;</span>
                  Global rank:
                </span>
                <span className="panel-stat-rank-badge">
                  {profileStatsLoading
                    ? "..."
                    : profileStats.globalRank
                      ? `${profileStats.globalRank}`
                      : "Unranked"}
                </span>
              </div>
              <div className="panel-stat">
                <span className="panel-stat-label">
                  <span className="panel-stat-icon stat-users" aria-hidden="true">&#128101;</span>
                  Total user:
                </span>
                <span className="panel-stat-badge badge-users">
                  {profileStatsLoading ? "..." : (profileStats.globalTotalUsers || 0)}
                </span>
              </div>
            </div>

            <div className="panel-actions">
              <a href="/global-ranklist" className="btn btn-cyan btn-xs" title="Click to view full Ranklist">
                Full Ranklist
              </a>
            </div>

            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 8 }}>
              <button
                className="btn btn-cyan btn-xs"
                onClick={openProfileModal}
                title="Click Update profile to edit Institution, Country and upload a new profile picture."
              >
                Update profile
              </button>
            </div>

          </aside>
        )}

        {/* Profile modal */}
        {showProfileModal && (
          <div className="profile-modal-overlay" role="dialog" aria-modal="true" onClick={() => setShowProfileModal(false)}>
            <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginBottom: 8, color: "white" }}>Update profile</h3>

              <form onSubmit={handleSaveProfile}>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ display: "block", fontSize: 13, color: "var(--muted-2)" }}>Institution</label>
                  <input
                    value={editInstitution}
                    onChange={(e) => setEditInstitution(e.target.value)}
                    className="w-full p-2 border rounded"
                    placeholder="Your institution"
                    type="text"
                  />
                </div>

                <div style={{ marginBottom: 10 }}>
                  <label style={{ display: "block", fontSize: 13, color: "var(--muted-2)" }}>Country</label>
                  <input
                    value={editCountry}
                    onChange={(e) => setEditCountry(e.target.value)}
                    className="w-full p-2 border rounded"
                    placeholder="Country"
                    type="text"
                  />
                </div>

                <div style={{ marginBottom: 10 }}>
                  <label style={{ display: "block", fontSize: 13, color: "var(--muted-2)" }}>Profile Picture</label>
                  <input type="file" accept="image/*" onChange={handleAvatarFile} />
                  <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted-2)" }}>{uploadingAvatar ? "Uploading..." : ""}</div>
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button type="submit" className="btn btn-cyan" style={{ flex: 1 }}>Save</button>
                  <button type="button" onClick={() => setShowProfileModal(false)} className="btn" style={{ flex: 1 }}>Cancel</button>
                </div>
              </form>
            </div>
          </div>
        )}

        <section id="projects" className="max-w-5xl mx-auto p-6 sm:p-10">
          <h2 className="text-xl font-bold mb-4 title">Featured Projects</h2>
          {featuredProjectsLoading ? (
            <div className="muted-2">Loading projects...</div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {visibleProjects.map((p) => (
                  <article
                    key={p.id}
                    className="hover-card p-6 text-center"
                    role="article"
                  >
                    <div
                      className="h-36 bg-gradient-to-r from-slate-700 to-slate-500 rounded-md mb-3 mx-auto w-full"
                      role="img"
                      aria-label={`${p.title} preview`}
                      style={p.thumbnail ? { backgroundImage: `url(${p.thumbnail})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
                    ></div>
                    <h3 className="font-semibold text-lg title">{p.title}</h3>
                    <p className="project-desc muted-2 mt-2">{p.desc}</p>
                    <div className="mt-3 flex flex-wrap gap-2 justify-center">
                      {(p.tags || []).map((t, i) => (
                        <span key={i} className="text-xs px-2 py-1 bg-white/6 rounded text-white/90">{t}</span>
                      ))}
                    </div>
                    <div className="mt-4 flex gap-2 justify-center">
                      {p.url ? (
                        <a className="project-action" href={p.url} target="_blank" rel="noopener noreferrer">Live Demo</a>
                      ) : (
                        <button className="project-action" type="button" disabled>Live Demo</button>
                      )}
                      {p.github_url ? (
                        <a
                          className="project-action"
                          href={p.github_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Open GitHub project"
                          title="GitHub"
                        >
                          <IconGitHub className="w-4 h-4" />
                        </a>
                      ) : (
                        <button
                          className="project-action"
                          type="button"
                          disabled
                          aria-label="GitHub link not available"
                          title="GitHub"
                        >
                          <IconGitHub className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>

              {hasMoreProjects && (
                <div style={{ marginTop: 12, textAlign: "center" }}>
                  <button className="btn btn-cyan" onClick={() => setShowAllProjects(prev => !prev)}>
                    {showAllProjects ? "Show less" : `Show all (${projectsToRender.length})`}
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        <section id="competitive-programming" className="max-w-5xl mx-auto p-6 sm:p-10">
          <h2 className="text-xl font-bold mb-4 title">Learn Competitive Programming</h2>

          {/* Topic controls */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <input type="checkbox" checked={showTopicControls} onChange={(e) => setShowTopicControls(e.target.checked)} />
              <span style={{ color: 'var(--muted-2)', fontSize: 14 }}>Show topic filters</span>
            </label>

            {showTopicControls && (
              <form
                onSubmit={(e) => { e.preventDefault(); addTopicFromInput(topicInputValue); }}
                style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
              >
                <select
                  value={topicPickerValue}
                  onChange={(e) => {
                    const v = e.target.value;
                    setTopicPickerValue(v);
                    if (!v) return;
                    setSelectedTopics(prev => {
                      const key = normalizeTopic(v);
                      if (prev.some(t => normalizeTopic(t) === key)) return prev;
                      return [...prev, v];
                    });
                    setTopicPickerValue("");
                  }}
                  className="p-2 field topic-filter-input"
                  style={{ minWidth: 200 }}
                >
                  <option value="">- add topic to filter -</option>
                  {uniqueTopics.filter(t => !selectedTopics.some(s => normalizeTopic(s) === normalizeTopic(t))).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>

                <input
                  placeholder="Or type a topic and press Enter"
                  className="p-2 field topic-filter-input"
                  style={{ minWidth: 240 }}
                  value={topicInputValue}
                  onChange={(e) => setTopicInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTopicFromInput(topicInputValue);
                    }
                  }}
                  onKeyUp={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTopicFromInput(topicInputValue);
                    }
                  }}
                  onBlur={() => {
                    if (topicInputValue.trim()) addTopicFromInput(topicInputValue);
                  }}
                />
                {selectedTopics.length > 0 ? (
                  <button className="btn" onClick={clearFilters}>Clear</button>
                ) : null}
              </form>
            )}

            {showTopicControls && selectedTopics.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ color: "var(--muted-2)" }}>Filtering by:</div>
                <div style={{ marginTop: 6 }}>
                  {selectedTopics.map((s, i) => (
                    <button key={s} onClick={() => toggleTopicFilter(s)} className="topic-chip selected" style={{ marginRight: 6 }}>
                      {s} x
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* courses list */}
          {loadingCoursesList ? (
            <div className="muted-2">Loading courses...</div>
          ) : (coursesList && coursesList.length > 0) ? (
            <>
              {visibleCourses.length === 0 ? (
                <div className="muted-2">No courses match the selected topics.</div>
              ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {visibleCourses.map((c) => (
                    <CourseCard key={c.id} courseObj={c} isCpFallback={c.slug === 'cp-foundations'} />
                  ))}
                </div>
              )}

              {coursesToShow.length > 6 && (
                <div style={{ marginTop: 12, textAlign: 'center' }}>
                  <button className="btn btn-cyan" onClick={() => setShowAllCourses(prev => !prev)}>
                    {showAllCourses ? "Show less" : `View all (${coursesToShow.length})`}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <CourseCard courseObj={{
                id: cpCourse?.id ?? 'cp-fallback',
                slug: cpCourse?.slug ?? 'cp-foundations',
                title: cpCourse?.title ?? "CP Foundations",
                description: cpCourse?.description ?? "Foundations course for competitive programming",
                enrolledCount: cpCourse?.enrolledCount,
                problemCount: cpCourse?.problemCount,
              }} isCpFallback={true} />

              <CourseCard courseObj={{
                id: 'advanced-trees',
                slug: 'advanced-trees',
                title: 'Advanced Trees',
                description: 'Deep dive into tree algorithms',
                topics: ['Centroid decomposition','LCA tricks','HLD'],
                enrolledCount: null,
                problemCount: null,
                userEnrolled: false,
              }} isCpFallback={false} />

              <CourseCard courseObj={{
                id: 'contest-strategy',
                slug: 'contest-strategy',
                title: 'Contest Strategy',
                description: 'Live coaching: timed mocks & editorials',
                topics: ['Timed mock contests','In-depth editorials','Post-mortem'],
                enrolledCount: null,
                problemCount: null,
                userEnrolled: false,
              }} isCpFallback={false} />
            </div>
          )}

        </section>

        {/* --- Read Blog Post (homepage preview) --- */}
        <section id="blog-home" className="max-w-5xl mx-auto p-6 sm:p-10">
          <h2 className="text-xl font-bold mb-4 title">Read Blog Post</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {homePosts.map((p) => (
              <article key={p.id} className="hover-card p-6 text-left" style={{ minHeight: 320 }}>
                <div style={{ height: 160, backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.25), rgba(0,0,0,0.45)), url(${p.thumbnail})`, backgroundSize: 'cover', backgroundPosition: 'center', borderRadius: 8 }} role="img" aria-label={p.title} />
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className="course-type-badge">Blog</span>
                    <span className="muted-2" style={{ fontSize: 13 }}>{(p.created_at || '').slice(0, 10)}</span>
                  </div>
                  <h3 className="font-semibold title" style={{ marginTop: 8 }}>{p.title}</h3>
                  <p className="muted-2" style={{ marginTop: 6 }}>{p.excerpt}</p>

                  {/* Stats row */}
                  <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', color: 'var(--muted-2)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}><path d="M12 5c-7 0-11 7-11 7s4 7 11 7 11-7 11-7-4-7-11-7z" stroke="currentColor" strokeWidth="1.2"/></svg>
                        <span>{p.reads ?? 0} Reads</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.2"/></svg>
                        <span>{homeCommentsCount[p.id] ?? 0} Comments</span>
                      </div>
                    </div>

                    {/* intentionally empty cell so stats and actions don't collide */}
                    <div style={{ width: 1, height: 1, opacity: 0 }} />
                  </div>

                  {/* Actions row moved to its own line so it can't overlap */}
                  <div className="home-blog-actions-row">
                    <button
                      className={`btn home-like-btn`}
                      onClick={() => handleHomeLike(p.id)}
                      disabled={!user}
                      aria-disabled={!user}
                      title={!user ? 'Please log in to like this post.' : homeLikedByUser[p.id] ? 'Liked' : 'Like'}
                      aria-pressed={!!homeLikedByUser[p.id]}
                    >
                      <span className="home-like-icon" aria-hidden>&#10084;</span>
                      <span className="home-like-count">{homeLikesLocal[p.id] ?? p.likes ?? 0}</span>
                    </button>

                    <Link href={`/blog`} className="btn btn-cyan home-read-btn" style={{ display: 'inline-flex', alignItems: 'center' }}>
                      Read more
                    </Link>
                  </div>

                </div>
              </article>
            ))}
          </div>

          <div style={{ marginTop: 18, textAlign: 'center' }}>
            <Link href="/blog" className="btn btn-cyan">See all posts</Link>
          </div>
        </section>

        <footer id="contact" className="max-w-5xl mx-auto p-6 sm:p-10">
          <div className="bg-white/5 p-6 rounded-lg shadow">
            <h4 className="font-semibold text-lg text-center title">Get in touch</h4>
           <br/>

            {/* grid-responsive updated to 3 columns at large screens */}
            <div className="grid-responsive">
              {/* Email */}
              {contacts.email ? (
                <a href={`mailto:${contacts.email}`} className="contact-card" aria-label="Send email">
                  <span aria-hidden="true"><IconMail /></span>
                  <div>
                    <div className="contact-title">Email</div>
                    <div className="contact-sub">{contacts.email}</div>
                  </div>
                </a>
              ) : (
                <div className="contact-disabled" aria-hidden="true">
                  <span aria-hidden="true"><IconMail /></span>
                  <div>Email - No link available</div>
                </div>
              )}

              {/* LinkedIn */}
              {contacts.linkedin ? (
                <a href={contacts.linkedin} target="_blank" rel="noopener noreferrer" className="contact-card" aria-label="Open LinkedIn profile">
                  <span aria-hidden="true"><IconLinkedIn /></span>
                  <div>
                    <div className="contact-title">LinkedIn</div>
                    <div className="contact-sub">Profile</div>
                  </div>
                </a>
              ) : (
                <div className="contact-disabled" aria-hidden="true">
                  <span aria-hidden="true"><IconLinkedIn /></span>
                  <div>LinkedIn - No link available</div>
                </div>
              )}

              {/* GitHub */}
              {contacts.github ? (
                <a href={contacts.github} target="_blank" rel="noopener noreferrer" className="contact-card" aria-label="Open GitHub profile">
                  <span aria-hidden="true"><IconGitHub /></span>
                  <div>
                    <div className="contact-title">GitHub</div>
                    <div className="contact-sub">Repos</div>
                  </div>
                </a>
              ) : (
                <div className="contact-disabled" aria-hidden="true">
                  <span aria-hidden="true"><IconGitHub /></span>
                  <div>GitHub - No link available</div>
                </div>
              )}

              {/* YouTube */}
              {contacts.youtube ? (
                <a href={contacts.youtube} target="_blank" rel="noopener noreferrer" className="contact-card" aria-label="Open YouTube channel">
                  <span aria-hidden="true"><IconYouTube /></span>
                  <div>
                    <div className="contact-title">YouTube</div>
                    <div className="contact-sub">Channel</div>
                  </div>
                </a>
              ) : (
                <div className="contact-disabled" aria-hidden="true">
                  <span aria-hidden="true"><IconYouTube /></span>
                  <div>YouTube - No link available</div>
                </div>
              )}

              {/* Facebook */}
              {contacts.facebook ? (
                <a href={contacts.facebook} target="_blank" rel="noopener noreferrer" className="contact-card" aria-label="Open Facebook profile">
                  <span aria-hidden="true"><IconFacebook /></span>
                  <div>
                    <div className="contact-title">Facebook</div>
                    <div className="contact-sub">Profile</div>
                  </div>
                </a>
              ) : (
                <div className="contact-disabled" aria-hidden="true">
                  <span aria-hidden="true"><IconFacebook /></span>
                  <div>Facebook - No link available</div>
                </div>
              )}

              {/* Instagram */}
              {contacts.instagram ? (
                <a href={contacts.instagram} target="_blank" rel="noopener noreferrer" className="contact-card" aria-label="Open Instagram profile">
                  <span aria-hidden="true"><IconInstagram /></span>
                  <div>
                    <div className="contact-title">Instagram</div>
                    <div className="contact-sub">Profile</div>
                  </div>
                </a>
              ) : (
                <div className="contact-disabled" aria-hidden="true">
                  <span aria-hidden="true"><IconInstagram /></span>
                  <div>Instagram - No link available</div>
                </div>
              )}

            </div>
          </div>

          {/* copyright center bottom */}
          <div style={{ textAlign: 'center', marginTop: 14, color: 'var(--muted-2)', fontSize: 13 }}>
            &copy; Kamonasish Roy
          </div>
        </footer>
      </main>
    </div>
  )
}












