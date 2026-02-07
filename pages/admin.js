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
  const [problems, setProblems] = useState([]);

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
  const [selectedCourseId, setSelectedCourseId] = useState("");

  const [assignUserId, setAssignUserId] = useState("");

  // NEW: solution fields for problem (video + text)
  const [probVideo, setProbVideo] = useState("");
  const [probText, setProbText] = useState("");

  const [actionMsg, setActionMsg] = useState(null);

  // editing topics per existing course: { [courseId]: { editing: bool, topics: [], input: "" } }
  const [editingTopicsMap, setEditingTopicsMap] = useState({});

  // derived roles available for operator (keeps stable)
  const rolesForFilter = useMemo(() => ["all", ...ALL_ROLES], []);

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

  // cancel any in-flight user fetch on unmount
  useEffect(() => {
    return () => {
      if (usersAbortRef.current) {
        try { usersAbortRef.current.abort(); } catch (e) {}
      }
    };
  }, []);

  async function loadCountsAndLists() {
    try {
      const [cRes, pRes] = await Promise.all([
        supabase.from("courses").select("*").order("created_at", { ascending: false }),
        supabase.from("problems").select("*").order("created_at", { ascending: false }),
      ]);
      if (cRes.error) console.warn("courses load err", cRes.error);
      if (pRes.error) console.warn("problems load err", pRes.error);
      setCourses(cRes.data || []);
      setProblems(pRes.data || []);
      setEditingTopicsMap({});
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

  /* ----------------- Course / Problem / Enrollment actions ----------------- */

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
    setCourseType(course.course_type || "Free");
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

  // addProblem: performs validation + schema-defensive insert
  async function addProblem(e) {
    e?.preventDefault();
    setActionMsg(null);

    if (!probTitle || !probPlatform) return setActionMsg({ type: "error", text: "Title and platform required" });

    if (probLink && !isValidUrl(probLink)) {
      return setActionMsg({ type: "error", text: "Problem link looks invalid. Use a full URL (https://...)" });
    }

    if (probVideo && !isValidUrl(probVideo) && probVideo.trim() !== "") {
      return setActionMsg({ type: "error", text: "Video solution looks like a URL but it's invalid. Use full URL (https://...)" });
    }

    try {
      const payload = {
        title: probTitle,
        platform: probPlatform,
        link: probLink || null,
        difficulty: probDifficulty,
        created_by: profile.id,
        video_solution: probVideo && String(probVideo).trim() ? String(probVideo).trim() : null,
        text_solution: probText && String(probText).trim() ? String(probText).trim() : null,
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
          platform: probPlatform,
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
        if (selectedCourseId) {
          const { error: cpErr } = await supabase.from("course_problems").insert([{
            course_id: selectedCourseId,
            problem_id: newProb2.id
          }]);
          if (cpErr) throw cpErr;
        }

        setProbTitle(""); setProbLink(""); setProbDifficulty("easy"); setSelectedCourseId("");
        setProbVideo(""); setProbText("");
        await loadCountsAndLists();
        setActionMsg({ type: "success", text: "Problem added (fallback to legacy `solution` column)." });
        return;
      }

      if (selectedCourseId) {
        const { error: cpErr } = await supabase.from("course_problems").insert([{
          course_id: selectedCourseId,
          problem_id: newProb.id
        }]);
        if (cpErr) throw cpErr;
      }

      setProbTitle(""); setProbLink(""); setProbDifficulty("easy"); setSelectedCourseId("");
      setProbVideo(""); setProbText("");
      await loadCountsAndLists();
      setActionMsg({ type: "success", text: "Problem added" });
    } catch (err) {
      console.error(err);
      setActionMsg({ type: "error", text: err.message || "Add problem failed" });
    }
  }

  async function assignUser(e) {
    e?.preventDefault();
    if (!assignUserId || !selectedCourseId) return setActionMsg({ type: "error", text: "Pick a user and a course" });

    try {
      const { error } = await supabase.from("enrollments").insert([{
        user_id: assignUserId,
        course_id: selectedCourseId
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
      const hasProfile = !!(target?.has_profile === true);

      if (profileId === profile.id) {
        return { error: "You cannot change your own role" };
      }

      const check = canOperatorChangeTarget(profile.role, targetRole, role, targetEmail);
      if (!check.allowed) return { error: check.reason || "Not allowed" };

      // If target has no profile row, INSERT (via upsert) may be an INSERT and could violate RLS for some operators.
      // Only proceed with upsert-insert if operator is allowed to create profile rows.
      if (!hasProfile && !operatorCanInsertProfile()) {
        return { error: "Cannot create profile for this user. Please ask a super_admin to create the profile first." };
      }

      const { error } = await supabase.from("profiles").upsert({ id: profileId, role }, { onConflict: "id" });
      if (error) return { error };

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
    const hasProfile = !!(target?.has_profile === true);

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

    // If target has no profile row, disallow if operator cannot insert (avoid RLS INSERT error)
    if (!hasProfile && !operatorCanInsertProfile()) {
      return setActionMsg({ type: "error", text: "Cannot create profile for this user. Ask a super_admin to create the profile first." });
    }

    try {
      const { error } = await supabase.from("profiles").upsert({ id: uId, role: desired }, { onConflict: "id" });
      if (error) throw error;

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
      const { error } = await supabase.from("profiles").update({ is_blocked: block }).eq("id", uId);
      if (error) throw error;

      setUsers(prev => prev.map(u => u.id === uId ? { ...u, is_blocked: block, has_profile: true } : u));
      setActionMsg({ type: "success", text: `User ${block ? "blocked" : "unblocked"}` });
    } catch (err) {
      console.error("toggleBlock err", err);
      // If DB trigger refused (e.g., non-super_admin), surface message
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

  return (
    <div>
      <Head>
        <title>Admin Dashboard</title>
      </Head>

      <main
        className="min-h-screen p-6"
        style={{
          background: "#071029",
          backgroundImage: "linear-gradient(rgba(0,210,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,210,255,0.03) 1px, transparent 1px)",
          backgroundSize: "50px 50px"
        }}
      >
        <div className="max-w-6xl mx-auto">
          {/* header: centered title, back button on right */}
          <header style={{ position: "relative", marginBottom: 18 }}>
            <h1 style={{ textAlign: "center", color: "white", fontSize: 26, margin: 0, fontWeight: 800 }}>Admin Dashboard</h1>
            <div style={{ position: "absolute", right: 0, top: 0 }}>
              <Link href="/" className="btn back-btn">Back to homepage</Link>
            </div>
          </header>

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

          <section className="grid md:grid-cols-2 gap-6 mb-6">

            <div className="card p-4 hover-card">
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

            <div className="card p-4 hover-card">
              <h3 className="card-title">Add Problem</h3>
              <form onSubmit={addProblem} className="space-y-3">
                <input value={probTitle} onChange={e => setProbTitle(e.target.value)} placeholder="Problem title" className="w-full p-2 field" />
                <input value={probPlatform} onChange={e => setProbPlatform(e.target.value)} placeholder="Platform (Codeforces / SeriousOJ)" className="w-full p-2 field" />
                <input value={probLink} onChange={e => setProbLink(e.target.value)} placeholder="Link (optional) — any site" className="w-full p-2 field" />

                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={probVideo}
                    onChange={e => setProbVideo(e.target.value)}
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
                <select value={selectedCourseId} onChange={(e) => setSelectedCourseId(e.target.value)} className="w-full p-2 field">
                  <option value="">— attach to course (optional) —</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
                <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                  <button className="btn btn-cyan" type="submit">Add Problem</button>
                </div>
              </form>
            </div>

          </section>

          <section className="grid md:grid-cols-3 gap-6 mb-6">
            <div className="card p-4 hover-card">
              <h3 className="card-title">Assign User</h3>
              <form onSubmit={assignUser} className="space-y-3">
                <select className="w-full p-2 field" value={assignUserId} onChange={e => setAssignUserId(e.target.value)}>
                  <option value="">— pick user —</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.display_name || u.username || (u.email || u.id)}</option>)}
                </select>
                <select className="w-full p-2 field" value={selectedCourseId} onChange={e => setSelectedCourseId(e.target.value)}>
                  <option value="">— pick course —</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
                <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                  <button className="btn btn-cyan" type="submit">Assign</button>
                </div>
              </form>
            </div>

            {/* NOTE: Set-by-email removed — inline user list handles role changes now */}
            <div className="card p-4 hover-card">
              <h3 className="card-title">Quick Stats</h3>
              <div style={{ color: "var(--muted-2)", textAlign: "center" }}>
                <div>Courses: <strong style={{ color: "white" }}>{courses.length}</strong></div>
                <div>Problems: <strong style={{ color: "white" }}>{problems.length}</strong></div>
                <div>Profiles (page): <strong style={{ color: "white" }}>{users.length}</strong></div>
                <div style={{ marginTop: 8, fontSize: 13, color: "var(--muted-2)" }}>Logged in as <strong style={{ color: "white" }}>{profile.display_name || profile.username}</strong> ({profile.role})</div>
              </div>
            </div>
          </section>

          {/* COURSES (with full edit/delete) */}
          <section className="mb-6">
            <h3 className="centered-h">Courses</h3>
            <div className="space-y-3">
              {courses.map(c => {
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
                        <span style={{ marginLeft: 8, color: 'var(--muted-2)', fontSize: 12 }}>{c.course_type || 'Free'}</span>
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
          </section>

          {/* USERS LIST (role management) */}
          <section className="mb-6">
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

          {/* EXISTING PROBLEMS */}
          <section style={{ marginBottom: 40 }}>
            <h3 className="centered-h">Existing Problems</h3>
            <div className="space-y-2">
              {problems.map(p => (
                <div key={p.id} className="p-3 problem-row">
                  <div>
                    <div className="problem-title">{p.title}</div>
                    <div className="problem-sub">{p.platform} • {p.difficulty}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {p.link && <a href={p.link} target="_blank" rel="noreferrer" className="px-3 py-1 border rounded text-sm">Open</a>}
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
          </section>

        </div>
      </main>

      <style jsx>{`
        :root{
          --muted-2: rgba(255,255,255,0.6);
        }

        /* global-ish */
        .card { background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px solid rgba(255,255,255,0.03); padding: 16px; }
        .hover-card { transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease; }
        .hover-card:hover { transform: translateY(-4px); background: rgba(0,210,255,0.06); box-shadow: 0 12px 40px rgba(0,210,255,0.08); }

        .card-title { text-align: center; color: white; margin-bottom: 12px; font-size: 16px; font-weight: 700; }

        /* header back button */
        .back-btn {
          padding: 8px 12px;
          border-radius: 8px;
          background: rgba(255,255,255,0.03);
          color: white;
          border: 1px solid rgba(255,255,255,0.06);
          cursor: pointer;
          font-weight: 700;
          text-decoration: none;
          display: inline-block;
        }
        .back-btn:hover { transform: translateY(-3px); box-shadow: 0 12px 30px rgba(0,210,255,0.06); border-color: rgba(0,210,255,0.18); background: rgba(0,210,255,0.06); color: #002; }

        /* buttons */
        .btn { padding: 8px 12px; border-radius: 8px; background: rgba(255,255,255,0.03); color: white; border: 1px solid rgba(255,255,255,0.06); cursor: pointer; font-weight: 700; }
        .btn:hover { transform: translateY(-3px); box-shadow: 0 12px 30px rgba(0,210,255,0.06); border-color: rgba(0,210,255,0.18); }
        .btn-cyan { background: rgba(0,210,255,0.06); color: #002; border: 1px solid rgba(0,210,255,0.18); }
        .view-btn { padding: 8px 10px; background: rgba(255,255,255,0.02); color: white; border: 1px solid rgba(255,255,255,0.04); }

        /* make inputs/selects readable */
        .field {
          color: #001;
          background: #f8fafc;
          border: 1px solid rgba(2,6,23,0.06);
          border-radius: 8px;
          padding: 8px;
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
