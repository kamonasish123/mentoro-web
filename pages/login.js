// pages/login.js
import Head from "next/head";
import { useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";

const SUPPORT_EMAIL = "rkamonasish@gmail.com"; // used in blocked message

// helper: extract a usable URL string from server payloads that may return
// action_link as either a string or an object { properties: { action_link: "..." }, ... }
function extractActionLink(payload) {
  if (!payload) return null;
  // normalize common locations
  const a = payload.action_link ?? payload.actionLink ?? payload.actionlink ?? null;
  if (!a) return null;
  if (typeof a === "string") return a;
  if (typeof a === "object") {
    // try common shapes:
    return (
      a.properties?.action_link ??
      a.action_link ??
      a.actionLink ??
      a.url ??
      // sometimes services return nested { action_link: { action_link: "..." } }
      (typeof a === "object" && a?.action_link?.properties?.action_link) ??
      null
    );
  }
  return null;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  // resend / reset UI state
  const [resendAvailable, setResendAvailable] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  // used for both "resend confirmation" responses and "reset link" debug info
  // ensure link is always a string when present
  const [resendMsg, setResendMsg] = useState(null);
  const googleDisabledMessage =
    "Google sign-in is currently unavailable. Please log in with email address.";

  async function handleEmailLogin(e) {
    e?.preventDefault();
    setMessage(null);
    setResendAvailable(false);
    setResendMsg(null);

    if (!email || !password) {
      setMessage({ type: "error", text: "Email and password required." });
      return;
    }

    setLoading(true);
    try {
      // signInWithPassword returns { data, error } in supabase-js v2
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Detect common unconfirmed / confirmation related messages and show resend UI
        const emsg = String(error.message || "").toLowerCase();
        const isConfirmRelated = emsg.includes("confirm") || emsg.includes("confirmed") || emsg.includes("verification") || emsg.includes("verify");
        setMessage({ type: "error", text: error.message || "Login failed." });
        if (isConfirmRelated) {
          setResendAvailable(true);
        }
        return;
      }

      // get the authenticated user (should be present)
      let user = null;
      try {
        const { data: ud } = await supabase.auth.getUser();
        user = ud?.user ?? data?.user ?? null;
      } catch (e) {
        // fallback to returned data
        user = data?.user ?? null;
      }

      if (!user || !user.id) {
        // Unexpected: we have a session but no user id. Show a message and do not redirect.
        setMessage({ type: "error", text: "Login succeeded but user info unavailable. Please try again or contact admin." });
        return;
      }

      // Check if profile has is_blocked flag
      try {
        const { data: prof, error: profErr } = await supabase
          .from("profiles")
          .select("is_blocked")
          .eq("id", user.id)
          .single();

        if (profErr) {
          // If RLS prevents select or any other DB error, show message and do not redirect.
          console.warn("profile lookup after sign-in failed:", profErr);
          setMessage({ type: "error", text: "Login succeeded but we couldn't verify account status. Contact admin if the problem persists." });
          return;
        }

        if (prof && prof.is_blocked) {
          // sign the user out immediately and inform them
          try {
            await supabase.auth.signOut();
          } catch (signOutErr) {
            console.warn("signOut after blocked account:", signOutErr);
          }
          setMessage({
            type: "error",
            text: "Your account has been blocked. Contact administration to restore access."
          });
          return;
        }
      } catch (err) {
        console.error("error checking profile.is_blocked:", err);
        setMessage({ type: "error", text: "Login succeeded but checking account status failed. Contact admin." });
        return;
      }

      // Not blocked -> success: redirect to homepage
      setMessage({ type: "success", text: "Logged in — redirecting…" });
      router.replace("/");
    } catch (err) {
      console.error("login error", err);
      const emsg = String(err?.message || "").toLowerCase();
      const isConfirmRelated = emsg.includes("confirm") || emsg.includes("confirmed") || emsg.includes("verification") || emsg.includes("verify");
      setMessage({ type: "error", text: err?.message || "Unexpected error" });
      if (isConfirmRelated) setResendAvailable(true);
    } finally {
      setLoading(false);
    }
  }

  function handleGoogle(e) {
    e?.preventDefault?.();
    setMessage({ type: "info", text: googleDisabledMessage });
  }

  // NEW: Forgot password handler
  async function handleForgotPassword(e) {
    e?.preventDefault?.();
    setMessage(null);
    setResendMsg(null);

    const trimmed = String(email || "").trim().toLowerCase();
    if (!trimmed) {
      setMessage({ type: "error", text: "Please enter your email to receive a password reset link." });
      return;
    }

    setLoading(true);
    try {
      // Call server-side endpoint which uses the service role to generate a link
      const resp = await fetch("/api/send-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });

      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        // fallback: try client-side reset (gives GoTrue error if any)
        console.warn("send-reset failed:", payload);
        const { data, error } = await supabase.auth.resetPasswordForEmail(trimmed, {
          redirectTo: process.env.NEXT_PUBLIC_SITE_URL || undefined,
        });

        if (error) {
          // show helpful text & encourage server log check
          setMessage({ type: "error", text: error.message || "Failed to send reset email. Check server SMTP settings & logs." });
        } else {
          setMessage({ type: "success", text: "Password reset requested — check your email." });
        }
      } else {
        // server succeeded
        const link = extractActionLink(payload);
        if (link) {
          // helpful in dev so you can click the link if email doesn't arrive
          setResendMsg({
            type: "success",
            text: "Reset link generated. (Dev: link shown below so you can finish reset while debugging SMTP.)",
            link,
          });
          setMessage({ type: "success", text: "Password reset requested — check your email." });
        } else {
          setMessage({ type: "success", text: "Password reset requested — check your email." });
          setResendMsg({ type: "success", text: payload.info || "Reset request sent." });
        }
      }
    } catch (err) {
      console.error("forgot password error:", err);
      setMessage({ type: "error", text: "Unexpected error while requesting reset. Check server logs." });
    } finally {
      setLoading(false);
    }
  }

  // NEW: Resend confirmation (calls server endpoint same as signup page)
  async function handleResendConfirmation() {
    setResendMsg(null);

    const trimmed = String(email || "").trim().toLowerCase();
    if (!trimmed) {
      setResendMsg({ type: "error", text: "Enter your email in the form above first." });
      return;
    }

    setResendLoading(true);
    try {
      const res = await fetch("/api/resend-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResendMsg({ type: "error", text: payload?.error || `Resend failed (${res.status})` });
      } else {
        const link = extractActionLink(payload);
        if (link && process.env.NODE_ENV === "development") {
          setResendMsg({ type: "success", text: "Confirmation link generated (dev).", link });
        } else {
          setResendMsg({ type: "success", text: "Confirmation email resent — check your inbox." });
        }
      }
    } catch (err) {
      console.error("resend-confirmation error:", err);
      setResendMsg({ type: "error", text: "Network/server error while resending confirmation." });
    } finally {
      setResendLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>Login — Kamonasish</title>
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
        .oauth-disabled {
          cursor: not-allowed;
          opacity: 0.7;
          filter: grayscale(0.2);
        }
        .oauth-disabled:hover {
          transform: none;
          box-shadow: none;
        }

        .blocked-note { margin-top: 8px; color: #ffd7d7; font-weight: 700; text-align: center; }
        .blocked-contact { margin-top: 6px; text-align: center; font-size: 0.95rem; color: #ffd7d7; }
        .blocked-contact a { color: #fff; text-decoration: underline; }

        .resend-row { display:flex; justify-content:center; gap:8px; margin-top:8px; }
        .resend-msg { text-align:center; margin-top:6px; font-size:13px; }
      `}</style>

      <main className="min-h-screen flex items-center justify-center p-6">
        <div style={{ width: 420 }} className="card p-6">
          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <h1 style={{ margin: 0, fontSize: 22, color: "white", fontWeight: 800 }}>Sign in</h1>
            <div className="small-muted" style={{ marginTop: 8 }}>
              Welcome back — sign in to continue to your mentoring dashboard.
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <button
              onClick={handleGoogle}
              onMouseEnter={handleGoogle}
              onFocus={handleGoogle}
              title={googleDisabledMessage}
              aria-disabled="true"
              className="btn btn-cyan oauth-disabled"
              type="button"
              style={{ width: 360, maxWidth: "100%", justifyContent: "center" }}
            >
              <svg className="google-icon" viewBox="0 0 533.5 544.3" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                <path d="M533.5 278.4c0-18-1.6-35.2-4.6-52H272v98.5h146.9c-6.3 34-25 62.9-53.4 82.2v68.1h86.2c50.4-46.4 82.8-114.9 82.8-196.8z" fill="#4285F4"/>
                <path d="M272 544.3c72.8 0 134-24.3 178.6-65.9l-86.2-68.1c-24 16.1-54.8 25.7-92.4 25.7-71.1 0-131.3-48-152.8-112.3H32.5v70.7C76.5 487.9 167.2 544.3 272 544.3z" fill="#34A853"/>
                <path d="M119.2 325.7c-10.6-31.9-10.6-66.5 0-98.4V156.6H32.5c-37.7 73.1-37.7 158.6 0 231.7l86.7-62.6z" fill="#FBBC05"/>
                <path d="M272 107.7c39.6-.6 77.6 14.4 106.4 41.6l79.8-79.8C406.3 22 344.9-1.6 272 0 167.2 0 76.5 56.4 32.5 142.9l86.7 70.8C140.7 155.6 200.9 107.7 272 107.7z" fill="#EA4335"/>
              </svg>
              <span style={{ marginLeft: 8, fontSize: 14 }}>Continue with Google</span>
            </button>
          </div>

          <div style={{ margin: "6px 0 14px" }} className="small-muted">or sign in with email</div>

          <form onSubmit={handleEmailLogin} className="space-y-3" aria-label="Login form">
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
                  placeholder="Your password"
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

              {/* NEW: Forgot password link (keeps layout minimal and doesn't change anything else) */}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="btn"
                  disabled={loading}
                  style={{ background: "transparent", border: "none", padding: "0.2rem 0.4rem", color: "var(--muted-2)", fontWeight: 600 }}
                >
                  Forgot password?
                </button>
              </div>
            </div>

            <div style={{ marginTop: 6 }}>
              <button className="btn btn-cyan" disabled={loading} type="submit" style={{ width: "100%", justifyContent: "center" }}>
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </div>
          </form>

          <div style={{ marginTop: 14, textAlign: "center" }}>
            <div className="small-muted" style={{ marginBottom: 8 }}>Don't have an account?</div>
            <button
              type="button"
              className="btn btn-cyan"
              onClick={() => router.push("/signup")}
              style={{ width: "100%", justifyContent: "center" }}
            >
              Create account
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

              {/* If the message indicates blocked account, show contact admin CTA */}
              {message.type === "error" && message.text && message.text.toLowerCase().includes("blocked") && (
                <>
                  <div className="blocked-note">Contact administration to restore access.</div>
                  <div className="blocked-contact">
                    <a href={`mailto:${SUPPORT_EMAIL}`}>Email: {SUPPORT_EMAIL}</a>
                  </div>
                </>
              )}

              {/* Dev: If server returned an action link (reset link), expose it in development so you can finish testing */}
              {resendMsg && resendMsg.link && process.env.NODE_ENV === "development" && (
                <div style={{ marginTop: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 13, color: "#34D399" }}>{resendMsg.text || "Dev: action link generated"}</div>
                  <a href={resendMsg.link} target="_blank" rel="noreferrer" style={{ wordBreak: "break-all", color: "#00d2ff" }}>
                    {resendMsg.link}
                  </a>
                </div>
              )}

              {/* Resend confirmation UI: appears when login error suggests email not confirmed */}
              {(resendAvailable || (message.type === "error" && message.text && message.text.toLowerCase().includes("confirm"))) && (
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
                  {resendMsg && !resendMsg.link && (
                    <div className="resend-msg" style={{ color: resendMsg.type === "error" ? "#FB7185" : "#34D399" }}>
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
