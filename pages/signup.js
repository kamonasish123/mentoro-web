// pages/signup.js
import Head from "next/head";
import { useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";

/*
  Signup page — stores full name in auth metadata and upserts profiles.display_name / profiles.full_name
*/
export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  // create or update profile row for a given user object and provided name
  async function createProfileIfNeeded(user, name) {
    if (!user) return;
    try {
      // create a sane username fallback from email or full name
      const usernameFromEmail = user.email ? user.email.split("@")[0] : "";
      const usernameFromName =
        name
          ? name
              .toLowerCase()
              .trim()
              .replace(/\s+/g, "-")
              .replace(/[^a-z0-9\-]/g, "")
          : "";
      const username = usernameFromEmail || usernameFromName || user.id;

      // upsert profile row with display_name and full_name and email
      await supabase.from("profiles").upsert(
        {
          id: user.id,
          username,
          email: user.email || null,
          display_name: name || user.user_metadata?.full_name || username,
          full_name: name || user.user_metadata?.full_name || null,
          is_admin: false,
        },
        { onConflict: "id" }
      );
    } catch (err) {
      console.warn("profile upsert failed", err?.message || err);
    }
  }

  async function handleEmailSignup(e) {
    e?.preventDefault();
    setMessage(null);

    if (!fullName || !email || !password) {
      setMessage({ type: "error", text: "Full name, email and password are required." });
      return;
    }

    setLoading(true);
    try {
      // include full_name in auth user metadata so we can backfill / reference it later
      const { data, error } = await supabase.auth.signUp(
        { email, password },
        { data: { full_name: fullName } }
      );

      if (error) {
        setMessage({ type: "error", text: error.message });
        setLoading(false);
        return;
      }

      // try to get the created user (may be null if email confirmation required)
      const { data: current } = await supabase.auth.getUser();
      const user = current?.user ?? data?.user ?? null;

      // Upsert profile if we have a user id (works for immediate signups).
      // If the signup requires email confirmation and the user object is not present,
      // the profile will be created later when the user signs in (or you can backfill).
      if (user) {
        await createProfileIfNeeded(user, fullName);
      } else {
        // best-effort: if no user is present, we still attempted to store name in auth metadata above
        // and can create profile later when user confirms / signs in.
      }

      setMessage({
        type: "success",
        text:
          data?.user
            ? "Signup successful — redirecting…"
            : "Signup requested. Check your email to confirm your account.",
      });

      // if user is available (no confirmation required), redirect home
      if (user) {
        setTimeout(() => (window.location.href = "/"), 800);
      }
    } catch (err) {
      console.error("signup error", err);
      setMessage({ type: "error", text: "Unexpected error — see console." });
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setMessage(null);
    setLoading(true);
    try {
      // Redirect-based OAuth (Supabase will handle callback)
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
      });
      if (error) {
        setMessage({ type: "error", text: error.message });
      } else {
        setMessage({ type: "info", text: "Opening Google sign-in…" });
      }
    } catch (err) {
      console.error("google oauth", err);
      setMessage({ type: "error", text: "Unexpected error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>Sign up — Kamonasish</title>
      </Head>

      <style jsx global>{`
        :root {
          --font-body: Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
          --bg-dark: #0f172a;
          --grid-cyan: rgba(0,210,255,0.03);
          --accent-cyan: #00d2ff;
          --card-bg: rgba(255,255,255,0.03);
          --card-border: rgba(255,255,255,0.06);
          --muted: rgba(255,255,255,0.75);
          --muted-2: rgba(255,255,255,0.55);
        }
        html, body, #__next { height: 100%; }
        body {
          margin: 0;
          font-family: var(--font-body);
          background: var(--bg-dark);
          color: var(--muted);
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          background-image:
            linear-gradient(var(--grid-cyan) 1px, transparent 1px),
            linear-gradient(90deg, var(--grid-cyan) 1px, transparent 1px);
          background-size: 50px 50px;
        }

        .card {
          background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.02));
          border: 1px solid var(--card-border);
          border-radius: 14px;
          box-shadow: 0 10px 30px rgba(2,6,23,0.6);
          color: var(--muted);
        }

        .btn {
          padding: 0.65rem 1.25rem;
          border-radius: 8px;
          font-weight: 700;
          letter-spacing: 0.6px;
          cursor: pointer;
          transition: transform 200ms ease, box-shadow 200ms ease;
          border: 1px solid transparent;
          display: inline-flex;
          align-items: center;
          gap: 0.6rem;
        }

        .btn-cyan {
          background: rgba(0, 210, 255, 0.08);
          color: var(--accent-cyan);
          border-color: rgba(0,210,255,0.18);
        }

        .btn-cyan:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 30px rgba(0,210,255,0.08);
          background: rgba(0,210,255,0.12);
          color: #071226;
        }

        input[type="text"], input[type="email"], input[type="password"] {
          background: transparent;
          border: 1px solid rgba(255,255,255,0.06);
          padding: 0.8rem;
          border-radius: 8px;
          width: 100%;
          color: white;
          outline: none;
          transition: border-color 140ms ease, box-shadow 140ms ease;
        }
        input::placeholder { color: rgba(255,255,255,0.55); }
        input:focus {
          border-color: rgba(0,210,255,0.28);
          box-shadow: 0 6px 20px rgba(0,210,255,0.06);
        }

        .small-muted { color: var(--muted-2); font-size: 0.95rem; text-align: center; }
        .google-icon { width: 18px; height: 18px; display: inline-block; vertical-align: middle; }
      `}</style>

      <main className="min-h-screen flex items-center justify-center p-6">
        <div style={{ width: 420 }} className="card p-6">
          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <h1 style={{ margin: 0, fontSize: 22, color: "white", fontWeight: 800 }}>Create account</h1>
            <div className="small-muted" style={{ marginTop: 8 }}>
              Join the mentoring platform — learn competitive programming and practice problems.
            </div>
          </div>

          <button
            onClick={handleGoogle}
            className="btn btn-cyan"
            disabled={loading}
            type="button"
            style={{ marginBottom: 14, justifyContent: "center", width: "100%" }}
          >
            <svg className="google-icon" viewBox="0 0 533.5 544.3" xmlns="http://www.w3.org/2000/svg" aria-hidden>
              <path d="M533.5 278.4c0-18-1.6-35.2-4.6-52H272v98.5h146.9c-6.3 34-25 62.9-53.4 82.2v68.1h86.2c50.4-46.4 82.8-114.9 82.8-196.8z" fill="#4285F4"/>
              <path d="M272 544.3c72.8 0 134-24.3 178.6-65.9l-86.2-68.1c-24 16.1-54.8 25.7-92.4 25.7-71.1 0-131.3-48-152.8-112.3H32.5v70.7C76.5 487.9 167.2 544.3 272 544.3z" fill="#34A853"/>
              <path d="M119.2 325.7c-10.6-31.9-10.6-66.5 0-98.4V156.6H32.5c-37.7 73.1-37.7 158.6 0 231.7l86.7-62.6z" fill="#FBBC05"/>
              <path d="M272 107.7c39.6-.6 77.6 14.4 106.4 41.6l79.8-79.8C406.3 22 344.9-1.6 272 0 167.2 0 76.5 56.4 32.5 142.9l86.7 70.8C140.7 155.6 200.9 107.7 272 107.7z" fill="#EA4335"/>
            </svg>
            <span style={{ marginLeft: 8 }}>{loading ? "Opening…" : "Continue with Google"}</span>
          </button>

          <div style={{ margin: "10px 0 16px" }} className="small-muted">or sign up with email</div>

          <form onSubmit={handleEmailSignup} className="space-y-3" aria-label="Signup form">
            <div>
              <label className="small-muted" style={{ display: "block", marginBottom: 6 }}>Full name</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Kamonasish Roy"
                className="w-full"
                type="text"
                required
              />
            </div>

            <div>
              <label className="small-muted" style={{ display: "block", marginBottom: 6 }}>Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                type="email"
                required
              />
            </div>

            <div>
              <label className="small-muted" style={{ display: "block", marginBottom: 6 }}>Password</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  type={showPassword ? "text" : "password"}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="btn"
                  style={{ padding: "0.6rem", background: "transparent", border: "1px solid rgba(255,255,255,0.04)" }}
                  aria-pressed={showPassword}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div style={{ marginTop: 6 }}>
              <button className="btn btn-cyan" disabled={loading} type="submit" style={{ width: "100%", justifyContent: "center" }}>
                {loading ? "Signing up…" : "Sign up"}
              </button>
            </div>
          </form>

          <div style={{ marginTop: 14, textAlign: "center" }}>
            <div className="small-muted" style={{ marginBottom: 8 }}>Already have an account?</div>
            <button
              type="button"
              className="btn btn-cyan"
              onClick={() => router.push("/login")}
              style={{ width: "100%", justifyContent: "center" }}
            >
              Sign in
            </button>
          </div>

          {message && (
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  fontSize: 14,
                  textAlign: "center",
                  color:
                    message.type === "error" ? "#FB7185" : message.type === "success" ? "#34D399" : "rgba(255,255,255,0.75)",
                }}
              >
                {message.text}
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}