// pages/admin.js 
import { useEffect, useState, useMemo, useRef } from "react";
import Head from "next/head";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";


/*
 Admin Dashboard
 - role-based: super_admin / admin / moderator allowed
 - owner (rkamonasish@gmail.com) is ensured super_admin
 - admin can set any role; moderator limited to premium/user
 - owner protected: cannot be demoted by anyone
*/

const OWNER_EMAIL = "rkamonasish@gmail.com";
const ALL_ROLES = ["super_admin", "admin", "moderator", "premium", "user"];
const MODERATOR_ALLOWED = ["premium", "user"];

// rank: higher number = more privilege
const ROLE_RANK = {
  user: 0,
  premium: 1,
  moderator: 2,
  admin: 3,
  super_admin: 4,
};

const normalizeCourseType = (value) => {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return 'Free';
  if (v === 'free' || v === 'premium' || v === 'paid') return v[0].toUpperCase() + v.slice(1);
  if (v === 'cp' || v === 'competitive programming' || v === 'competitive') return 'Free';
  return 'Free';
};

function isValidUrl(value) {
  if (!value) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null); // current admin's profile (with role)
  const [currentUser, setCurrentUser] = useState(null); // auth user (has email)
  const [courses, setCourses] = useState([]);
  const [coursesPage, setCoursesPage] = useState(1);
  const [coursesPageSize, setCoursesPageSize] = useState(10);
  const [courseSearch, setCourseSearch] = useState("");
  const [courseTopicFilter, setCourseTopicFilter] = useState("all");
  const [problems, setProblems] = useState([]);
  const [problemsPage, setProblemsPage] = useState(1);
  const [problemsPageSize, setProblemsPageSize] = useState(20);
  const [problemsTotalCount, setProblemsTotalCount] = useState(0);
  const [problemsLoading, setProblemsLoading] = useState(false);
  const [problemsSearch, setProblemsSearch] = useState("");
  const [problemsDifficulty, setProblemsDifficulty] = useState("all");
  const [problemCourseQuery, setProblemCourseQuery] = useState("");
  const [addProblemCourseId, setAddProblemCourseId] = useState("");
  const [courseProblemCourseId, setCourseProblemCourseId] = useState("");
  const [courseProblemRows, setCourseProblemRows] = useState([]);
  const [courseProblemLoading, setCourseProblemLoading] = useState(false);
  const [courseProblemSearch, setCourseProblemSearch] = useState("");
  const [courseProblemDifficulty, setCourseProblemDifficulty] = useState("all");
  const [courseProblemPage, setCourseProblemPage] = useState(1);
  const [courseProblemPageSize, setCourseProblemPageSize] = useState(20);
  const [courseProblemTotal, setCourseProblemTotal] = useState(0);
  const [courseProblemError, setCourseProblemError] = useState("");
  const isSuperAdmin = (profile?.role || "").toLowerCase() === "super_admin";

  // USERS: pagination / filters
  const [users, setUsers] = useState([]);
  const [usersPage, setUsersPage] = useState(1);
  const [usersPageSize, setUsersPageSize] = useState(20);
  const [usersTotalCount, setUsersTotalCount] = useState(0);
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const usersAbortRef = useRef(null);
  const [usersLoading, setUsersLoading] = useState(false);

  // store pending role selections (so we don't overwrite original u.role before validation)
  const [pendingRoles, setPendingRoles] = useState({});

  // UI/form state for create/edit course
  const [courseTitle, setCourseTitle] = useState("");
  const [courseSlug, setCourseSlug] = useState("");
  // course topics (one-by-one)
  const [courseTopics, setCourseTopics] = useState([]);
  const [topicInput, setTopicInput] = useState("");
  // course meta
  const [courseDescription, setCourseDescription] = useState("");
  const [courseType, setCourseType] = useState("Free");
  const [courseWeeks, setCourseWeeks] = useState("");
  // editing mode
  const [editingCourseId, setEditingCourseId] = useState(null);

  const [probTitle, setProbTitle] = useState("");
  const [probPlatform, setProbPlatform] = useState("Codeforces");
  const [probLink, setProbLink] = useState("");
  const [probDifficulty, setProbDifficulty] = useState("easy");
  const [selectedCourseIds, setSelectedCourseIds] = useState([]); // for problem -> multi course attach
  const [assignCourseId, setAssignCourseId] = useState("");
  const [editingProblemId, setEditingProblemId] = useState(null);

  const [assignUserId, setAssignUserId] = useState("");

  // NEW: solution fields for problem (video + text)
  const [probVideo, setProbVideo] = useState("");
  const [probText, setProbText] = useState("");
  const [probPlatformCustom, setProbPlatformCustom] = useState("");

  const [actionMsg, setActionMsg] = useState(null);
  const [existingProblemsNotice, setExistingProblemsNotice] = useState(null);
  const existingProblemsNoticeTimer = useRef(null);

  // editing topics per existing course: { [courseId]: { editing: bool, topics: [], input: "" } }
  const [editingTopicsMap, setEditingTopicsMap] = useState({});

  // ========== FEATURED PROJECTS STATE (NEW) ==========
  const [featuredProjects, setFeaturedProjects] = useState([]);
  const [fpPage, setFpPage] = useState(1);
  const [fpPageSize, setFpPageSize] = useState(6); // default show 6 per page in admin list
  const [fpTotalCount, setFpTotalCount] = useState(0);
  const [fpLoading, setFpLoading] = useState(false);

  const [fpEditingId, setFpEditingId] = useState(null); // id when editing existing project
  const [fpTitle, setFpTitle] = useState("");
  const [fpDesc, setFpDesc] = useState("");
  const [fpTags, setFpTags] = useState(""); // comma separated
  const [fpThumbnail, setFpThumbnail] = useState("");
  const [fpUrl, setFpUrl] = useState("");
  const [fpGithubUrl, setFpGithubUrl] = useState("");

  const [fpDraggingId, setFpDraggingId] = useState(null);
  const fpAbortRef = useRef(null);

  // derived roles available for operator (keeps stable)
  const rolesForFilter = useMemo(() => ["all", ...ALL_ROLES], []);

  const uniqueCourseTopics = useMemo(() => {
    const set = new Set();
    courses.forEach(c => {
      (Array.isArray(c.topics) ? c.topics : []).forEach(t => {
        if (t) set.add(String(t));
      });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [courses]);

  const filteredCourses = useMemo(() => {
    let list = courses.slice();
    const q = courseSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(c => {
        const title = (c.title || "").toLowerCase();
        const desc = (c.description || "").toLowerCase();
        const topics = (Array.isArray(c.topics) ? c.topics.join(" ") : "").toLowerCase();
        return title.includes(q) || desc.includes(q) || topics.includes(q);
      });
    }
    if (courseTopicFilter !== "all") {
      list = list.filter(c => Array.isArray(c.topics) && c.topics.some(t => String(t).toLowerCase() === courseTopicFilter.toLowerCase()));
    }
    return list;
  }, [courses, courseSearch, courseTopicFilter]);

  const coursesPagesCount = Math.max(1, Math.ceil(filteredCourses.length / coursesPageSize));
  const coursePageStart = (coursesPage - 1) * coursesPageSize;
  const visibleCourses = filteredCourses.slice(coursePageStart, coursePageStart + coursesPageSize);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // get current auth user
        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user ?? null;
        setCurrentUser(user);

        if (!user) {
          // not logged in -> redirect
          window.location.href = "/";
          return;
        }

        // fetch profile row
        const { data: prof, error: profErr } = await supabase
          .from("profiles")
          .select("id, username, display_name, role, is_admin, institution, country, email, is_blocked")
          .eq("id", user.id)
          .single();

        // if owner email, ensure role is super_admin (attempt upsert)
        if (user.email === OWNER_EMAIL) {
          // best-effort: try to upsert role -> super_admin and is_admin true
          try {
            await supabase.from("profiles").upsert(
              { id: user.id, role: "super_admin", is_admin: true },
              { onConflict: "id" }
            );
          } catch (upErr) {
            console.warn("failed to ensure owner super admin:", upErr);
          }
        }

        // re-fetch profile after ensure
        const { data: prof2 } = await supabase
          .from("profiles")
          .select("id, username, display_name, role, is_admin, institution, country, email, is_blocked")
          .eq("id", user.id)
          .single();

        const loadedProfile = prof2 ?? prof ?? null;
        if (!loadedProfile) {
          // no profile — deny access
          window.location.href = "/";
          return;
        }

        // only allow admins/moderators/super_admin
        const allowed = ["super_admin", "admin", "moderator"];
        if (!allowed.includes((loadedProfile.role || "").toLowerCase())) {
          window.location.href = "/";
          return;
        }

        setProfile(loadedProfile);

        // load courses + problems (users load handled separately with pagination)
        await loadCountsAndLists();
        // load first page of users
        await fetchUsersPage({ page: 1, pageSize: usersPageSize, search: userSearch, role: userRoleFilter });

        // load featured projects initial page
        await loadFeaturedProjects({ page: 1, pageSize: fpPageSize });
      } catch (err) {
        console.error("admin init error", err);
        window.location.href = "/";
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch users when userSearch / role filter / page / pageSize changes
  useEffect(() => {
    // reset to page 1 when search or role changes
    setUsersPage(1);
    fetchUsersPage({ page: 1, pageSize: usersPageSize, search: userSearch, role: userRoleFilter });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userSearch, userRoleFilter]);

  useEffect(() => {
    fetchUsersPage({ page: usersPage, pageSize: usersPageSize, search: userSearch, role: userRoleFilter });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usersPage, usersPageSize]);

  // Re-fetch featured projects when page or pageSize changes
  useEffect(() => {
    loadFeaturedProjects({ page: fpPage, pageSize: fpPageSize });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fpPage, fpPageSize]);

  // cancel any in-flight user fetch on unmount
  useEffect(() => {
    return () => {
      if (usersAbortRef.current) {
        try { usersAbortRef.current.abort(); } catch (e) {}
      }
      if (fpAbortRef.current) {
        try { fpAbortRef.current.abort(); } catch (e) {}
      }
    };
  }, []);

  async function fetchProblemsPage(opts = {}) {
    const { page = problemsPage, pageSize = problemsPageSize, search = problemsSearch, difficulty = problemsDifficulty } = opts;
    setProblemsLoading(true);
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let q = supabase
        .from("problems")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });
      const s = String(search || "").trim();
      if (s) {
        const esc = s.replace(/,/g, "");
        q = q.or(`title.ilike.%${esc}%,platform.ilike.%${esc}%`);
      }
      if (difficulty && difficulty !== "all") {
        q = q.eq("difficulty", difficulty);
      }
      const { data, error, count } = await q.range(from, to);
      if (error) console.warn("problems load err", error);
      setProblems(data || []);
      setProblemsTotalCount(typeof count === "number" ? count : 0);
    } catch (err) {
      console.error("fetchProblemsPage failed", err);
    } finally {
      setProblemsLoading(false);
    }
  }

  useEffect(() => {
    fetchProblemsPage({ page: problemsPage, pageSize: problemsPageSize, search: problemsSearch, difficulty: problemsDifficulty });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problemsPage, problemsPageSize, problemsSearch, problemsDifficulty]);

  useEffect(() => {
    fetchCourseProblemsPage({ courseId: courseProblemCourseId, page: courseProblemPage, pageSize: courseProblemPageSize, search: courseProblemSearch, difficulty: courseProblemDifficulty });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseProblemCourseId, courseProblemPage, courseProblemPageSize, courseProblemSearch, courseProblemDifficulty]);

  async function loadCountsAndLists() {
    try {
      const [cRes] = await Promise.all([
        supabase.from("courses").select("*").order("created_at", { ascending: false }),
      ]);
      if (cRes.error) console.warn("courses load err", cRes.error);
      setCourses(cRes.data || []);
      setEditingTopicsMap({});
      await fetchProblemsPage({ page: problemsPage, pageSize: problemsPageSize });
    } catch (err) {
      console.error("loadCountsAndLists failed", err);
    }
  }

  // Fetch a page of users with search + role filter (server-side)
  // NOTE: we now call a server endpoint which uses the service role key to bypass RLS.
  async function fetchUsersPage(opts = {}) {
    const { page = 1, pageSize = 20, search = "", role = "all" } = opts;
    setUsersLoading(true);

    // abort previous
    if (usersAbortRef.current) {
      try { usersAbortRef.current.abort(); } catch (e) {}
    }
    const controller = new AbortController();
    usersAbortRef.current = controller;

    try {
      // build query params
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (search) params.set("search", search);
      if (role) params.set("role", role);

      const url = `/api/admin/list-users?${params.toString()}`;
      const resp = await fetch(url, { signal: controller.signal, method: "GET" });

      if (controller.signal.aborted) {
        setUsersLoading(false);
        return;
      }

      if (!resp.ok) {
        const txt = await resp.text();
        console.warn("fetchUsersPage api error:", resp.status, txt);
        setUsers([]);
        setUsersTotalCount(0);
        setUsersLoading(false);
        return;
      }

      const payload = await resp.json();
      if (!payload || !payload.ok) {
        console.warn("fetchUsersPage payload error:", payload);
        setUsers([]);
        setUsersTotalCount(0);
        setUsersLoading(false);
        return;
      }

      // IMPORTANT FIX:
      // use has_profile / confirmed values returned by the server when present.
      // Do not force has_profile = true for every row.
      const finalUsers = Array.isArray(payload.data)
        ? payload.data.map(r => ({
            // server should ideally return: id, username, display_name, email, role, is_admin, created_at, is_blocked, has_profile (bool), confirmed (bool)
            ...r,
            has_profile: typeof r.has_profile === "boolean" ? r.has_profile : true,
            confirmed: typeof r.confirmed === "boolean" ? r.confirmed : (r.email_confirmed_at ? true : (r.confirmed === undefined ? undefined : r.confirmed)),
          }))
        : [];

      const finalCount = Number(
        // prefer payload.count (server-side pagination/count) else fallback to returned length
        (typeof payload.count !== "undefined" && payload.count !== null) ? payload.count : (finalUsers.length || 0)
      );

      setUsers(finalUsers || []);
      setUsersTotalCount(finalCount);
    } catch (err) {
      if (err && err.name === "AbortError") {
        // ignore
      } else {
        console.error("fetchUsersPage unexpected:", err);
      }
    } finally {
      setUsersLoading(false);
      usersAbortRef.current = null;
    }
  }

  /* ----------------- FEATURED PROJECTS: DATA & CRUD (NEW) ----------------- */

  // Load featured projects (paginated). Order by position desc then created_at desc.
  async function loadFeaturedProjects({ page = 1, pageSize = 6 } = {}) {
    setFpLoading(true);
    // abort previous
    if (fpAbortRef.current) {
      try { fpAbortRef.current.abort(); } catch (e) {}
    }
    const controller = new AbortController();
    fpAbortRef.current = controller;

    try {
      // fetch count separately (supabase client can return count if exact pagination used; to keep it robust, we do two queries)
      const offset = (page - 1) * pageSize;

      const { data: rows, error } = await supabase
        .from("featured_projects")
        .select("id, title, desc, tags, thumbnail, url, github_url, created_at, updated_at, position", { count: "exact" })
        .order("position", { ascending: false })
        .order("created_at", { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (error) {
        console.error("loadFeaturedProjects failed", error);
        setFeaturedProjects([]);
        setFpTotalCount(0);
        return;
      }
      const { count } = (await supabase.from("featured_projects").select("*", { count: "exact" }).maybeSingle()) || {};
      // Note: the above .maybeSingle call returns first row; for reliable count, use separate select with exact count:
      const { count: exactCount } = await (async () => {
        try {
          const c = await supabase.from("featured_projects").select("*", { count: "exact", head: true });
          return { count: c.count ?? 0 };
        } catch (e) {
          return { count: 0 };
        }
      })();

      setFeaturedProjects(rows || []);
      setFpTotalCount(Number(exactCount ?? rows?.length ?? 0));
    } catch (err) {
      console.error("loadFeaturedProjects unexpected", err);
      setFeaturedProjects([]);
      setFpTotalCount(0);
    } finally {
      setFpLoading(false);
      fpAbortRef.current = null;
    }
  }

  async function createOrUpdateFeaturedProject(e) {
    e?.preventDefault?.();
    setActionMsg(null);
    if (!isSuperAdmin) {
      return setActionMsg({ type: "error", text: "Only super_admin can manage featured projects." });
    }

    // validate
    const title = (fpTitle || "").trim();
    if (!title) return setActionMsg({ type: "error", text: "Title is required for featured project" });

    let tagsArray = (fpTags || "").split(",").map(t => t.trim()).filter(Boolean);
    if (tagsArray.length === 0) tagsArray = null;

    try {
      if (fpEditingId) {
        // update
        const payload = {
          title,
          desc: fpDesc || null,
          tags: tagsArray,
          thumbnail: fpThumbnail || null,
          url: fpUrl || null,
          github_url: fpGithubUrl || null,
          updated_at: new Date().toISOString()
        };

        const { error } = await supabase.from("featured_projects").update(payload).eq("id", fpEditingId);
        if (error) throw error;

        setActionMsg({ type: "success", text: "Featured project updated" });
        // refresh current page
        await loadFeaturedProjects({ page: fpPage, pageSize: fpPageSize });
        // reset form
        setFpEditingId(null);
        setFpTitle(""); setFpDesc(""); setFpTags(""); setFpThumbnail(""); setFpUrl("");
        return;
      }

      // create -> set position to max(position)+1 for top placement
      let maxRes = await supabase
        .from("featured_projects")
        .select("position", { head: true, count: "exact" });

      // get current max position (fallback to epoch)
      const { data: all } = await supabase.from("featured_projects").select("position").order("position", { ascending: false }).limit(1);
      const maxPosition = (all && all.length > 0 && typeof all[0].position === "number") ? all[0].position : Math.floor(Date.now() / 1000);

      const payload = {
        title,
        desc: fpDesc || null,
        tags: tagsArray,
        thumbnail: fpThumbnail || null,
        url: fpUrl || null,
        github_url: fpGithubUrl || null,
        position: maxPosition + 1,
      };

      const { data: inserted, error } = await supabase.from("featured_projects").insert([payload]).select().single();
      if (error) throw error;

      setActionMsg({ type: "success", text: "Featured project created" });
      // refresh first page to show newest at top
      await loadFeaturedProjects({ page: 1, pageSize: fpPageSize });
      setFpPage(1);
      // reset form
      setFpTitle(""); setFpDesc(""); setFpTags(""); setFpThumbnail(""); setFpUrl("");
    } catch (err) {
      console.error("createOrUpdateFeaturedProject err", err);
      setActionMsg({ type: "error", text: (err && err.message) || "Failed to save featured project" });
    }
  }

  async function deleteFeaturedProject(id) {
    if (!id) return;
    if (!isSuperAdmin) {
      return setActionMsg({ type: "error", text: "Only super_admin can manage featured projects." });
    }
    if (!confirm("Delete this featured project? This cannot be undone.")) return;
    try {
      const { error } = await supabase.from("featured_projects").delete().eq("id", id);
      if (error) throw error;
      setActionMsg({ type: "success", text: "Featured project deleted" });
      // reload page (if last item on page removed maybe move page back)
      const nextCount = Math.max(0, fpTotalCount - 1);
      const maxPage = Math.max(1, Math.ceil(nextCount / fpPageSize));
      if (fpPage > maxPage) setFpPage(maxPage);
      await loadFeaturedProjects({ page: fpPage, pageSize: fpPageSize });
    } catch (err) {
      console.error("deleteFeaturedProject err", err);
      setActionMsg({ type: "error", text: err?.message || "Delete failed" });
    }
  }

  // Drag/Drop handlers (HTML5)
  function onDragStartFp(e, id) {
    if (!isSuperAdmin) return;
    setFpDraggingId(id);
    try { e.dataTransfer?.setData("text/plain", id); } catch (e) {}
  }
  function onDragOverFp(e, overId) {
    if (!isSuperAdmin) return;
    e.preventDefault();
    // highlight could be added
  }
  function onDropFp(e, overId) {
    if (!isSuperAdmin) return;
    e.preventDefault();
    const draggedId = fpDraggingId ?? e.dataTransfer?.getData("text/plain");
    if (!draggedId) return;
    if (draggedId === overId) {
      setFpDraggingId(null);
      return;
    }

    // reorder locally: move dragged item before overId
    setFeaturedProjects(prev => {
      const list = Array.isArray(prev) ? [...prev] : [];
      const fromIndex = list.findIndex(it => it.id === draggedId);
      const toIndex = list.findIndex(it => it.id === overId);
      if (fromIndex === -1 || toIndex === -1) return list;
      const [item] = list.splice(fromIndex, 1);
      list.splice(toIndex, 0, item);
      return list;
    });
    setFpDraggingId(null);
  }

  // Persist new order to DB. We'll write positions based on array index (higher index => higher position value so it shows at top)
  async function saveFeaturedOrder() {
    try {
      setActionMsg(null);
      if (!isSuperAdmin) {
        return setActionMsg({ type: "error", text: "Only super_admin can manage featured projects." });
      }
      // compute new position values - assign descending integers: start from N -> 1
      const list = featuredProjects || [];
      const n = list.length;
      // We'll assign position = n - index (so index 0 => position n)
      // But to give gaps for future inserts, multiply by 10
      const updates = list.map((item, idx) => ({
        id: item.id,
        position: (n - idx) * 10
      }));

      // perform updates sequentially (batched requests may be added but sequential is fine)
      for (const u of updates) {
        const { error } = await supabase.from("featured_projects").update({ position: u.position }).eq("id", u.id);
        if (error) {
          throw error;
        }
      }

      setActionMsg({ type: "success", text: "Order saved" });
      // reload current page
      await loadFeaturedProjects({ page: fpPage, pageSize: fpPageSize });
    } catch (err) {
      console.error("saveFeaturedOrder err", err);
      setActionMsg({ type: "error", text: err?.message || "Failed to save order" });
    }
  }

  async function startEditFeatured(project) {
    if (!project) return;
    if (!isSuperAdmin) {
      return setActionMsg({ type: "error", text: "Only super_admin can manage featured projects." });
    }
    setFpEditingId(project.id);
    setFpTitle(project.title || "");
    setFpDesc(project.desc || "");
    setFpTags(Array.isArray(project.tags) ? (project.tags || []).join(", ") : (project.tags || ""));
    setFpThumbnail(project.thumbnail || "");
    setFpUrl(project.url || "");
    setFpGithubUrl(project.github_url || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function cancelEditFeatured() {
    setFpEditingId(null);
    setFpTitle(""); setFpDesc(""); setFpTags(""); setFpThumbnail(""); setFpUrl(""); setFpGithubUrl("");
  }

  /* ----------------- Course / Problem / Enrollment actions (unchanged) ----------------- */

  // add a topic to the create-course local list
  function addTopicLocal(e) {
    e?.preventDefault();
    const t = (topicInput || "").trim();
    if (!t) return;
    if (courseTopics.length >= 10) {
      setActionMsg({ type: "error", text: "Max 10 topics allowed." });
      return;
    }
    setCourseTopics(prev => [...prev, t]);
    setTopicInput("");
    setActionMsg(null);
  }

  function removeTopicLocal(idx) {
    setCourseTopics(prev => prev.filter((_, i) => i !== idx));
  }

  function editTopicLocal(idx, newValue) {
    setCourseTopics(prev => prev.map((v, i) => i === idx ? newValue.trim() : v));
  }

  // create or update course (single handler)
  async function createOrUpdateCourse(e) {
    e?.preventDefault();
    if (!courseTitle || !courseSlug) return setActionMsg({ type: "error", text: "Title and slug required" });

    try {
      const payload = {
        title: courseTitle,
        slug: courseSlug,
        topics: (courseTopics && courseTopics.length) ? courseTopics.slice(0, 10) : null,
        description: courseDescription || null,
        course_type: courseType || null,
        weeks: courseWeeks ? String(courseWeeks).trim() : null,
      };

      if (editingCourseId) {
        const { error } = await supabase.from("courses").update(payload).eq("id", editingCourseId);
        if (error) throw error;
        setActionMsg({ type: "success", text: "Course updated" });
      } else {
        const { error } = await supabase.from("courses").insert([payload]);
        if (error) throw error;
        setActionMsg({ type: "success", text: "Course created" });
      }

      // reset form
      setCourseTitle(""); setCourseSlug("");
      setCourseDescription(""); setCourseType("Free"); setCourseWeeks("");
      setCourseTopics([]); setTopicInput("");
      setEditingCourseId(null);

      await loadCountsAndLists();
    } catch (err) {
      console.error(err);
      setActionMsg({ type: "error", text: err.message || "Create/update course failed" });
    }
  }

  async function deleteCourse(courseId) {
    if (!confirm("Delete this course? This will remove the course row (course_problems and enrollments may remain unless you handle them separately).")) return;
    try {
      const { error } = await supabase.from("courses").delete().eq("id", courseId);
      if (error) throw error;
      setActionMsg({ type: "success", text: "Course deleted" });
      await loadCountsAndLists();
      if (editingCourseId === courseId) {
        setEditingCourseId(null);
        setCourseTitle(""); setCourseSlug(""); setCourseDescription(""); setCourseTopics([]); setTopicInput("");
      }
    } catch (err) {
      console.error(err);
      setActionMsg({ type: "error", text: err.message || "Delete failed" });
    }
  }

  function startEditCourse(course) {
    setEditingCourseId(course.id);
    setCourseTitle(course.title || "");
    setCourseSlug(course.slug || "");
    setCourseDescription(course.description || "");
    setCourseType(normalizeCourseType(course.course_type));
    setCourseWeeks(course.weeks || "");
    setCourseTopics(Array.isArray(course.topics) ? [...course.topics] : []);
    setTopicInput("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEditCourse() {
    setEditingCourseId(null);
    setCourseTitle(""); setCourseSlug(""); setCourseDescription(""); setCourseType("Free"); setCourseWeeks("");
    setCourseTopics([]); setTopicInput("");
  }

  function resetProblemForm() {
    setProbTitle("");
    setProbPlatform("Codeforces");
    setProbPlatformCustom("");
    setProbLink("");
    setProbDifficulty("easy");
    setSelectedCourseIds([]);
    setProbVideo("");
    setProbText("");
    setEditingProblemId(null);
  }

  const filteredProblemCourses = useMemo(() => {
    const q = (problemCourseQuery || "").trim().toLowerCase();
    if (!q) return courses || [];
    return (courses || []).filter(c => (c.title || "").toLowerCase().includes(q));
  }, [courses, problemCourseQuery]);

  const toggleProblemCourse = (courseId) => {
    setSelectedCourseIds(prev => (
      prev.includes(courseId) ? prev.filter(id => id !== courseId) : [...prev, courseId]
    ));
  };

  const showExistingProblemsNotice = (type, text) => {
    setExistingProblemsNotice({ type, text });
    if (existingProblemsNoticeTimer.current) clearTimeout(existingProblemsNoticeTimer.current);
    existingProblemsNoticeTimer.current = setTimeout(() => setExistingProblemsNotice(null), 3000);
  };

  async function fetchCourseProblemsPage(opts = {}) {
    const {
      courseId = courseProblemCourseId,
      page = courseProblemPage,
      pageSize = courseProblemPageSize,
      search = courseProblemSearch,
      difficulty = courseProblemDifficulty,
    } = opts;

    if (!courseId) {
      setCourseProblemRows([]);
      setCourseProblemTotal(0);
      return;
    }

    setCourseProblemLoading(true);
    setCourseProblemError("");
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let q = supabase
        .from("course_problems")
        .select("id, course_id, problem_id, problems(id,title,platform,difficulty)", { count: "exact" })
        .eq("course_id", courseId);

      if (search && search.trim()) {
        const term = search.trim();
        q = q.or(`problems.title.ilike.%${term}%,problems.platform.ilike.%${term}%`);
      }
      if (difficulty && difficulty !== "all") {
        q = q.eq("problems.difficulty", difficulty);
      }

      const { data, error, count } = await q.range(from, to);
      if (error) {
        console.warn("course_problems page load err", error);
        setCourseProblemError("Failed to load course problems.");
        setCourseProblemRows([]);
        setCourseProblemTotal(0);
        return;
      }
      setCourseProblemRows(data || []);
      setCourseProblemTotal(typeof count === "number" ? count : 0);
    } catch (err) {
      console.error("fetchCourseProblemsPage failed", err);
      setCourseProblemError("Failed to load course problems.");
      setCourseProblemRows([]);
      setCourseProblemTotal(0);
    } finally {
      setCourseProblemLoading(false);
    }
  }

  function startEditProblem(p) {
    if (!p) return;
    setEditingProblemId(p.id);
    setProbTitle(p.title || "");
    const knownPlatforms = ["Codeforces", "SeriousOJ", "Atcoder", "Codechef"];
    const pPlatform = p.platform || "Codeforces";
    if (knownPlatforms.includes(pPlatform)) {
      setProbPlatform(pPlatform);
      setProbPlatformCustom("");
    } else {
      setProbPlatform("Other");
      setProbPlatformCustom(pPlatform);
    }
    setProbLink(p.link || "");
    setProbDifficulty(p.difficulty || "easy");
    setProbVideo(p.video_solution || "");
    setProbText(p.text_solution || p.solution || "");
    setSelectedCourseIds([]);
    setTimeout(() => {
      const el = document.getElementById("problem-form");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function cancelEditProblem() {
    resetProblemForm();
  }

  // addProblem: performs validation + schema-defensive insert/update
  async function addProblem(e) {
    e?.preventDefault();
    setActionMsg(null);

    const finalPlatform = probPlatform === "Other" ? (probPlatformCustom || "").trim() : probPlatform;
    if (!probTitle || !finalPlatform) return setActionMsg({ type: "error", text: "Title and platform required" });

    if (probLink && !isValidUrl(probLink)) {
      return setActionMsg({ type: "error", text: "Problem link looks invalid. Use a full URL (https://...)" });
    }

    if (probVideo && !isValidUrl(probVideo) && probVideo.trim() !== "") {
      return setActionMsg({ type: "error", text: "Video solution looks like a URL but it's invalid. Use full URL (https://...)" });
    }

    const videoVal = probVideo && String(probVideo).trim() ? String(probVideo).trim() : null;
    const textVal = probText && String(probText).trim() ? String(probText).trim() : null;

    try {
      if (editingProblemId) {
        const updatePayload = {
          title: probTitle,
          platform: finalPlatform,
          link: probLink || null,
          difficulty: probDifficulty,
          video_solution: videoVal,
          text_solution: textVal,
        };

        const { error } = await supabase
          .from("problems")
          .update(updatePayload)
          .eq("id", editingProblemId);

        if (error) {
          console.warn("Preferred update failed, will try fallback:", error);
          const fallbackPayload = {
            title: probTitle,
            platform: finalPlatform,
            link: probLink || null,
            difficulty: probDifficulty,
            solution: textVal || videoVal || null,
          };

          const { error: err2 } = await supabase
            .from("problems")
            .update(fallbackPayload)
            .eq("id", editingProblemId);
          if (err2) throw err2;

          resetProblemForm();
          await loadCountsAndLists();
          setActionMsg({
            type: "warning",
            text: "Problem updated using legacy `solution` column. `video_solution` / `text_solution` columns are missing, so separate video/text links cannot be saved. Add those columns in Supabase."
          });
          return;
        }

        resetProblemForm();
        await loadCountsAndLists();
        setActionMsg({ type: "success", text: "Problem updated" });
        return;
      }

      const payload = {
        title: probTitle,
        platform: finalPlatform,
        link: probLink || null,
        difficulty: probDifficulty,
        created_by: profile.id,
        video_solution: videoVal,
        text_solution: textVal,
      };

      const { data: newProb, error } = await supabase
        .from("problems")
        .insert([payload])
        .select()
        .single();

      if (error) {
        console.warn("Preferred insert failed, will try fallback:", error);
        const fallbackPayload = {
          title: probTitle,
          platform: finalPlatform,
          link: probLink || null,
          difficulty: probDifficulty,
          created_by: profile.id,
          solution: probText && String(probText).trim() ? String(probText).trim() : (probVideo && String(probVideo).trim() ? String(probVideo).trim() : null),
        };

        const { data: newProb2, error: err2 } = await supabase
          .from("problems")
          .insert([fallbackPayload])
          .select()
          .single();

        if (err2) throw err2;
      if (selectedCourseIds && selectedCourseIds.length > 0) {
        const rows = selectedCourseIds.map(courseId => ({ course_id: courseId, problem_id: newProb2.id }));
        const { error: cpErr } = await supabase.from("course_problems").insert(rows);
        if (cpErr) throw cpErr;
      }

        resetProblemForm();
        await loadCountsAndLists();
        setActionMsg({
          type: "warning",
          text: "Problem added using legacy `solution` column. `video_solution` / `text_solution` columns are missing, so separate video/text links cannot be saved. Add those columns in Supabase."
        });
        return;
      }

      if (selectedCourseIds && selectedCourseIds.length > 0) {
        const rows = selectedCourseIds.map(courseId => ({ course_id: courseId, problem_id: newProb.id }));
        const { error: cpErr } = await supabase.from("course_problems").insert(rows);
        if (cpErr) throw cpErr;
      }

      resetProblemForm();
      await loadCountsAndLists();
      setActionMsg({ type: "success", text: "Problem added" });
    } catch (err) {
      console.error(err);
      setActionMsg({ type: "error", text: err.message || "Add problem failed" });
    }
  }

  async function assignUser(e) {
    e?.preventDefault();
    if (!assignUserId || !assignCourseId) return setActionMsg({ type: "error", text: "Pick a user and a course" });

    try {
      const { error } = await supabase.from("enrollments").insert([{
        user_id: assignUserId,
        course_id: assignCourseId
      }]);
      if (error) throw error;
      setActionMsg({ type: "success", text: "User assigned to course" });
    } catch (err) {
      console.error(err);
      setActionMsg({ type: "error", text: err.message || "Assign failed" });
    }
  }

  /* ----------------- Role management ----------------- */

  // resolve allowed roles for current operator
  function getAllowedRolesForOperator() {
    const r = (profile?.role || "").toLowerCase();
    if (r === "super_admin") return ALL_ROLES;
    if (r === "admin") {
      // admin can set roles strictly lower than admin
      return ALL_ROLES.filter(role => (ROLE_RANK[role] ?? 0) < ROLE_RANK["admin"]);
    }
    if (r === "moderator") return MODERATOR_ALLOWED;
    return ["user"];
  }

  // helper: check whether operator can change/upsert target -> desired
  function canOperatorChangeTarget(operatorRole, targetRole, desiredRole, targetEmail) {
    const op = (operatorRole || "user").toLowerCase();
    const t = (targetRole || "user").toLowerCase();
    const d = (desiredRole || "user").toLowerCase();

    // protect owner by email
    if (targetEmail === OWNER_EMAIL) return { allowed: false, reason: "Cannot change owner role" };

    const opRank = ROLE_RANK[op] ?? 0;
    const tRank = ROLE_RANK[t] ?? 0;
    const dRank = ROLE_RANK[d] ?? 0;

    // operator must be strictly higher than target (can't change peers or seniors), except super_admin
    if (!(op === "super_admin") && opRank <= tRank) {
      return { allowed: false, reason: "You cannot change this user's role (target has equal or higher role)" };
    }

    // desired role must be lower than operator, except super_admin may create other super_admins
    if (op !== "super_admin" && dRank >= opRank) {
      return { allowed: false, reason: "You are not allowed to set that role" };
    }

    // if op is super_admin, allow everything except owner (handled above)
    return { allowed: true };
  }

  // helper: whether operator is allowed to INSERT a new profiles row (we allow super_admins or users whose profile has is_admin true)
  function operatorCanInsertProfile() {
    if (!profile) return false;
    if ((profile.role || "").toLowerCase() === "super_admin") return true;
    if (profile.is_admin === true) return true; // existing admin-flagged user
    return false;
  }

  // set role for a given profile id (used programmatically)
  async function setRoleForProfileId(profileId, role) {
    if (!profileId) return { error: "no profile id" };
    try {
      // find target in current users list (best-effort)
      const target = users.find(u => u.id === profileId) || null;
      const targetRole = (target?.role || "user").toLowerCase();
      const targetEmail = target?.email ?? null;
      // has_profile no longer needed here (server handles insert/upsert)

      if (profileId === profile.id) {
        return { error: "You cannot change your own role" };
      }

      const check = canOperatorChangeTarget(profile.role, targetRole, role, targetEmail);
      if (!check.allowed) return { error: check.reason || "Not allowed" };

      // server-side call (service role) to bypass RLS safely
      const s = await supabase.auth.getSession();
      const token = s?.data?.session?.access_token;
      if (!token) return { error: "Not signed in (no session token)" };

      const res = await fetch("/api/admin/set-role", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ profileId, role }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { error: json?.error || json?.message || "Failed to update role" };

      // refresh users list (current page)
      await fetchUsersPage({ page: usersPage, pageSize: usersPageSize, search: userSearch, role: userRoleFilter });
      return { ok: true };
    } catch (err) {
      return { error: err };
    }
  }

  // inline change from users list
  async function handleInlineSetRole(uId, desired) {
    setActionMsg(null);

    // find the target in current users array
    const target = users.find(u => u.id === uId) || null;
    const targetRole = (target?.role || "user").toLowerCase();
    const targetEmail = target?.email ?? null;
    // has_profile no longer needed here (server handles insert/upsert)

    if (!target) {
      setActionMsg({ type: "error", text: "Target user not found (refresh list)" });
      return;
    }

    const allowedRoles = getAllowedRolesForOperator();
    if (!allowedRoles.includes((desired || "user").toLowerCase()) && profile.role?.toLowerCase() !== "super_admin") {
      return setActionMsg({ type: "error", text: "Not allowed to set that role" });
    }

    if (uId === profile.id) {
      return setActionMsg({ type: "error", text: "You cannot change your own role." });
    }

    const check = canOperatorChangeTarget(profile.role, targetRole, desired, targetEmail);
    if (!check.allowed) {
      return setActionMsg({ type: "error", text: check.reason || "Not allowed" });
    }

    try {
      const s = await supabase.auth.getSession();
      const token = s?.data?.session?.access_token;
      if (!token) {
        return setActionMsg({ type: "error", text: "Not signed in (no session token)" });
      }

      const res = await fetch("/api/admin/set-role", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ profileId: uId, role: desired }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || json?.message || "Failed to update role");

      // success: update local list to reflect new role and clear pending
      setUsers(prev => prev.map(x => x.id === uId ? { ...x, role: desired, has_profile: true } : x));
      setPendingRoles(prev => {
        const c = { ...prev };
        delete c[uId];
        return c;
      });

      setActionMsg({ type: "success", text: "Role updated" });
      // optional: refresh page data
      await fetchUsersPage({ page: usersPage, pageSize: usersPageSize, search: userSearch, role: userRoleFilter });
    } catch (err) {
      console.error(err);
      setActionMsg({ type: "error", text: err.message || "Failed to update role" });
    }
  }

  /* ----------------- Block / Delete user (new) ----------------- */

  // operator-level helpers
  function isOperatorSuper() {
    return (profile?.role || "").toLowerCase() === "super_admin";
  }

  function operatorCanActOnTarget(u) {
    // used for block/delete: only super_admin allowed per DB trigger/policy
    if (!profile) return false;
    if (!u) return false;
    // cannot act on owner or self
    if (u.email === OWNER_EMAIL) return false;
    if (u.id === profile.id) return false;
    // only super_admin allowed (DB enforces this too)
    return isOperatorSuper();
  }

  // toggle block/unblock
  async function toggleBlock(uId, block) {
    setActionMsg(null);
    const target = users.find(u => u.id === uId) || null;
    if (!target) {
      setActionMsg({ type: "error", text: "User not found" });
      return;
    }
    if (!operatorCanActOnTarget(target)) {
      setActionMsg({ type: "error", text: "Not allowed to block/unblock this user" });
      return;
    }
    if (!confirm(`${block ? "Block" : "Unblock"} user ${target.email || target.id}?`)) return;

    try {
      const s = await supabase.auth.getSession();
      const token = s?.data?.session?.access_token;
      if (!token) {
        setActionMsg({ type: "error", text: "Not signed in (no session token)" });
        return;
      }

      const res = await fetch("/api/admin/block-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: uId, block }),
      });

      const json = await res.json();
      if (!res.ok) {
        const msg = (json && (json.error || json.message)) || `Failed to update block status (status ${res.status})`;
        setActionMsg({ type: "error", text: msg });
        return;
      }

      setUsers(prev => prev.map(u => u.id === uId ? { ...u, is_blocked: block, has_profile: true } : u));
      setActionMsg({ type: "success", text: `User ${block ? "blocked" : "unblocked"}` });
    } catch (err) {
      console.error("toggleBlock err", err);
      const msg = err?.message || (err?.error_description || "Failed to update block status");
      setActionMsg({ type: "error", text: msg });
    }
  }

  // delete profile row (note: deleting auth.users requires server-side service role)
  // delete profile + auth user (server-side)
async function removeUser(uId) {
  setActionMsg(null);
  const target = users.find(u => u.id === uId) || null;
  if (!target) {
    setActionMsg({ type: "error", text: "User not found" });
    return;
  }
  // same client-side checks as before
  if (target.email === OWNER_EMAIL) {
    setActionMsg({ type: "error", text: "You cannot remove the owner" });
    return;
  }
  if (target.id === profile.id) {
    setActionMsg({ type: "error", text: "You cannot remove your own account" });
    return;
  }
  if (!confirm(`Permanently remove user ${target.email || target.id}? This will delete the Auth user and the profiles row.`)) return;

  try {
    // get current session token to authenticate the API call (must be super_admin)
    const s = await supabase.auth.getSession();
    const token = s?.data?.session?.access_token;
    if (!token) {
      setActionMsg({ type: "error", text: "Not signed in (no session token)" });
      return;
    }

    const res = await fetch("/api/admin/delete-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ userId: uId }),
    });

    const json = await res.json();
    if (!res.ok) {
      const msg = (json && (json.error || json.message)) || `Delete failed (status ${res.status})`;
      setActionMsg({ type: "error", text: msg });
      return;
    }

    // success -> remove from local list
    setUsers(prev => prev.filter(u => u.id !== uId));
    setActionMsg({ type: "success", text: json.message || "User permanently removed." });
  } catch (err) {
    console.error("removeUser (permanent) error", err);
    setActionMsg({ type: "error", text: err?.message || "Failed to remove user" });
  }
}


  /* ------------- Editing topics for existing courses ------------- */

  function startEditTopics(course) {
    setEditingTopicsMap(prev => ({
      ...prev,
      [course.id]: {
        editing: true,
        topics: Array.isArray(course.topics) ? [...course.topics] : [],
        input: ""
      }
    }));
  }

  function cancelEditTopics(courseId) {
    setEditingTopicsMap(prev => {
      const copy = { ...prev };
      delete copy[courseId];
      return copy;
    });
  }

  function editTopicsAdd(courseId) {
    setEditingTopicsMap(prev => {
      const item = prev[courseId];
      if (!item) return prev;
      const val = (item.input || "").trim();
      if (!val) return prev;
      if ((item.topics || []).length >= 10) {
        setActionMsg({ type: "error", text: "Max 10 topics allowed per course." });
        return prev;
      }
      return {
        ...prev,
        [courseId]: {
          ...item,
          topics: [...(item.topics || []), val],
          input: ""
        }
      };
    });
  }

  function editTopicsRemove(courseId, idx) {
    setEditingTopicsMap(prev => {
      const item = prev[courseId];
      if (!item) return prev;
      return {
        ...prev,
        [courseId]: {
          ...item,
          topics: item.topics.filter((_, i) => i !== idx)
        }
      };
    });
  }

  function editTopicsUpdateValue(courseId, idx, newVal) {
    setEditingTopicsMap(prev => {
      const item = prev[courseId];
      if (!item) return prev;
      const newTopics = item.topics.map((t, i) => i === idx ? newVal.trim() : t);
      return {
        ...prev,
        [courseId]: {
          ...item,
          topics: newTopics
        }
      };
    });
  }

  async function saveEditedTopics(courseId) {
    const item = editingTopicsMap[courseId];
    if (!item) return;
    try {
      const topicsToSave = (item.topics || []).slice(0, 10);
      const { error } = await supabase.from("courses").update({ topics: topicsToSave }).eq("id", courseId);
      if (error) throw error;
      setActionMsg({ type: "success", text: "Topics updated" });
      await loadCountsAndLists();
    } catch (err) {
      console.error(err);
      setActionMsg({ type: "error", text: err.message || "Save topics failed" });
    } finally {
      cancelEditTopics(courseId);
    }
  }

  if (loading) return <div className="p-6">Loading admin panel…</div>;

  // render
  const usersPagesCount = Math.max(1, Math.ceil((usersTotalCount || 0) / usersPageSize));
  const fpPagesCount = Math.max(1, Math.ceil((fpTotalCount || 0) / fpPageSize));
  const problemsPagesCount = Math.max(1, Math.ceil((problemsTotalCount || 0) / problemsPageSize));

  return (
    <div>
      <Head>
        <title>Admin Dashboard</title>
      </Head>

      <main
        className="min-h-screen p-6 admin-root"
        style={{
          background: "#071029",
          backgroundImage: "linear-gradient(rgba(0,210,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,210,255,0.03) 1px, transparent 1px)",
          backgroundSize: "50px 50px"
        }}
      >
        <div className="max-w-6xl mx-auto admin-shell">
          {/* header: centered title, back button on right */}
          <header className="admin-header">
            <h1 className="admin-title">Admin Dashboard</h1>
            <div className="admin-header-action">
              <Link href="/" className="btn back-btn">Back to homepage</Link>
            </div>
          </header>

          <nav className="admin-nav" aria-label="Admin features">
            <a className="admin-nav-link" href="#create-course">Create Course</a>
            <a className="admin-nav-link" href="#add-problem">Add Problem</a>
            <a className="admin-nav-link" href="#assign-user">Assign User</a>
            <a className="admin-nav-link" href="#quick-stats">Quick Stats</a>
            <a className="admin-nav-link" href="#featured-projects">Featured Projects</a>
            <a className="admin-nav-link" href="#courses">Courses</a>
            <a className="admin-nav-link" href="#users">Users</a>
            <a className="admin-nav-link" href="#problems">Problems</a>
            <a className="admin-nav-link" href="#course-problems">Course‑wise Problems</a>
          </nav>

          {/* status */}
          {actionMsg && (
            <div style={{ marginBottom: 12 }}>
              <div style={{
                padding: 10,
                borderRadius: 8,
                background: actionMsg.type === "error" ? "rgba(244,63,94,0.12)" : actionMsg.type === "success" ? "rgba(16,185,129,0.08)" : "rgba(255,255,255,0.02)",
                color: actionMsg.type === "error" ? "#fecaca" : actionMsg.type === "success" ? "#bbf7d0" : "rgba(255,255,255,0.8)"
              }}>{actionMsg.text}</div>
            </div>
          )}

          <section className="grid md:grid-cols-2 gap-6 mb-6 admin-section">

            <div className="card p-4 hover-card" id="create-course">
              <h3 className="card-title">{editingCourseId ? "Edit Course" : "Create Course"}</h3>
              <form onSubmit={createOrUpdateCourse} className="space-y-3">
                <input value={courseTitle} onChange={e => setCourseTitle(e.target.value)} placeholder="Course title" className="w-full p-2 field" />
                <input value={courseSlug} onChange={e => setCourseSlug(e.target.value)} placeholder="slug (e.g. cp-foundations)" className="w-full p-2 field" />

                {/* Topics input - one by one */}
                <div>
                  <label style={{ display: "block", marginBottom: 6, color: "var(--muted-2)" }}>Topics (add one-by-one, max 10)</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      value={topicInput}
                      onChange={e => setTopicInput(e.target.value)}
                      placeholder="Topic name (e.g. Graphs)"
                      className="w-full p-2 field"
                    />
                    <button className="btn btn-cyan" type="button" onClick={addTopicLocal}>Add</button>
                  </div>

                  {courseTopics.length > 0 && (
                    <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                      {courseTopics.map((t, i) => (
                        <li key={i} style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ flex: 1, color: "var(--muted-2)" }}>{t}</span>
                          <button type="button" className="btn" onClick={() => {
                            const newVal = prompt("Edit topic", t);
                            if (newVal === null) return;
                            if (!newVal.trim()) {
                              if (!confirm("Remove this topic?")) return;
                              removeTopicLocal(i);
                            } else {
                              editTopicLocal(i, newVal);
                            }
                          }}>Edit</button>
                          <button type="button" className="btn" onClick={() => { if (confirm("Delete topic?")) removeTopicLocal(i); }}>Delete</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* description (optional) */}
                <textarea
                  value={courseDescription}
                  onChange={(e) => setCourseDescription(e.target.value)}
                  placeholder="Short description (optional)"
                  className="w-full p-2 field"
                  rows={2}
                />

                <div style={{ display: "flex", gap: 8 }}>
                  <select value={courseType} onChange={(e) => setCourseType(e.target.value)} className="w-1/2 p-2 field">
                    <option value="Free">Free</option>
                    <option value="Premium">Premium</option>
                    <option value="Paid">Paid</option>
                  </select>
                  <input value={courseWeeks} onChange={(e) => setCourseWeeks(e.target.value)} placeholder="Weeks (optional)" className="w-1/2 p-2 field" />
                </div>

                <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                  <button className="btn btn-cyan" type="submit">{editingCourseId ? "Save changes" : "Create Course"}</button>
                  {editingCourseId && <button type="button" className="btn" onClick={cancelEditCourse}>Cancel</button>}
                </div>
              </form>
            </div>

            <div className="card p-4 hover-card" id="add-problem">
              <h3 className="card-title">{editingProblemId ? "Edit Problem" : "Add Problem"}</h3>
              <form onSubmit={addProblem} className="space-y-3">
                <input value={probTitle} onChange={e => setProbTitle(e.target.value)} placeholder="Problem title" className="w-full p-2 field" />
                <select value={probPlatform} onChange={e => setProbPlatform(e.target.value)} className="w-full p-2 field">
                  <option value="Codeforces">Codeforces</option>
                  <option value="SeriousOJ">SeriousOJ</option>
                  <option value="Atcoder">Atcoder</option>
                  <option value="Codechef">Codechef</option>
                  <option value="Other">Other</option>
                </select>
                {probPlatform === "Other" ? (
                  <input
                    value={probPlatformCustom}
                    onChange={(e) => setProbPlatformCustom(e.target.value)}
                    placeholder="Platform name..."
                    className="w-full p-2 field"
                  />
                ) : null}
                <input value={probLink} onChange={e => setProbLink(e.target.value)} placeholder="Link (optional) — any site" className="w-full p-2 field" />

                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={probVideo}
                    onChange={(e) => setProbVideo(e.target.value)}
                    placeholder="Video solution (any link or text)"
                    className="w-1/2 p-2 field"
                  />
                  <div style={{ alignSelf: "center", color: "var(--muted-2)", fontSize: 12 }}>🎥</div>
                </div>

                <textarea
                  value={probText}
                  onChange={(e) => setProbText(e.target.value)}
                  placeholder="Text solution (paste explanation or a link) - optional"
                  className="w-full p-2 field"
                  rows={4}
                />

                <select value={probDifficulty} onChange={(e) => setProbDifficulty(e.target.value)} className="w-full p-2 field">
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
                <div className="multi-course-wrap">
                  <div className="multi-course-header">
                    <input
                      className="w-full p-2 field"
                      placeholder="Search courses..."
                      value={problemCourseQuery}
                      onChange={(e) => setProblemCourseQuery(e.target.value)}
                      disabled={!!editingProblemId}
                    />
                    <div className="multi-course-actions">
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={!!editingProblemId || filteredProblemCourses.length === 0}
                        onClick={() => setSelectedCourseIds(filteredProblemCourses.map(c => c.id))}
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={!!editingProblemId || selectedCourseIds.length === 0}
                        onClick={() => setSelectedCourseIds([])}
                      >
                        Clear
                      </button>
                      <span className="multi-course-count">{selectedCourseIds.length} selected</span>
                    </div>
                  </div>
                  <div className={`multi-course-list ${editingProblemId ? 'disabled' : ''}`}>
                    {filteredProblemCourses.length === 0 ? (
                      <div className="muted-2" style={{ padding: 8 }}>No courses match.</div>
                    ) : (
                      filteredProblemCourses.map(c => (
                        <label key={c.id} className="multi-course-item">
                          <input
                            type="checkbox"
                            checked={selectedCourseIds.includes(c.id)}
                            onChange={() => toggleProblemCourse(c.id)}
                            disabled={!!editingProblemId}
                          />
                          <span>{c.title}</span>
                        </label>
                      ))
                    )}
                  </div>
                  <div className="multi-course-hint">
                    {editingProblemId ? "Course attachment is disabled while editing." : "Attach this problem to multiple courses."}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                  <button className="btn btn-cyan" type="submit">{editingProblemId ? "Save Changes" : "Add Problem"}</button>
                  {editingProblemId && <button className="btn" type="button" onClick={cancelEditProblem}>Cancel</button>}
                </div>
              </form>
            </div>

          </section>

          <section className="grid md:grid-cols-3 gap-6 mb-6 admin-section">
            <div className="card p-4 hover-card" id="assign-user">
              <h3 className="card-title">Assign User</h3>
              <form onSubmit={assignUser} className="space-y-3">
                <select className="w-full p-2 field" value={assignUserId} onChange={e => setAssignUserId(e.target.value)}>
                  <option value="">— pick user —</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.display_name || u.username || (u.email || u.id)}</option>)}
                </select>
                <select className="w-full p-2 field" value={assignCourseId} onChange={e => setAssignCourseId(e.target.value)}>
                  <option value="">— pick course —</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
                <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                  <button className="btn btn-cyan" type="submit">Assign</button>
                </div>
              </form>
            </div>

            {/* NOTE: Set-by-email removed — inline user list handles role changes now */}
            <div className="card p-4 hover-card" id="quick-stats">
              <h3 className="card-title">Quick Stats</h3>
              <div className="quick-stats">
                <div className="quick-stat">
                  <span>Total Courses</span>
                  <strong>{courses.length}</strong>
                </div>
                <div className="quick-stat">
                  <span>Total Problems</span>
                  <strong>{problemsTotalCount}</strong>
                </div>
                <div className="quick-stat">
                  <span>Total Users</span>
                  <strong>{users.length}</strong>
                </div>
                <div className="quick-stat-note">
                  Logged in as <span className="quick-stat-user">{profile.display_name || profile.username}</span>
                  <span className="quick-stat-role">{String(profile.role || '').replace('_', ' ')}</span>
                </div>
              </div>
            </div>
          </section>

          {/* ---------- FEATURED PROJECTS SECTION (NEW) ---------- */}
          {isSuperAdmin ? (
            <section className="mb-6 admin-section" id="featured-projects">
              <h3 className="centered-h">Featured Projects (manage order & pagination)</h3>

              <div className="card p-3" style={{ marginBottom: 12 }}>
                <form onSubmit={createOrUpdateFeaturedProject} style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input value={fpTitle} onChange={e => setFpTitle(e.target.value)} placeholder="Project title" className="p-2 field" style={{ flex: 2, minWidth: 200 }} />
                    <input value={fpThumbnail} onChange={e => setFpThumbnail(e.target.value)} placeholder="Thumbnail URL (optional)" className="p-2 field" style={{ flex: 1, minWidth: 160 }} />
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input value={fpUrl} onChange={e => setFpUrl(e.target.value)} placeholder="Live Demo URL (optional)" className="p-2 field" style={{ flex: 1, minWidth: 200 }} />
                    <input value={fpGithubUrl} onChange={e => setFpGithubUrl(e.target.value)} placeholder="GitHub URL (optional)" className="p-2 field" style={{ flex: 1, minWidth: 200 }} />
                    <input value={fpTags} onChange={e => setFpTags(e.target.value)} placeholder="Tags (comma separated)" className="p-2 field" style={{ flex: 1, minWidth: 200 }} />
                  </div>

                  <textarea value={fpDesc} onChange={e => setFpDesc(e.target.value)} placeholder="Short description" className="p-2 field" rows={3} />

                  <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                    <button className="btn btn-cyan" type="submit">{fpEditingId ? "Save changes" : "Create Project"}</button>
                    {fpEditingId && <button className="btn" type="button" onClick={cancelEditFeatured}>Cancel</button>}
                    <button className="btn" type="button" onClick={() => { setFpTitle(""); setFpDesc(""); setFpTags(""); setFpThumbnail(""); setFpUrl(""); setFpGithubUrl(""); setFpEditingId(null); }}>Clear</button>
                  </div>
                </form>
              </div>

            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <label className="muted-2">Page:</label>
                <select className="p-2 field" value={fpPage} onChange={e => setFpPage(Number(e.target.value))}>
                  {Array.from({ length: fpPagesCount }, (_, i) => i + 1).map(pg => <option key={pg} value={pg}>{pg}</option>)}
                </select>
                <select className="p-2 field" value={fpPageSize} onChange={e => { setFpPageSize(Number(e.target.value)); setFpPage(1); }}>
                  {[3, 6, 12].map(n => <option key={n} value={n}>{n} / page</option>)}
                </select>
              </div>

              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <button className="btn" onClick={() => loadFeaturedProjects({ page: fpPage, pageSize: fpPageSize })} disabled={fpLoading}>Refresh</button>
                <button className="btn btn-cyan" onClick={() => saveFeaturedOrder()} disabled={!isSuperAdmin || fpLoading || (featuredProjects.length === 0)}>Save order</button>
              </div>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {(fpLoading) ? <div style={{ color: "var(--muted-2)", padding: 10 }}>Loading featured projects…</div> : null}

              {(!fpLoading && featuredProjects.length === 0) ? <div style={{ color: "var(--muted-2)", padding: 10 }}>No featured projects yet.</div> : null}

              <div>
                {/* Drag & drop list */}
                <div style={{ display: "grid", gap: 8 }}>
                  {featuredProjects.map(fp => (
                    <div
                      key={fp.id}
                      draggable={isSuperAdmin}
                      onDragStart={isSuperAdmin ? (e) => onDragStartFp(e, fp.id) : undefined}
                      onDragOver={isSuperAdmin ? (e) => onDragOverFp(e, fp.id) : undefined}
                      onDrop={isSuperAdmin ? (e) => onDropFp(e, fp.id) : undefined}
                      style={{
                        display: "flex",
                        gap: 12,
                        alignItems: "center",
                        padding: 10,
                        borderRadius: 8,
                        background: fpDraggingId === fp.id ? "rgba(0,210,255,0.06)" : "rgba(255,255,255,0.02)",
                        border: "1px solid rgba(255,255,255,0.03)",
                        cursor: "grab"
                      }}
                    >
                      <div style={{ width: 48, height: 48, borderRadius: 8, overflow: "hidden", background: "#04111a", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {fp.thumbnail ? <img src={fp.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ color: "var(--muted-2)", fontSize: 13 }}>No Img</div>}
                      </div>

                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <div style={{ fontWeight: 700, color: "white" }}>{fp.title}</div>
                          <div style={{ marginLeft: "auto", color: "var(--muted-2)" }}>{(fp.position || 0)}</div>
                        </div>
                        <div style={{ color: "var(--muted-2)", fontSize: 13, marginTop: 6 }}>{(fp.desc || "").slice(0, 140)}{(fp.desc || "").length > 140 ? "…" : ""}</div>
                        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                          {isSuperAdmin ? (
                            <>
                              <button className="btn" onClick={() => startEditFeatured(fp)}>Edit</button>
                              <button className="btn" onClick={() => deleteFeaturedProject(fp.id)}>Delete</button>
                            </>
                          ) : null}
                          <a href={fp.url || "#"} target="_blank" rel="noreferrer" className="btn view-btn" onClick={(e) => { if (!fp.url) e.preventDefault(); }}>Open</a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* pagination controls */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ color: "var(--muted-2)" }}>Page {fpPage} / {fpPagesCount} — <strong>{fpTotalCount}</strong> total</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn" onClick={() => { setFpPage(1); }} disabled={fpPage <= 1}>« First</button>
                  <button className="btn" onClick={() => setFpPage(p => Math.max(1, p - 1))} disabled={fpPage <= 1}>‹ Prev</button>
                  <button className="btn" onClick={() => setFpPage(p => Math.min(fpPagesCount, p + 1))} disabled={fpPage >= fpPagesCount}>Next ›</button>
                  <button className="btn" onClick={() => setFpPage(fpPagesCount)} disabled={fpPage >= fpPagesCount}>Last »</button>
                </div>
              </div>
            </div>
            </section>
          ) : null}
          {/* ---------- END FEATURED PROJECTS SECTION ---------- */}

          {/* COURSES (with full edit/delete) */}
          <section className="mb-6 admin-section" id="courses">
            <h3 className="centered-h">Courses</h3>

            <div className="courses-toolbar">
              <div className="courses-filters">
                <input
                  className="p-2 field"
                  placeholder="Search by title or topic..."
                  value={courseSearch}
                  onChange={(e) => { setCourseSearch(e.target.value); setCoursesPage(1); }}
                />
                <select
                  className="p-2 field"
                  value={courseTopicFilter}
                  onChange={(e) => { setCourseTopicFilter(e.target.value); setCoursesPage(1); }}
                >
                  <option value="all">All topics</option>
                  {uniqueCourseTopics.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select
                  className="p-2 field"
                  value={coursesPageSize}
                  onChange={(e) => { setCoursesPageSize(Number(e.target.value)); setCoursesPage(1); }}
                >
                  {[5, 10, 20, 50].map(n => <option key={n} value={n}>{n} / page</option>)}
                </select>
              </div>
              <div className="courses-count">
                Showing {filteredCourses.length} courses
              </div>
            </div>

            <div className="space-y-3">
              {visibleCourses.map(c => {
                const editing = editingTopicsMap[c.id]?.editing;
                const editor = editingTopicsMap[c.id] || { topics: Array.isArray(c.topics) ? [...c.topics] : [], input: "" };
                return (
                  <div key={c.id} className="card p-3" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 260 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontWeight: 700, color: 'white' }}>{c.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted-2)' }}>{c.slug}</div>
                      </div>

                      <div style={{ marginTop: 8, color: 'var(--muted-2)' }}>{c.description || "No description"}</div>
                      <div style={{ marginTop: 8 }}>
                        <strong style={{ color: 'white', fontSize: 12 }}>Meta:</strong>
                        <span style={{ marginLeft: 8, color: 'var(--muted-2)', fontSize: 12 }}>{normalizeCourseType(c.course_type)}</span>
                        <span style={{ marginLeft: 12, color: 'var(--muted-2)', fontSize: 12 }}>{c.weeks ? `${c.weeks} wk(s)` : ''}</span>
                      </div>

                      {!editing ? (
                        <>
                          {Array.isArray(c.topics) && c.topics.length > 0 ? (
                            <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                              {c.topics.map((t, i) => <li key={i} style={{ color: 'var(--muted-2)', marginBottom: 4 }}>{t}</li>)}
                            </ul>
                          ) : (
                            <div style={{ marginTop: 8, color: 'var(--muted-2)' }}>No topics yet.</div>
                          )}
                        </>
                      ) : (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ marginBottom: 6, color: 'var(--muted-2)' }}>Edit topics (max 10)</div>
                          <ul style={{ paddingLeft: 18 }}>
                            {editor.topics.map((t, i) => (
                              <li key={i} style={{ marginBottom: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
                                <input
                                  value={t}
                                  onChange={(e) => editTopicsUpdateValue(c.id, i, e.target.value)}
                                  className="p-2 field"
                                  style={{ flex: 1, minWidth: 150 }}
                                />
                                <button className="btn" onClick={() => editTopicsRemove(c.id, i)} type="button">Delete</button>
                              </li>
                            ))}
                          </ul>

                          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <input
                              value={editor.input}
                              onChange={(e) => setEditingTopicsMap(prev => ({ ...prev, [c.id]: { ...(prev[c.id] || {}), input: e.target.value }}))}
                              placeholder="New topic"
                              className="p-2 field"
                              style={{ flex: 1 }}
                            />
                            <button className="btn btn-cyan" onClick={() => editTopicsAdd(c.id)} type="button">Add</button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {!editing ? (
                        <>
                          <button className="btn btn-cyan" onClick={() => startEditTopics(c)} type="button">Edit topics</button>
                          <button className="btn" onClick={() => startEditCourse(c)} type="button">Edit course</button>
                          <button className="btn" onClick={() => deleteCourse(c.id)} type="button">Delete course</button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn-cyan" onClick={() => saveEditedTopics(c.id)} type="button">Save topics</button>
                          <button className="btn" onClick={() => cancelEditTopics(c.id)} type="button">Cancel</button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="courses-pagination">
              <div className="muted-2">
                Page {coursesPage} / {coursesPagesCount}
              </div>
              <div className="courses-page-actions">
                <button className="btn" onClick={() => setCoursesPage(1)} disabled={coursesPage <= 1}>« First</button>
                <button className="btn" onClick={() => setCoursesPage(p => Math.max(1, p - 1))} disabled={coursesPage <= 1}>‹ Prev</button>
                <button className="btn" onClick={() => setCoursesPage(p => Math.min(coursesPagesCount, p + 1))} disabled={coursesPage >= coursesPagesCount}>Next ›</button>
                <button className="btn" onClick={() => setCoursesPage(coursesPagesCount)} disabled={coursesPage >= coursesPagesCount}>Last »</button>
              </div>
            </div>
          </section>

          {/* USERS LIST (role management) */}
          <section className="mb-6 admin-section" id="users">
            <h3 className="centered-h">Users (set role inline)</h3>

            {/* Search & filters */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
              <input
                placeholder="Search by name / username / email..."
                className="p-2 field"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                style={{ flex: 1 }}
              />
              <select className="p-2 field" value={userRoleFilter} onChange={(e) => setUserRoleFilter(e.target.value)}>
                {rolesForFilter.map(r => <option key={r} value={r}>{r === "all" ? "All roles" : r}</option>)}
              </select>

              <select className="p-2 field" value={usersPageSize} onChange={(e) => { setUsersPageSize(Number(e.target.value)); setUsersPage(1); }}>
                {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
              </select>
            </div>

            <div className="space-y-2">
              {usersLoading ? (
                <div style={{ padding: 12, color: "var(--muted-2)" }}>Loading users…</div>
              ) : users.length === 0 ? (
                <div style={{ padding: 12, color: "var(--muted-2)" }}>No users found.</div>
              ) : users.map(u => {
                const targetRole = (u.role || "user").toLowerCase();
                const opRank = ROLE_RANK[(profile.role || "user").toLowerCase()] ?? 0;
                const targetRank = ROLE_RANK[targetRole] ?? 0;
                const allowedRoles = getAllowedRolesForOperator();

                // whether current operator can change this user's role at all
                const cannotChangeTarget = (u.id === profile.id) // can't change yourself
                  || (u.email === OWNER_EMAIL) // can't change owner
                  || (profile.role?.toLowerCase() !== "super_admin" && opRank <= targetRank); // can't change equal/higher

                // show select's value from pendingRoles if present, else DB value
                const currentSelectValue = pendingRoles[u.id] ?? (u.role || "user");

                // If this user has no profiles row and operator can't insert, prevent Save
                const insertingNotAllowed = !u.has_profile && !operatorCanInsertProfile();

                // block/delete permissions
                const canBlockOrDelete = operatorCanActOnTarget(u);

                return (
                  <div key={u.id} className="user-row">
                    <div style={{ flex: 1 }}>
                      <div className="user-name">
                        {u.display_name || u.username || u.email || u.id}
                        {/* show badges for no profile or unconfirmed */}
                        {!u.has_profile ? <span style={{ marginLeft: 8, color: "#f59e0b", fontSize: 12 }}>(no profile)</span> : null}
                        {typeof u.confirmed === "boolean" && u.confirmed === false ? (
                          <span style={{ marginLeft: 8, color: "#f97316", fontSize: 12 }}>(unconfirmed)</span>
                        ) : null}
                        {u.is_blocked ? <span style={{ marginLeft: 8, background: "#fecaca", color: "#7f1d1d", padding: "2px 6px", borderRadius: 6, fontSize: 12 }}>blocked</span> : null}
                      </div>
                      <div className="user-sub">{u.email || ""}</div>
                    </div>

                    <div style={{ minWidth: 220 }}>
                      <select
                        value={currentSelectValue}
                        onChange={(e) => {
                          const val = e.target.value;
                          // store pending change (do not mutate u.role directly)
                          setPendingRoles(prev => ({ ...prev, [u.id]: val }));
                        }}
                        className="p-2 field"
                        disabled={cannotChangeTarget}
                      >
                        {/* Always show the user's current role as an option so select has consistent display —
                            then add allowed roles as choices. */}
                        <option value={u.role || "user"}>{u.role || "user"}</option>
                        {allowedRoles.map(r => {
                          // don't duplicate current
                          if (r === (u.role || "user")) return null;
                          // extra safety: moderators/admins should not see options >= their rank
                          const rRank = ROLE_RANK[r] ?? 0;
                          if (profile.role?.toLowerCase() !== "super_admin" && rRank >= (ROLE_RANK[(profile.role||"user").toLowerCase()] ?? 0)) {
                            return null;
                          }
                          return <option key={r} value={r}>{r}</option>;
                        })}
                      </select>
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        className="btn btn-cyan"
                        onClick={() => {
                          // determine desired (pending or current)
                          const desired = pendingRoles[u.id] ?? (u.role || "user");
                          handleInlineSetRole(u.id, desired);
                        }}
                        disabled={
                          // disable when no pending change or cannot change
                          cannotChangeTarget ||
                          ((pendingRoles[u.id] ?? (u.role || "user")) === (u.role || "user")) ||
                          insertingNotAllowed
                        }
                        title={cannotChangeTarget ? "You cannot change this user's role" : (u.id === profile.id ? "You cannot change your own role" : insertingNotAllowed ? "Cannot create profile for this user (ask super_admin)" : "Save role")}
                      >
                        Save
                      </button>

                      {/* Block / Unblock button (visible only to super_admin) */}
                      {isOperatorSuper() ? (
                        <button
                          className="btn"
                          onClick={() => toggleBlock(u.id, !u.is_blocked)}
                          disabled={!canBlockOrDelete}
                          title={!canBlockOrDelete ? "You cannot block/unblock this user" : (u.is_blocked ? "Unblock user" : "Block user")}
                          style={{ background: u.is_blocked ? "rgba(34,197,94,0.12)" : "rgba(244,63,94,0.08)", color: u.is_blocked ? "#bbf7d0" : "#fecaca", borderColor: "rgba(255,255,255,0.04)" }}
                        >
                          {u.is_blocked ? "Unblock" : "Block"}
                        </button>
                      ) : null}

                      {/* Delete (profiles row) — super_admin only */}
                      {isOperatorSuper() ? (
                        <button
                          className="btn"
                          onClick={() => removeUser(u.id)}
                          disabled={!canBlockOrDelete}
                          title={!canBlockOrDelete ? "You cannot remove this user" : "Permanently remove profile row"}
                          style={{ background: "rgba(255,255,255,0.02)", color: "#fff" }}
                        >
                          Delete
                        </button>
                      ) : null}

                      <a href={`/profiles/${encodeURIComponent(u.id)}`} className="btn view-btn">View</a>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* pagination controls */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
              <div style={{ color: "var(--muted-2)" }}>
                Showing page {usersPage} of {usersPagesCount} — <strong>{usersTotalCount}</strong> total
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" onClick={() => { setUsersPage(1); }} disabled={usersPage <= 1}>« First</button>
                <button className="btn" onClick={() => setUsersPage(p => Math.max(1, p - 1))} disabled={usersPage <= 1}>‹ Prev</button>
                <button className="btn" onClick={() => setUsersPage(p => Math.min(usersPagesCount, p + 1))} disabled={usersPage >= usersPagesCount}>Next ›</button>
                <button className="btn" onClick={() => setUsersPage(usersPagesCount)} disabled={usersPage >= usersPagesCount}>Last »</button>
              </div>
            </div>
          </section>

          {/* COURSE-WISE PROBLEM LIST */}
          <section className="admin-section" style={{ marginBottom: 40 }} id="course-problems">
            <h3 className="centered-h">Course Problem List</h3>
            <div className="card p-4 hover-card">
              <div className="course-problem-toolbar">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <select
                    className="p-2 field"
                    value={courseProblemCourseId}
                    onChange={(e) => { setCourseProblemCourseId(e.target.value); setCourseProblemPage(1); }}
                  >
                    <option value="">— select course —</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                  <input
                    className="p-2 field"
                    placeholder="Search problem title or platform..."
                    value={courseProblemSearch}
                    onChange={(e) => { setCourseProblemSearch(e.target.value); setCourseProblemPage(1); }}
                    style={{ minWidth: 240 }}
                  />
                  <select
                    className="p-2 field"
                    value={courseProblemDifficulty}
                    onChange={(e) => { setCourseProblemDifficulty(e.target.value); setCourseProblemPage(1); }}
                  >
                    <option value="all">All difficulties</option>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                  <select
                    className="p-2 field"
                    value={courseProblemPageSize}
                    onChange={(e) => { setCourseProblemPageSize(Number(e.target.value)); setCourseProblemPage(1); }}
                  >
                    {[20, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
                  </select>
                </div>
                <button className="btn btn-sm" onClick={() => fetchCourseProblemsPage({ courseId: courseProblemCourseId, page: courseProblemPage, pageSize: courseProblemPageSize, search: courseProblemSearch, difficulty: courseProblemDifficulty })} type="button" disabled={!courseProblemCourseId}>Refresh</button>
              </div>

              {!courseProblemCourseId ? (
                <div style={{ color: "var(--muted-2)", padding: 10 }}>Select a course to view problems.</div>
              ) : courseProblemLoading ? (
                <div style={{ color: "var(--muted-2)", padding: 10 }}>Loading course problems...</div>
              ) : courseProblemError ? (
                <div style={{ color: "var(--muted-2)", padding: 10 }}>{courseProblemError}</div>
              ) : courseProblemRows.length === 0 ? (
                <div style={{ color: "var(--muted-2)", padding: 10 }}>No course problems found.</div>
              ) : (
                <div className="course-problem-list">
                  {courseProblemRows.map(item => (
                    <div key={item.id} className="course-problem-item">
                      <div>
                        <div className="problem-title">{item.problems?.title || "Untitled problem"}</div>
                        <div className="problem-sub">{item.problems?.platform || "Unknown"} • {item.problems?.difficulty || "unknown"}</div>
                      </div>
                      <button
                        className="btn btn-sm"
                        type="button"
                        onClick={async () => {
                          if (!confirm("Remove this problem from the course?")) return;
                          const { error } = await supabase
                            .from("course_problems")
                            .delete()
                            .eq("id", item.id);
                          if (error) {
                            return setActionMsg({ type: "error", text: error.message || "Remove failed" });
                          }
                          fetchCourseProblemsPage({ courseId: courseProblemCourseId, page: courseProblemPage, pageSize: courseProblemPageSize, search: courseProblemSearch, difficulty: courseProblemDifficulty });
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
                    <div style={{ color: "var(--muted-2)" }}>
                      Page {courseProblemPage} / {Math.max(1, Math.ceil((courseProblemTotal || 0) / courseProblemPageSize))}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn" onClick={() => setCourseProblemPage(1)} disabled={courseProblemPage <= 1}>« First</button>
                      <button className="btn" onClick={() => setCourseProblemPage(p => Math.max(1, p - 1))} disabled={courseProblemPage <= 1}>‹ Prev</button>
                      <button className="btn" onClick={() => setCourseProblemPage(p => Math.min(Math.max(1, Math.ceil((courseProblemTotal || 0) / courseProblemPageSize)), p + 1))} disabled={courseProblemPage >= Math.max(1, Math.ceil((courseProblemTotal || 0) / courseProblemPageSize))}>Next ›</button>
                      <button className="btn" onClick={() => setCourseProblemPage(Math.max(1, Math.ceil((courseProblemTotal || 0) / courseProblemPageSize)))} disabled={courseProblemPage >= Math.max(1, Math.ceil((courseProblemTotal || 0) / courseProblemPageSize))}>Last »</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* EXISTING PROBLEMS */}
          <section className="admin-section" style={{ marginBottom: 40 }} id="problems">
            <h3 className="centered-h">Existing Problems</h3>
            <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  className="p-2 field"
                  placeholder="Search title or platform..."
                  value={problemsSearch}
                  onChange={(e) => { setProblemsSearch(e.target.value); setProblemsPage(1); }}
                  style={{ minWidth: 240 }}
                />
                <select
                  className="p-2 field"
                  value={problemsDifficulty}
                  onChange={(e) => { setProblemsDifficulty(e.target.value); setProblemsPage(1); }}
                >
                  <option value="all">All difficulties</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
                <label className="muted-2">Page:</label>
                <select className="p-2 field" value={problemsPage} onChange={e => setProblemsPage(Number(e.target.value))}>
                  {Array.from({ length: problemsPagesCount }, (_, i) => i + 1).map(pg => <option key={pg} value={pg}>{pg}</option>)}
                </select>
                <select className="p-2 field" value={problemsPageSize} onChange={e => { setProblemsPageSize(Number(e.target.value)); setProblemsPage(1); }}>
                  {[20, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
                </select>
                <select className="p-2 field" value={addProblemCourseId} onChange={e => setAddProblemCourseId(e.target.value)}>
                  <option value="">— add to course —</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <div style={{ color: "var(--muted-2)" }}>
                Showing page {problemsPage} of {problemsPagesCount} — <strong>{problemsTotalCount}</strong> total
              </div>
            </div>
            {existingProblemsNotice && (
              <div className={`section-notice ${existingProblemsNotice.type || ''}`}>
                {existingProblemsNotice.text}
              </div>
            )}
            <div className="space-y-2">
              {problemsLoading ? (
                <div style={{ color: "var(--muted-2)", padding: 10 }}>Loading problems…</div>
              ) : null}
              {!problemsLoading && problems.length === 0 ? (
                <div style={{ color: "var(--muted-2)", padding: 10 }}>No problems yet.</div>
              ) : null}
              {!problemsLoading && problems.map(p => (
                <div key={p.id} className="p-3 problem-row">
                  <div>
                    <div className="problem-title">{p.title}</div>
                    <div className="problem-sub">{p.platform} • {p.difficulty}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="px-3 py-1 border rounded text-sm"
                      onClick={async () => {
                        if (!addProblemCourseId) {
                          return showExistingProblemsNotice("error", "Select a course to add this problem.");
                        }
                        const { data: existing, error: existErr } = await supabase
                          .from("course_problems")
                          .select("id")
                          .eq("course_id", addProblemCourseId)
                          .eq("problem_id", p.id)
                          .maybeSingle();
                        if (existErr && existErr.code !== "PGRST116") {
                          return showExistingProblemsNotice("error", existErr.message || "Check failed");
                        }
                        if (existing?.id) {
                          return showExistingProblemsNotice("warning", "This problem already exists in the selected course.");
                        }
                        const { error: insErr } = await supabase
                          .from("course_problems")
                          .insert([{ course_id: addProblemCourseId, problem_id: p.id }]);
                        if (insErr) {
                          return showExistingProblemsNotice("error", insErr.message || "Add to course failed");
                        }
                        showExistingProblemsNotice("success", "Problem added to course.");
                        if (addProblemCourseId === courseProblemCourseId) {
                          fetchCourseProblemsPage({ courseId: courseProblemCourseId, page: courseProblemPage, pageSize: courseProblemPageSize, search: courseProblemSearch, difficulty: courseProblemDifficulty });
                        }
                      }}
                    >
                      Add to course
                    </button>
                    {p.link && <a href={p.link} target="_blank" rel="noreferrer" className="px-3 py-1 border rounded text-sm">Open</a>}
                    <button
                      className="px-3 py-1 border rounded text-sm"
                      onClick={() => startEditProblem(p)}
                    >Edit</button>
                    <button
                      className="px-3 py-1 border rounded text-sm"
                      onClick={async () => {
                        if (!confirm("Delete problem? This cannot be undone.")) return;
                        const { error } = await supabase.from("problems").delete().eq("id", p.id);
                        if (error) return setActionMsg({ type: "error", text: "Delete failed: " + error.message });
                        setActionMsg({ type: "success", text: "Problem deleted" });
                        await loadCountsAndLists();
                      }}
                    >Delete</button>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
              <div style={{ color: "var(--muted-2)" }}>
                Page {problemsPage} / {problemsPagesCount}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" onClick={() => setProblemsPage(1)} disabled={problemsPage <= 1}>« First</button>
                <button className="btn" onClick={() => setProblemsPage(p => Math.max(1, p - 1))} disabled={problemsPage <= 1}>‹ Prev</button>
                <button className="btn" onClick={() => setProblemsPage(p => Math.min(problemsPagesCount, p + 1))} disabled={problemsPage >= problemsPagesCount}>Next ›</button>
                <button className="btn" onClick={() => setProblemsPage(problemsPagesCount)} disabled={problemsPage >= problemsPagesCount}>Last »</button>
              </div>
            </div>
          </section>

        </div>
      </main>

      <style jsx>{`
        :root{
          --muted-2: rgba(255,255,255,0.6);
        }

        .admin-root { color: #e6f7ff; }
        .admin-header {
          position: relative;
          margin-bottom: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .admin-title {
          margin: 0;
          font-size: 28px;
          font-weight: 800;
          color: #e6f7ff;
          letter-spacing: 0.4px;
        }
        .admin-header-action {
          position: absolute;
          right: 0;
          top: 0;
        }
        .admin-nav {
          position: sticky;
          top: 10px;
          z-index: 50;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: center;
          padding: 10px 12px;
          border-radius: 16px;
          background: rgba(10, 16, 36, 0.8);
          border: 1px solid rgba(0,210,255,0.16);
          box-shadow: 0 16px 40px rgba(2,6,23,0.6);
          backdrop-filter: blur(14px);
          margin-bottom: 18px;
        }
        .admin-nav-link {
          padding: 6px 12px;
          border-radius: 999px;
          color: #c7f6ff;
          font-weight: 700;
          font-size: 12px;
          text-decoration: none;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease, color 180ms ease;
        }
        .admin-nav-link:hover {
          transform: translateY(-2px);
          background: rgba(0,210,255,0.18);
          border-color: rgba(0,210,255,0.35);
          color: #0b172a;
          box-shadow: 0 10px 30px rgba(0,210,255,0.14);
        }
        .admin-section { scroll-margin-top: 90px; }
        .courses-toolbar {
          display: flex;
          gap: 12px;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }
        .courses-filters {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }
        .courses-count {
          color: var(--muted-2);
          font-size: 12px;
        }
        .courses-pagination {
          margin-top: 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          flex-wrap: wrap;
        }
        .courses-page-actions { display: flex; gap: 8px; }

        /* global-ish */
        .card {
          background:
            radial-gradient(900px 180px at 10% -20%, rgba(0, 210, 255, 0.08), transparent 60%),
            linear-gradient(140deg, rgba(12, 18, 38, 0.96), rgba(7, 10, 24, 0.98));
          border-radius: 16px;
          border: 1px solid rgba(0,210,255,0.12);
          padding: 16px;
          box-shadow: 0 18px 44px rgba(2,6,23,0.55);
          backdrop-filter: blur(10px);
        }
        .hover-card { transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease, border-color 180ms ease; }
        .hover-card:hover { transform: translateY(-4px); border-color: rgba(0,210,255,0.35); box-shadow: 0 22px 52px rgba(0,210,255,0.14); }

        .card-title {
          text-align: left;
          color: #c7f6ff;
          margin: 0 0 12px;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          padding-bottom: 8px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .quick-stats { display: grid; gap: 10px; text-align: left; }
        .quick-stat { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-radius: 12px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); color: #e6f7ff; font-weight: 600; }
        .quick-stat span { color: var(--muted-2); font-weight: 600; }
        .quick-stat strong { color: #ffffff; font-size: 16px; }
        .quick-stat-note { margin-top: 10px; font-size: 12px; color: #22c55e; text-align: center; display:flex; gap:8px; align-items:center; justify-content:center; flex-wrap: wrap; }
        .quick-stat-user { color: #e6f7ff; font-weight: 700; }
        .quick-stat-role { padding: 2px 8px; border-radius: 999px; background: rgba(0,210,255,0.12); color: #bff6ff; border: 1px solid rgba(0,210,255,0.25); font-size: 11px; text-transform: capitalize; }
        .btn-sm { padding: 6px 10px; font-size: 12px; border-radius: 8px; }
        .multi-course-wrap { display: flex; flex-direction: column; gap: 10px; }
        .multi-course-header { display: flex; flex-direction: column; gap: 8px; }
        .multi-course-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .multi-course-count { color: var(--muted-2); font-size: 12px; }
        .multi-course-list { max-height: 180px; overflow: auto; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 6px; background: rgba(255,255,255,0.02); }
        .multi-course-list.disabled { opacity: 0.6; pointer-events: none; }
        .multi-course-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; cursor: pointer; color: #e6f7ff; }
        .multi-course-item:hover { background: rgba(0,210,255,0.08); }
        .multi-course-item input { accent-color: #00d2ff; }
        .multi-course-hint { font-size: 12px; color: var(--muted-2); }
        .section-notice { margin: 6px 0 12px; padding: 8px 10px; border-radius: 10px; font-size: 12px; border: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.9); }
        .section-notice.error { background: rgba(244,63,94,0.12); border-color: rgba(244,63,94,0.25); color: #fecaca; }
        .section-notice.success { background: rgba(16,185,129,0.12); border-color: rgba(16,185,129,0.25); color: #bbf7d0; }
        .section-notice.warning { background: rgba(234,179,8,0.12); border-color: rgba(234,179,8,0.25); color: #fde68a; }
        .course-problem-toolbar { display:flex; gap:10px; align-items:center; justify-content: space-between; margin-bottom: 12px; flex-wrap: wrap; }
        .course-problem-grid { display:grid; gap:12px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
        .course-problem-card { border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; background: rgba(255,255,255,0.02); padding: 10px 12px; }
        .course-problem-card summary { list-style: none; cursor: pointer; }
        .course-problem-card summary::-webkit-details-marker { display: none; }
        .course-problem-summary { display:flex; align-items:center; justify-content: space-between; gap: 10px; }
        .course-problem-title { color: #e6f7ff; font-weight: 700; }
        .course-problem-count { color: var(--muted-2); font-size: 12px; }
        .course-problem-list { margin-top: 10px; display:flex; flex-direction: column; gap: 8px; }
        .course-problem-item { display:flex; align-items:center; justify-content: space-between; gap: 10px; padding: 8px 10px; border-radius: 10px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); }

        /* header back button */
        .back-btn {
          padding: 8px 12px;
          border-radius: 10px;
          background: rgba(0,210,255,0.08);
          color: #bff6ff;
          border: 1px solid rgba(0,210,255,0.2);
          cursor: pointer;
          font-weight: 700;
          text-decoration: none;
          display: inline-block;
        }
        .back-btn:hover { transform: translateY(-3px); box-shadow: 0 12px 30px rgba(0,210,255,0.06); border-color: rgba(0,210,255,0.18); background: rgba(0,210,255,0.06); color: #002; }

        /* buttons */
        .btn { padding: 8px 12px; border-radius: 10px; background: rgba(255,255,255,0.04); color: #e6f7ff; border: 1px solid rgba(255,255,255,0.08); cursor: pointer; font-weight: 700; }
        .btn:hover { transform: translateY(-3px); box-shadow: 0 12px 30px rgba(0,210,255,0.06); border-color: rgba(0,210,255,0.18); }
        .btn-cyan { background: rgba(0,210,255,0.12); color: #0b172a; border: 1px solid rgba(0,210,255,0.35); }
        .view-btn { padding: 8px 10px; background: rgba(255,255,255,0.02); color: white; border: 1px solid rgba(255,255,255,0.04); }

        /* make inputs/selects readable */
        .field {
          color: #e6f7ff;
          background: rgba(8,16,36,0.9);
          border: 1px solid rgba(0,210,255,0.18);
          border-radius: 10px;
          padding: 9px 10px;
          outline: none;
          transition: border-color 160ms ease, box-shadow 160ms ease;
        }
        .field:focus {
          border-color: rgba(0,210,255,0.45);
          box-shadow: 0 0 0 4px rgba(0,210,255,0.12);
        }

        /* user row / problem row styling */
        .user-row {
          display: flex;
          gap: 12px;
          align-items: center;
          padding: 12px;
          border-radius: 8px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.03);
        }
        .user-name { color: white; font-weight: 700; }
        .user-sub { color: var(--muted-2); font-size: 13px; }

        .problem-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          border-radius: 8px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.03);
        }
        .problem-title { font-weight: 700; color: white; }
        .problem-sub { color: var(--muted-2); font-size: 13px; }

        /* centered headings used across sections */
        .centered-h { text-align: center; color: white; font-weight: 700; margin-bottom: 12px; }

        /* small responsive adjustments */
        @media (max-width: 768px) {
          header { text-align: center; }
          header div[style*="position: absolute"] { position: static; margin-top: 8px; }
        }
      `}</style>
    </div>
  );
}
