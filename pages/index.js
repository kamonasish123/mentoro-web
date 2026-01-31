// pages/index.js
import Head from 'next/head'
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const projects = [
  { id: 'mentoro', title: 'Mentoro', desc: 'Interactive tutorial app for competitive programmers', tags: ['React Native', 'Firebase'] },
  { id: 'child-security', title: 'Child Security App', desc: 'Educational & safety features', tags: ['Kotlin', 'Firebase'] },
  { id: 'ahmed-classroom', title: "Ahmed's Classroom App", desc: 'Performance optimizations — reduced load times', tags: ['Flutter'] },
]

// Edit these values. Leave empty string '' when a link is not available.
const contacts = {
  email: 'rkamonasish@gmail.com',
  linkedin: 'https://www.linkedin.com/in/kamonasish-roy-rony',
  github: 'https://github.com/kamonasish123',
  youtube: 'https://www.youtube.com/@kamonasishroyrony',
  facebook: 'https://www.facebook.com/kamonasishroyrony',
  instagram: 'https://www.instagram.com/kamonasishr',
  cv: '',
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

export default function Home() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);

  // auth + profile
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);

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

  // list of all courses to show on homepage (with counts & whether user enrolled)
  const [coursesList, setCoursesList] = useState([]);
  const [loadingCoursesList, setLoadingCoursesList] = useState(true);

  // Topic filtering & selection state
  const [uniqueTopics, setUniqueTopics] = useState([]); // ordered list of unique topics for filter chips
  const [selectedTopics, setSelectedTopics] = useState([]); // topics currently selected (order preserved)
  const [topicPickerValue, setTopicPickerValue] = useState(""); // select value for adding a topic
  const [showTopicControls, setShowTopicControls] = useState(false); // checkbox controls visibility

  // show limited cards on homepage
  const [showAllCourses, setShowAllCourses] = useState(false);

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

  // fetch course by slug 'cp-foundations', its problem count and enrolled count
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingCpCourse(true);
      try {
        const { data: courses } = await supabase
          .from("courses")
          .select("id, slug, title, description")
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

        const { count: enrolledCount } = await supabase
          .from("enrollments")
          .select("id", { count: "exact", head: false })
          .eq("course_id", c.id);

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
  // then fetch per-course counts and whether current user is enrolled (so UI is accurate)
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

        // get current user id (if any)
        const { data: userData } = await supabase.auth.getUser();
        const u = userData?.user ?? null;
        const uid = u?.id ?? null;

        // for each course, fetch counts and whether current user enrolled.
        const enhanced = await Promise.all(courses.map(async (c) => {
          try {
            const [{ count: problemCount }, { count: enrolledCount }] = await Promise.all([
              supabase.from("course_problems").select("id", { count: "exact", head: false }).eq("course_id", c.id),
              supabase.from("enrollments").select("id", { count: "exact", head: false }).eq("course_id", c.id),
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

            return {
              ...c,
              problemCount: typeof problemCount === "number" ? problemCount : 0,
              enrolledCount: typeof enrolledCount === "number" ? enrolledCount : 0,
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

        if (mounted) setCoursesList(enhanced);
      } catch (err) {
        console.error("unexpected error fetching courses list", err);
        if (mounted) setCoursesList([]);
      } finally {
        if (mounted) setLoadingCoursesList(false);
      }
    })();
    return () => { mounted = false };
  }, []);

  // derive uniqueTopics when coursesList changes
  useEffect(() => {
    const map = new Map();
    (coursesList || []).forEach(c => {
      const t = parseTopicsFromRow(c);
      t.forEach((topic) => {
        const key = String(topic).trim();
        if (!key) return;
        if (!map.has(key)) map.set(key, { topic: key, count: 0 });
        map.get(key).count++;
      });
    });
    // order by frequency desc then by first-encounter order (Map insertion)
    const arr = Array.from(map.values()).sort((a, b) => b.count - a.count);
    const topicsOnly = arr.map(x => x.topic);
    setUniqueTopics(topicsOnly);
    // prune selectedTopics that are no longer available
    setSelectedTopics(prev => prev.filter(t => topicsOnly.includes(t)));
  }, [coursesList]);

  // when the picker value changes, add it automatically (auto-apply), then clear picker
  useEffect(() => {
    if (!topicPickerValue) return;
    const t = topicPickerValue.trim();
    if (!t) return;
    setSelectedTopics(prev => {
      if (prev.includes(t)) return prev;
      return [...prev, t];
    });
    setTopicPickerValue("");
  }, [topicPickerValue]);

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
        } else {
          console.error("enroll failed", error);
          alert("Enroll failed: " + error.message);
        }
      } else {
        // success: bump enrolled count and mark user enrolled
        setUserEnrolledOnHome(true);
        setCpCourse((prev) => prev ? { ...prev, enrolledCount: (prev.enrolledCount || 0) + 1 } : prev);
        // also update coursesList entry if present
        setCoursesList((prev) => prev.map(row => row.id === cpCourse.id ? { ...row, enrolledCount: (row.enrolledCount || 0) + 1, userEnrolled: true } : row));
      }
    } catch (err) {
      console.error("unexpected enroll error", err);
      alert("Unexpected error while enrolling");
    } finally {
      setEnrollActionLoading(false);
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
      const update = {
        id: user.id,
        institution: editInstitution ?? null,
        country: editCountry ?? null,
      };
      // upsert the profile fields
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
        setProfile((p) => p ? { ...p, institution: update.institution, country: update.country } : p);
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

      // upload to 'avatars' bucket — ensure the bucket exists and is public or you handle signed URLs
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

      // save to profiles.avatar_url
      const { error: profErr } = await supabase.from("profiles").upsert({
        id: user.id,
        avatar_url: publicUrl,
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

  /* ---------- Render helpers for course cards ---------- */
  function CourseCard({ courseObj, isCpFallback = false }) {
    // topics (admin will provide these fields)
    const topics = parseTopicsFromRow(courseObj);
    const cpFallbackTopics = ["Big-O & greedy", "Binary search", "Basic graphs"];
    const finalTopics = topics.length ? topics.slice(0, 8) : (isCpFallback ? cpFallbackTopics : []);

    // counts - try multiple common field names, otherwise fallback to provided fields
    const enrolledCount = (typeof courseObj.enrolledCount === 'number') ? courseObj.enrolledCount : (typeof courseObj.enrolled_count === 'number' ? courseObj.enrolled_count : 0);
    const problemCount = (typeof courseObj.problemCount === 'number') ? courseObj.problemCount : (typeof courseObj.problem_count === 'number' ? courseObj.problem_count : 0);

    // course type (defensive naming)
    const courseType = courseObj.course_type || courseObj.courseType || courseObj.type || "";

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
            <span style={{ fontWeight: 700, color: 'var(--muted-2)' }}>👥 {typeof enrolledCount === 'number' ? enrolledCount : '—'} enrolled</span>
            <span style={{ fontWeight: 700, color: 'var(--muted-2)' }}>📚 {typeof problemCount === 'number' ? problemCount : '—'} problems</span>
          </div>

          {/* center the action button below counts */}
          <div style={{ marginTop: 14, textAlign: 'center' }}>
            {isCpFallback ? (
              loadingCpCourse ? (
                <button className="btn btn-cyan" disabled>Loading…</button>
              ) : cpCourse ? (
                userEnrolledOnHome ? (
                  // Only allow opening the course if user is enrolled
                  <Link href={`/enroll?course=${encodeURIComponent(cpCourse.slug)}`} className="btn btn-cyan" style={{ display: 'inline-block' }}>Open Course</Link>
                ) : (
                  // handleHomeEnroll will redirect to login if needed
                  <button className="btn btn-cyan" onClick={handleHomeEnroll} disabled={enrollActionLoading} style={{ display: 'inline-block' }}>
                    {enrollActionLoading ? "Enrolling…" : "Enroll Now"}
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
                  <Link href={`/enroll?course=${encodeURIComponent(courseObj.slug)}`} className="btn btn-cyan" style={{ display: 'inline-block' }}>Enroll Now</Link>
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
      const exists = prev.includes(topic);
      if (exists) return prev.filter(t => t !== topic);
      return [...prev, topic];
    });
  }

  function clearFilters() {
    setSelectedTopics([]);
  }

  // compute which courses to show based on selectedTopics (AND filter)
  const coursesToShow = (coursesList || []).filter(c => {
    if (!showTopicControls) return true;
    if (!selectedTopics || selectedTopics.length === 0) return true;
    const topics = parseTopicsFromRow(c).map(String);
    // require all selected topics to be present (narrowing filter)
    return selectedTopics.every(st => topics.includes(st));
  });

  // helper to show first N cards unless showAllCourses is true
  const visibleCourses = showAllCourses ? coursesToShow : coursesToShow.slice(0, 6);

  return (
    <div>
      <Head>
        <title>Kamonasish Roy</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Kamonasish Roy — Software Engineer, Competitive Programmer, and Mentor." />
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
        .btn-cyan {
          background: rgba(0, 210, 255, 0.06);
          border-color: rgba(0,210,255,0.18);
          color: var(--accent-cyan);
        }
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
        .grid-responsive {
          display: grid;
          grid-template-columns: repeat(1, minmax(0, 1fr));
          gap: 0.75rem;
        }
        @media (min-width: 640px) { .grid-responsive { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (min-width: 1024px) { .grid-responsive { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
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
  padding: 12px;
  border-radius: 12px;
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.04);
  box-shadow: 0 10px 30px rgba(2,6,23,0.6);
  z-index: 50;
  transition: transform 200ms ease, box-shadow 200ms ease, background-color 200ms ease, border-color 200ms ease;
  cursor: pointer;
}

/* hover highlight (mimic btn-cyan hover) */
.profile-panel:hover {
  background: var(--card-hover-bg);
  border-color: var(--accent-cyan);
  transform: translateY(-4px) scale(1.01);
  box-shadow: 0 14px 40px rgba(0,210,255,0.12);
}

/* text color changes on hover to match button contrast */
.profile-panel .panel-name { color: var(--text-light); font-weight:700; font-size:15px; margin-top:8px; }
.profile-panel .panel-meta { color: var(--muted-2); font-size:13px; font-weight:600; margin-top:4px; }

/* when hovered, make meta/dark text for contrast */
.profile-panel:hover .panel-name,
.profile-panel:hover .panel-meta {
  color: var(--bg-dark);
}

/* hide panel on small screens */
@media (max-width: 1023px) {
  .profile-panel { display: none; }
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
  cursor: pointer;
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

/* FIX: filter & typing box visibility
   - ensure the select / picker and the manual typing input inside the topic controls
     are dark background with readable (light) text and visible placeholder.
   - limited, targeted rules so rest of UI is unchanged.
*/
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
.topic-toolbar input::placeholder,
.topic-toolbar select::placeholder,
.topic-toolbar .field::placeholder {
  color: rgba(255,255,255,0.45) !important;
}

/* small tweak: ensure course-stats items stay single-line and centered */
.course-stats { white-space: nowrap; display: flex; gap: 18px; align-items: center; justify-content: center; }
      `}</style>

      <main className="min-h-screen">
        <header className="max-w-5xl mx-auto p-6 sm:p-10">
          <nav className="flex items-center justify-between" aria-label="Main navigation">
            <div className="text-lg font-semibold title">Kamonasish</div>
            <div className="space-x-4 hidden md:inline-flex items-center">
              <a className="nav-link" href="#projects">Projects</a>
              <a className="nav-link" href="#teach">Teach</a>
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
              {isAdmin && (
                <Link href="/admin" className="btn btn-cyan">
                  Admin
                </Link>
              )}
            </div>
            <button className="md:hidden p-2 muted" type="button" aria-expanded="false" aria-controls="mobile-menu">Menu</button>
          </nav>

          <div className="mt-8 card p-6 sm:p-8 shadow">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <img className="w-40 h-52 sm:w-48 sm:h-64 rounded-2xl object-cover shadow-lg" src="/avatar.jpg" alt="Kamonasish Roy portrait" />
              <div className="flex-1">
                <h1 className="text-2xl sm:text-3xl font-extrabold title">
                  Kamonasish Roy — <span className="font-medium muted">I build fast algorithms and teach contest-winning strategies.</span>
                </h1>
                <p className="mt-3 muted">Software Engineer • Competitive Programmer • Mentor — I help students turn problem-solving into wins.</p>
                <div className="mt-4 flex gap-3">
                  <Link className="btn btn-cyan" href="/about">About Me</Link>
                </div>
              </div>
            </div>

            <div className="mt-6 p-3 rounded-lg grid grid-cols-2 sm:grid-cols-4 gap-3 text-center" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <div>
                <div className="text-sm muted-2">Experience</div>
                <div className="font-semibold title">2+ yrs</div>
              </div>
              <div>
                <div className="text-sm muted-2">Competitive</div>
                <div className="font-semibold title">6+ yrs</div>
              </div>
              <div>
                <div className="text-sm muted-2">Solved</div>
                <div className="font-semibold title">5000+</div>
              </div>
              <div>
                <div className="text-sm muted-2">CF</div>
                <div className="font-semibold title">Specialist (1475)</div>
              </div>
            </div>
          </div>
        </header>

        {/* LEFT PROFILE PANEL (desktop) */}
        {user && profile && (
          <aside className="profile-panel" title="Profile — click Update profile">
            <div style={{ textAlign: 'center', marginBottom: 10 }}>
              <div style={{ width: 84, height: 84, margin: "0 auto", borderRadius: 12, overflow: "hidden", background: "rgba(255,255,255,0.02)" }}>
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
              <div className="panel-meta" style={{ marginTop: 8 }}>{(profile.role || "user").toLowerCase()}</div>
            </div>

            <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
              <button className="btn btn-cyan btn-sm" onClick={openProfileModal}>
                Update profile
              </button>
            </div>

            <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted-2)" }}>
              Click <strong>Update profile</strong> to edit Institution, Country and upload a new avatar.
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
                  <label style={{ display: "block", fontSize: 13, color: "var(--muted-2)" }}>Avatar</label>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((p) => (
              <article
                key={p.id}
                className="hover-card p-6 text-center"
                role="button"
                tabIndex={0}
                onClick={() => window.alert(`${p.title} — demo click`)}
              >
                <div className="h-36 bg-gradient-to-r from-slate-700 to-slate-500 rounded-md mb-3 mx-auto w-full" role="img" aria-label={`${p.title} preview`}></div>
                <h3 className="font-semibold text-lg title">{p.title}</h3>
                <p className="muted-2 mt-2">{p.desc}</p>
                <div className="mt-3 flex flex-wrap gap-2 justify-center">
                  {p.tags.map((t, i) => (
                    <span key={i} className="text-xs px-2 py-1 bg-white/6 rounded text-white/90">{t}</span>
                  ))}
                </div>
                <div className="mt-4 flex gap-2 justify-center">
                  <button className="px-3 py-1 border rounded text-sm muted" type="button">Live Demo</button>
                  <button className="px-3 py-1 border rounded text-sm muted" type="button">Case Study</button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="teach" className="max-w-5xl mx-auto p-6 sm:p-10">
          <h2 className="text-xl font-bold mb-4 title">Learn Competitive Programming</h2>

          {/* Topic controls: checkbox to show/hide, picker to add topics (auto-apply), Clear only visible when selection exists */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <input type="checkbox" checked={showTopicControls} onChange={(e) => setShowTopicControls(e.target.checked)} />
              <span style={{ color: 'var(--muted-2)', fontSize: 14 }}>Show topic filters</span>
            </label>

            {showTopicControls && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {/* topic picker: choose one available (not already selected) */}
                <select
                  value={topicPickerValue}
                  onChange={(e) => setTopicPickerValue(e.target.value)}
                  className="p-2 field"
                  style={{ minWidth: 200 }}
                >
                  <option value="">— add topic to filter —</option>
                  {uniqueTopics.filter(t => !selectedTopics.includes(t)).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>

                {/* quick manual-add input (optional) */}
                <input
                  placeholder="Or type a topic and press Enter"
                  className="p-2 field"
                  style={{ minWidth: 240 }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const v = e.currentTarget.value.trim();
                      if (!v) return;
                      if (!selectedTopics.includes(v)) setSelectedTopics(prev => [...prev, v]);
                      e.currentTarget.value = '';
                    }
                  }}
                />

                {/* Clear visible only when there's at least one selected topic */}
                {selectedTopics.length > 0 ? (
                  <button className="btn" onClick={clearFilters}>Clear</button>
                ) : null}
              </div>
            )}

            {/* show chosen filters */}
            {showTopicControls && selectedTopics.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ color: "var(--muted-2)" }}>Filtering by:</div>
                <div style={{ marginTop: 6 }}>
                  {selectedTopics.map((s, i) => (
                    <button key={s} onClick={() => toggleTopicFilter(s)} className="topic-chip selected" style={{ marginRight: 6 }}>
                      {s} ×
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* If we have courses in DB, render them dynamically so newly created courses show up on homepage.
              Otherwise fallback to the original static three teaching cards. */}
          {loadingCoursesList ? (
            <div className="muted-2">Loading courses…</div>
          ) : (coursesList && coursesList.length > 0) ? (
            <>
              {visibleCourses.length === 0 ? (
                <div className="muted-2">No courses match the selected topics.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {visibleCourses.map((c) => (
                    <CourseCard key={c.id} courseObj={c} isCpFallback={c.slug === 'cp-foundations'} />
                  ))}
                </div>
              )}

              {/* view all toggle if there are more courses than our preview limit */}
              {coursesToShow.length > 6 && (
                <div style={{ marginTop: 12, textAlign: 'center' }}>
                  <button className="btn btn-cyan" onClick={() => setShowAllCourses(prev => !prev)}>
                    {showAllCourses ? "Show less" : `View all (${coursesToShow.length})`}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

              {/* CP Foundations: centered card (kept as fallback) */}
              <CourseCard courseObj={{
                id: cpCourse?.id ?? 'cp-fallback',
                slug: cpCourse?.slug ?? 'cp-foundations',
                title: cpCourse?.title ?? "CP Foundations",
                description: cpCourse?.description ?? "Foundations course for competitive programming",
                enrolledCount: cpCourse?.enrolledCount,
                problemCount: cpCourse?.problemCount,
              }} isCpFallback={true} />

              {/* Advanced Trees (centered) */}
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

              {/* Contest Strategy (centered) */}
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

        <footer className="max-w-5xl mx-auto p-6 sm:p-10">
          <div className="bg-white/5 p-6 rounded-lg shadow">
            <h4 className="font-semibold text-lg text-center title">Get in touch</h4>
           <br/>

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
                  <div>Email — No link available</div>
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
                  <div>LinkedIn — No link available</div>
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
                  <div>GitHub — No link available</div>
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
                  <div>YouTube — No link available</div>
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
                  <div>Facebook — No link available</div>
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
                  <div>Instagram — No link available</div>
                </div>
              )}

              {/* CV / Download */}
              {contacts.cv ? (
                <a href={contacts.cv} download className="contact-card" aria-label="Download CV">
                  <span aria-hidden="true">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 3v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M8 11l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <rect x="3" y="17" width="18" height="4" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                    </svg>
                  </span>
                  <div>
                    <div className="contact-title">Download CV</div>
                    <div className="contact-sub">PDF</div>
                  </div>
                </a>
              ) : (
                <div className="contact-disabled" aria-hidden="true">
                  <span aria-hidden="true">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 3v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M8 11l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <rect x="3" y="17" width="18" height="4" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                    </svg>
                  </span>
                  <div>Download CV — No link available</div>
                </div>
              )}
            </div>
          </div>
        </footer>

        {/* Floating admin button (dev) */}
        {isAdmin && (
          <Link href="/admin" className="admin-fab" aria-label="Admin (dev)">
            Admin
          </Link>
        )}
      </main>
    </div>
  )
}
