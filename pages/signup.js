// pages/signup.js
import Head from "next/head";
import { useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";

/*
  Signup page — stores full name in auth metadata and upserts profiles.display_name / profiles.full_name
  Improvements:
   - pre-check email via /api/check-email to show "email already has an account"
   - show clear message when email confirmation is required
   - only upsert profiles row when user object + session indicate authenticated
   - add handling so we DO NOT redirect when email confirmation is required
   - show resend confirmation button when account exists but email not confirmed (immediate UI)
*/

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  // resend UI state
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMsg, setResendMsg] = useState(null);

  // whether we should show the "Resend confirmation" button immediately
  const [canResend, setCanResend] = useState(false);

  // create or update profile row for a given user object and provided name
  async function createProfileIfNeeded(user, name) {
    if (!user) return;
    try {
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

      await supabase.from("profiles").upsert(
        {
          id: user.id,
          username,
          email: user.email || null,
          // prefer explicit 'name' passed in; fallback to metadata or username
          display_name: name || user.user_metadata?.full_name || username,
          full_name: name || user.user_metadata?.full_name || null,
          is_admin: false,
        },
        { onConflict: "id" }
      );
    } catch (err) {
      // Fail silently but log so you can inspect in console
      console.warn("profile upsert failed", err?.message || err);
    }
  }

  // call your API route to check if email already exists (auth.users or profiles)
  // Expecting server to return JSON: { ok?: true, exists: boolean, confirmed?: boolean, error?: string }
  async function checkEmailExists(emailToCheck) {
    try {
      const res = await fetch("/api/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailToCheck }),
      });
      if (!res.ok) {
        console.warn("check-email returned non-OK:", await res.text());
        return { ok: false, exists: false, confirmed: undefined, error: "Could not verify email availability. Try again later." };
      }
      const payload = await res.json();
      // normalize
      return {
        ok: true,
        exists: !!payload.exists,
        confirmed: payload.confirmed === true ? true : (payload.confirmed === false ? false : undefined),
      };
    } catch (err) {
      console.error("check-email fetch error:", err);
      return { ok: false, exists: false, confirmed: undefined, error: "Could not verify email availability. Try again later." };
    }
  }

  async function handleEmailSignup(e) {
    e?.preventDefault();
    setMessage(null);
    setResendMsg(null);
    setCanResend(false);

    if (!fullName || !email || !password) {
      setMessage({ type: "error", text: "Full name, email and password are required." });
      return;
    }

    setLoading(true);
    try {
      const trimmedEmail = String(email).trim().toLowerCase();

      // 1) pre-check email availability (server should indicate if it's unconfirmed)
      const check = await checkEmailExists(trimmedEmail);
      if (!check.ok) {
        setMessage({ type: "error", text: check.error || "Could not verify email availability. Try again later." });
        setLoading(false);
        return;
      }

      if (check.exists) {
        // If server explicitly told us this account exists but is NOT confirmed -> show resend UI immediately
        if (check.confirmed === false) {
          setMessage({
            type: "success",
            text: "An account already exists for this email but it is not confirmed. Please check your email to confirm or resend confirmation."
          });
          setCanResend(true);
          setLoading(false);
          return;
        }

        // If confirmed is true -> normal "already registered" error
        if (check.confirmed === true) {
          setMessage({
            type: "error",
            text: "This email already has an account. If you forgot your password use 'Forgot password' or sign in."
          });
          setCanResend(false);
          setLoading(false);
          return;
        }

        // If server couldn't determine confirmed status, fallback to telling user account exists
        setMessage({ type: "error", text: "This email already has an account." });
        setCanResend(false);
        setLoading(false);
        return;
      }

      // 2) proceed to sign up
      // include full_name in auth metadata so it is available after confirmation
      const { data, error } = await supabase.auth.signUp({
  email: trimmedEmail,
  password,
  options: {
    data: {
      full_name: fullName
    }
  }
});


      if (error) {
        // Handle race / existing user errors: detect email_exists robustly
        console.error("supabase signUp error:", error);

        const isAlreadyRegistered =
          error?.code === "email_exists" ||
          error?.status === 422 ||
          (typeof error?.message === "string" && /already/i.test(error.message));

        if (isAlreadyRegistered) {
          // Re-check via server to determine confirmed state and show appropriate UI
          const recheck = await checkEmailExists(trimmedEmail);
          if (recheck.ok && recheck.exists && recheck.confirmed === false) {
            setMessage({
              type: "success",
              text: "An account already exists for this email but it is not confirmed. Please check your email to confirm or resend confirmation."
            });
            setCanResend(true);
            setLoading(false);
            return;
          }

          // If confirmed => instruct to sign in or reset password
          if (recheck.ok && recheck.exists && recheck.confirmed === true) {
            setMessage({
              type: "error",
              text: "This email already has an account. Please sign in or use Forgot password to reset your password."
            });
            setCanResend(false);
            setLoading(false);
            return;
          }

          // Fallback: generic already-registered message
          setMessage({ type: "error", text: "This email already has an account." });
          setCanResend(false);
          setLoading(false);
          return;
        }

        // Generic error handling
        setMessage({
          type: "error",
          text:
            error?.message === "Failed to send confirmation email."
              ? "Could not send confirmation email — check SMTP settings."
              : error?.message || "Database error saving new user",
        });
        setCanResend(false);
        setLoading(false);
        return;
      }

      // signUp returns data which may include .user and possibly a .session
      const signedUpUser = data?.user ?? null;
      const session = data?.session ?? null;

      // ---- NEW: Ensure profile upsert uses the fullName the user entered ----
      // If we have a user object returned, attempt to create/upsert the profile using the provided fullName.
      // This ensures display_name/full_name use what the user typed (avoiding the email-derived fallback).
      if (signedUpUser) {
        try {
          // best-effort: if RLS prevents anon upsert this will fail silently (we log)
          await createProfileIfNeeded(signedUpUser, fullName);
        } catch (err) {
          console.warn("createProfileIfNeeded after signup (best-effort) failed:", err);
        }
      }
      // ---------------------------------------------------------------------

      // Determine whether the user is actually authenticated already:
      // - If a session exists => the user is signed in (no email confirmation required)
      // - If session is null but user.email_confirmed_at exists => already confirmed
      // Otherwise, email confirmation is required.
      const emailConfirmed = !!(signedUpUser && signedUpUser.email_confirmed_at);

      if (signedUpUser && (session || emailConfirmed)) {
        // Authenticated — create profile and redirect (redundant but safe)
        await createProfileIfNeeded(signedUpUser, fullName);
        setMessage({ type: "success", text: "Signup successful — redirecting…" });
        setCanResend(false);
        // small delay so user sees message
        setTimeout(() => (window.location.href = "/"), 800);
        return;
      }

      // No session and not confirmed -> confirmation required. DO NOT redirect.
      setMessage({
        type: "success",
        text: "Signup requested. Check your email to confirm your account. You must confirm before logging in.",
      });
      setCanResend(true);
      // do not create profile row until user confirms and signs in (we already attempted a best-effort upsert above)
    } catch (err) {
      console.error("signup error", err);
      setMessage({ type: "error", text: "Unexpected error — check console & Supabase logs." });
      setCanResend(false);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setMessage(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
      });
      if (error) {
        setMessage({ type: "error", text: error.message || "OAuth signup failed." });
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

  // Optional: resend confirmation (calls server endpoint /api/resend-confirmation if present)
  async function handleResendConfirmation() {
    if (!email) {
      setResendMsg({ type: "error", text: "Enter your email in the form above first." });
      return;
    }
    setResendLoading(true);
    setResendMsg(null);
    try {
      const res = await fetch("/api/resend-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: String(email).trim().toLowerCase() }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Show server-provided error if available; otherwise a friendly message
        const text = payload?.error || payload?.message || `Resend failed (${res.status})`;
        // If server returned an email_exists / 422, give clearer guidance
        if (res.status === 422 || (payload && /email_exists/i.test(String(payload?.error || "")))) {
          setResendMsg({
            type: "error",
            text: "That email already has an account — try signing in or resetting your password."
          });
        } else {
          setResendMsg({ type: "error", text });
        }
      } else {
        setResendMsg({ type: "success", text: "Confirmation email resent — check your inbox." });
        setCanResend(true); // allow resend to stay visible after resending
      }
    } catch (err) {
      console.error("resend-confirmation error:", err);
      setResendMsg({ type: "error", text: "Network/server error while resending confirmation." });
    } finally {
      setResendLoading(false);
    }
  }

  // reset resend state when user edits the email input
  function onEmailChange(v) {
    setEmail(v);
    setCanResend(false);
    setResendMsg(null);
    // do not clear success/error message automatically, user may want to read it
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

        .resend-row { display: flex; gap: 8px; align-items: center; justify-content: center; margin-top: 8px; }
        .msg { text-align: center; margin-top: 8px; font-size: 14px; }
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
                onChange={(e) => onEmailChange(e.target.value)}
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

              {/* show resend UI when signup required email confirmation or when pre-check finds unconfirmed account */}
              {(canResend || (message.type === "success" && message.text && message.text.toLowerCase().includes("confirm"))) && (
                <>
                  <div className="resend-row">
                    <button
                      type="button"
                      className="btn"
                      onClick={handleResendConfirmation}
                      disabled={resendLoading}
                    >
                      {resendLoading ? "Resending…" : "Resend confirmation email"}
                    </button>
                  </div>

                  {resendMsg && (
                    <div className="msg" style={{ color: resendMsg.type === "error" ? "#FB7185" : "#34D399" }}>
                      {resendMsg.text}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
