// pages/admin.js
import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";

/*
 Admin Dashboard
 - role-based: super_admin / admin / moderator allowed
 - owner (rkamonasish@gmail.com) is ensured super_admin
 - admin can set any role; moderator limited to premium/user
 - set role by email or via inline user list
*/

const OWNER_EMAIL = "rkamonasish@gmail.com";
const ALL_ROLES = ["super_admin", "admin", "moderator", "premium", "user"];
const MODERATOR_ALLOWED = ["premium", "user"];

function isValidUrl(value) {
  if (!value) return false;
  try {
    // basic URL validation
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
  const [users, setUsers] = useState([]);
  const [problems, setProblems] = useState([]);

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

  // set role by email card
  const [roleEmail, setRoleEmail] = useState("");
  const [roleToSet, setRoleToSet] = useState("user");
  const [actionMsg, setActionMsg] = useState(null);

  // editing topics per existing course: { [courseId]: { editing: bool, topics: [], input: "" } }
  const [editingTopicsMap, setEditingTopicsMap] = useState({});

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
          .select("id, username, display_name, role, is_admin, institution, country")
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
          .select("id, username, display_name, role, is_admin, institution, country")
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

        // load data for dashboard
        await loadAll();
      } catch (err) {
        console.error("admin init error", err);
        window.location.href = "/";
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function loadAll() {
    try {
      const [cRes, pRes, uRes] = await Promise.all([
        supabase.from("courses").select("*").order("created_at", { ascending: false }),
        supabase.from("problems").select("*").order("created_at", { ascending: false }),
        // include email if present in profiles to support set-by-email; include role/is_admin
        // Note: if your profiles table does not have `email`, Supabase will ignore unknown columns in many clients,
        // but if you face DB errors here remove `email` from the select string.
        supabase.from("profiles").select("id, username, display_name, email, role, is_admin, created_at").order("created_at", { ascending: false }),
      ]);

      if (cRes.error) console.warn("courses load err", cRes.error);
      if (pRes.error) console.warn("problems load err", pRes.error);
      if (uRes.error) console.warn("users load err", uRes.error);

      setCourses(cRes.data || []);
      setProblems(pRes.data || []);
      setUsers(uRes.data || []);
      // reset any editing maps for fresh data
      setEditingTopicsMap({});
    } catch (err) {
      console.error("loadAll failed", err);
    }
  }

  /* ----------------- Course / Problem / Enrollment actions ----------------- */

  // add a topic to the create-course local list
  function addTopicLocal(e) {
    e?.preventDefault?.();
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
        // include topics array (or null if empty)
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

      await loadAll();
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
      // reload lists
      await loadAll();
      // if we were editing this course, clear the form
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

    // If the user provided a link-like value, ensure it is a valid URL (basic)
    if (probLink && !isValidUrl(probLink)) {
      return setActionMsg({ type: "error", text: "Problem link looks invalid. Use a full URL (https://...)" });
    }

    if (probVideo && !isValidUrl(probVideo) && probVideo.trim() !== "") {
      // allow empty string or plain text, but if it looks like a link it should be valid
      return setActionMsg({ type: "error", text: "Video solution looks like a URL but it's invalid. Use full URL (https://...)" });
    }

    try {
      // Preferred attempt: insert with video_solution and text_solution
      const payload = {
        title: probTitle,
        platform: probPlatform,
        link: probLink || null,
        difficulty: probDifficulty,
        created_by: profile.id,
        video_solution: probVideo && String(probVideo).trim() ? String(probVideo).trim() : null,
        text_solution: probText && String(probText).trim() ? String(probText).trim() : null,
      };

      // Try insert with the preferred columns first
      const { data: newProb, error } = await supabase
        .from("problems")
        .insert([payload])
        .select()
        .single();

      if (error) {
        // If insertion failed due to unknown columns (schema mismatch), fallback to older `solution` column
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
        // attach to course_problems if applicable
        if (selectedCourseId) {
          const { error: cpErr } = await supabase.from("course_problems").insert([{
            course_id: selectedCourseId,
            problem_id: newProb2.id
          }]);
          if (cpErr) throw cpErr;
        }

        // success fallback
        setProbTitle(""); setProbLink(""); setProbDifficulty("easy"); setSelectedCourseId("");
        setProbVideo(""); setProbText("");
        await loadAll();
        setActionMsg({ type: "success", text: "Problem added (fallback to legacy `solution` column)." });
        return;
      }

      // success with preferred insert
      if (selectedCourseId) {
        const { error: cpErr } = await supabase.from("course_problems").insert([{
          course_id: selectedCourseId,
          problem_id: newProb.id
        }]);
        if (cpErr) throw cpErr;
      }

      setProbTitle(""); setProbLink(""); setProbDifficulty("easy"); setSelectedCourseId("");
      setProbVideo(""); setProbText("");
      await loadAll();
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
    if (r === "super_admin" || r === "admin") return ALL_ROLES;
    if (r === "moderator") return MODERATOR_ALLOWED;
    return ["user"];
  }

  // attempt to find profile by email (best-effort)
  async function findProfileByEmail(email) {
    // first, try profiles.email column (if exists)
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, email, role")
        .ilike("email", email)
        .limit(1);

      if (!error && data && data.length > 0) return data[0];
    } catch (err) {
      // ignore
    }

    // fallback: try username eq local part
    try {
      const local = email.split("@")[0];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, email, role")
        .ilike("username", local)
        .limit(1);

      if (!error && data && data.length > 0) return data[0];
    } catch (err) {
      // ignore
    }

    return null;
  }

  // set role for a given profile id
  async function setRoleForProfileId(profileId, role) {
    if (!profileId) return { error: "no profile id" };
    try {
      const { error } = await supabase.from("profiles").upsert({ id: profileId, role }, { onConflict: "id" });
      if (error) return { error };
      // refresh users list
      await loadAll();
      return { ok: true };
    } catch (err) {
      return { error: err };
    }
  }

  // set role by email (UI action)
  async function handleSetRoleByEmail(e) {
    e?.preventDefault();
    setActionMsg(null);
    const email = (roleEmail || "").trim().toLowerCase();
    const desired = (roleToSet || "").toLowerCase();

    if (!email || !desired) return setActionMsg({ type: "error", text: "Email and role required" });

    // permission check: if current operator is moderator, restrict roles
    const allowed = getAllowedRolesForOperator();
    if (!allowed.includes(desired)) {
      return setActionMsg({ type: "error", text: "You are not permitted to set that role" });
    }

    setActionMsg({ type: "info", text: "Searching user..." });

    const found = await findProfileByEmail(email);
    if (!found) {
      return setActionMsg({ type: "error", text: "User not found in profiles. Make sure the user completed signup (profiles row exists)." });
    }

    // special: do not allow moderator to set someone to admin/super_admin
    if (profile.role === "moderator" && !MODERATOR_ALLOWED.includes(desired)) {
      return setActionMsg({ type: "error", text: "Moderators can only set premium or user roles." });
    }

    // prevent moderators from changing their own role to escalate (optional)
    if (found.id === profile.id && profile.role !== "super_admin") {
      return setActionMsg({ type: "error", text: "You cannot change your own role." });
    }

    // apply
    setActionMsg({ type: "info", text: `Setting role ${desired} for ${found.display_name || found.username || found.email || found.id}...` });
    const res = await setRoleForProfileId(found.id, desired);
    if (res.error) {
      console.error(res.error);
      setActionMsg({ type: "error", text: "Failed to set role: " + (res.error.message || JSON.stringify(res.error)) });
      return;
    }

    setActionMsg({ type: "success", text: `Role set to ${desired} for ${found.display_name || found.username || found.email || found.id}` });
    setRoleEmail("");
    setRoleToSet("user");
  }

  // inline change from users list
  async function handleInlineSetRole(uId, desired) {
    setActionMsg(null);
    const allowed = getAllowedRolesForOperator();
    if (!allowed.includes(desired)) {
      return setActionMsg({ type: "error", text: "Not allowed to set that role" });
    }
    if (uId === profile.id && profile.role !== "super_admin") {
      return setActionMsg({ type: "error", text: "You cannot change your own role." });
    }
    try {
      const { error } = await supabase.from("profiles").upsert({ id: uId, role: desired }, { onConflict: "id" });
      if (error) throw error;
      await loadAll();
      setActionMsg({ type: "success", text: "Role updated" });
    } catch (err) {
      console.error(err);
      setActionMsg({ type: "error", text: err.message || "Failed to update role" });
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
      await loadAll();
    } catch (err) {
      console.error(err);
      setActionMsg({ type: "error", text: err.message || "Save topics failed" });
    } finally {
      cancelEditTopics(courseId);
    }
  }

  if (loading) return <div className="p-6">Loading admin panel…</div>;

  // render
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
                            // quick inline edit using prompt to keep UI simple
                            const newVal = prompt("Edit topic", t);
                            if (newVal === null) return;
                            if (!newVal.trim()) {
                              // if empty -> remove
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

                {/* Solution inputs: video + text */}
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
                  onChange={e => setProbText(e.target.value)}
                  placeholder="Text solution (paste explanation or a link) - optional"
                  className="w-full p-2 field"
                  rows={4}
                />

                <select value={probDifficulty} onChange={e => setProbDifficulty(e.target.value)} className="w-full p-2 field">
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
                <select value={selectedCourseId} onChange={e => setSelectedCourseId(e.target.value)} className="w-full p-2 field">
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

            <div className="card p-4 hover-card">
              <h3 className="card-title">Set Role (by email)</h3>
              <div className="space-y-2">
                <form onSubmit={handleSetRoleByEmail}>
                  <input value={roleEmail} onChange={e => setRoleEmail(e.target.value)} placeholder="user@example.com" className="w-full p-2 field" />
                  <select value={roleToSet} onChange={e => setRoleToSet(e.target.value)} className="w-full p-2 field">
                    {getAllowedRolesForOperator().map(r => (
                      <option key={r} value={r} disabled={profile.role === "moderator" && !MODERATOR_ALLOWED.includes(r)}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                    <button className="btn btn-cyan" type="submit">Set Role</button>
                    <button className="btn" type="button" onClick={() => { setRoleEmail(""); setRoleToSet("user"); }}>Clear</button>
                  </div>
                </form>
              </div>
            </div>

            <div className="card p-4 hover-card">
              <h3 className="card-title">Quick Stats</h3>
              <div style={{ color: "var(--muted-2)", textAlign: "center" }}>
                <div>Courses: <strong style={{ color: "white" }}>{courses.length}</strong></div>
                <div>Problems: <strong style={{ color: "white" }}>{problems.length}</strong></div>
                <div>Profiles: <strong style={{ color: "white" }}>{users.length}</strong></div>
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

                      {/* topics display or editor */}
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
            <div className="space-y-2">
              {users.map(u => (
                <div key={u.id} className="user-row">
                  <div style={{ flex: 1 }}>
                    <div className="user-name">{u.display_name || u.username || u.email || u.id}</div>
                    <div className="user-sub">{u.email || ""}</div>
                  </div>

                  <div style={{ minWidth: 180 }}>
                    <select
                      value={u.role || "user"}
                      onChange={(e) => {
                        // optimistic local update; actual save happens on click Save
                        setUsers(prev => prev.map(x => x.id === u.id ? { ...x, role: e.target.value } : x));
                      }}
                      className="p-2 field"
                    >
                      {getAllowedRolesForOperator().map(r => (
                        <option
                          key={r}
                          value={r}
                          disabled={profile.role === "moderator" && !MODERATOR_ALLOWED.includes(r)}
                        >
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="btn btn-cyan"
                      onClick={() => handleInlineSetRole(u.id, (u.role || "user"))}
                      disabled={u.id === profile.id}
                      title={u.id === profile.id ? "You cannot change your own role" : "Save role"}
                    >
                      Save
                    </button>
                    <a href={`/profiles/${encodeURIComponent(u.id)}`} className="btn view-btn">View</a>
                  </div>
                </div>
              ))}
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
                        await loadAll();
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

        /* make inputs/selects readable (fixes difficulty / role visibility) */
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
