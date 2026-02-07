// pages/reset-password.js
import Head from "next/head";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useRouter } from "next/router";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(true); // initial check in progress
  const [sessionInfo, setSessionInfo] = useState(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  // Helper: show and clear messages
  function show(type, text) {
    setMessage({ type, text });
  }

  useEffect(() => {
    let mounted = true;
    let unsub = null;

    async function init() {
      setBusy(true);
      try {
        // 1) If query contains email+token -> OTP flow (works even if fragments removed)
        const qp = new URLSearchParams(window.location.search);
        const qEmail = qp.get("email");
        const qToken = qp.get("token");

        if (qEmail && qToken) {
          // Call verifyOtp to log the user in using the OTP token (recovery)
          // supabase.auth.verifyOtp({ email, token, type: 'recovery' }) -> returns session
          const { data, error } = await supabase.auth.verifyOtp({
            email: qEmail,
            token: qToken,
            type: "recovery",
          });

          if (error) {
            console.warn("verifyOtp error:", error);
            show("error", "Invalid or expired token. Request a new password reset.");
          } else if (data?.session) {
            setSessionInfo(data.session);
            show("success", "Recovery verified — set a new password below.");
          } else {
            // Some SDK versions return data rather than data.session, handle cautiously
            if (data?.user) {
              setSessionInfo(data);
              show("success", "Recovery verified — set a new password below.");
            } else {
              show("error", "Could not verify token. Request a new password reset.");
            }
          }
          // remove token/email from URL (clean UX)
          const cleaned = window.location.pathname + window.location.hash;
          window.history.replaceState({}, "", cleaned);
          setBusy(false);
          return;
        }

        // 2) Otherwise try standard Supabase flow: getSessionFromUrl or set session from hash
        // Try SDK helper first (if available)
        if (typeof supabase.auth.getSessionFromUrl === "function") {
          try {
            await supabase.auth.getSessionFromUrl({ storeSession: true });
          } catch (err) {
            // ignore — we'll continue to next checks
            console.warn("getSessionFromUrl error (ignored):", err);
          }
        }

        // If still no session, parse hash for access_token / refresh_token
        const { data: after } = await supabase.auth.getSession();
        if (!after?.session) {
          const rawHash = window.location.hash || "";
          const hashStr = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;
          const params = new URLSearchParams(hashStr);
          const access_token = params.get("access_token");
          const refresh_token = params.get("refresh_token") || null;

          if (access_token) {
            // setSession will store session client-side
            if (typeof supabase.auth.setSession === "function") {
              const { error: setErr } = await supabase.auth.setSession({ access_token, refresh_token });
              if (setErr) {
                console.warn("setSession error:", setErr);
              }
            }
            // clean URL (remove fragment)
            window.history.replaceState({}, "", window.location.pathname + window.location.search);
          }
        }

        // Subscribe to auth state changes to get session
        const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
          if (!mounted) return;
          setSessionInfo(session ?? null);
        });
        unsub = sub;

        // Final check for session
        const { data } = await supabase.auth.getSession();
        if (data?.session) {
          setSessionInfo(data.session);
        }
      } catch (err) {
        console.error("init error:", err);
      } finally {
        if (mounted) setBusy(false);
      }
    }

    init();

    return () => {
      mounted = false;
      try { unsub?.subscription?.unsubscribe?.(); } catch (e) {}
      try { unsub?.unsubscribe?.(); } catch (e) {}
    };
  }, []);

  async function handleUpdatePassword(e) {
    e?.preventDefault();
    setMessage(null);

    if (!password || password.length < 6) {
      show("error", "Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      show("error", "Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.updateUser({ password });
      if (error) {
        console.error("updateUser error:", error);
        show("error", error.message || "Failed to update password.");
      } else {
        show("success", "Password updated — you can now sign in.");
        setTimeout(() => router.push("/login"), 1400);
      }
    } catch (err) {
      console.error("unexpected error:", err);
      show("error", "Unexpected error while updating password.");
    } finally {
      setLoading(false);
    }
  }

  // Render
  return (
    <>
      <Head><title>Reset password — Kamonasish</title></Head>
      <main style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "#f6f8fa" }}>
        <div style={{ width: 420, background: "#fff", padding: 28, borderRadius: 10, boxShadow: "0 8px 30px rgba(2,6,23,0.08)" }}>
          <h2 style={{ marginTop: 0 }}>Reset your password</h2>

          {busy && <div style={{ padding: 16, color: "#444" }}>Checking reset link… please wait.</div>}

          {!busy && !sessionInfo && (
            <>
              <p style={{ color: "#333" }}>
                We didn't detect a valid recovery session. This usually happens when:
              </p>
              <ul style={{ color: "#555" }}>
                <li>The reset link expired — request a new one.</li>
                <li>The redirect URL is not configured in Supabase (Auth → URL Configuration).</li>
                <li>Your email client stripped the token from the URL. Try requesting a new reset.</li>
              </ul>

              <div style={{ marginTop: 12 }}>
                <button onClick={() => router.push("/login")} style={{ marginRight: 8, padding: "8px 12px" }}>Back to login</button>
                <button onClick={() => { router.push("/login"); show("info", "Go to login and request a new reset."); }} style={{ padding: "8px 12px" }}>Request new reset</button>
              </div>

              {message && <div style={{ marginTop: 12, color: message.type === "error" ? "red" : "green" }}>{message.text}</div>}
            </>
          )}

          {!busy && sessionInfo && (
            <form onSubmit={handleUpdatePassword}>
              <p style={{ color: "#555" }}>Set a new password for <strong>{sessionInfo?.user?.email ?? "your account"}</strong></p>

              <div style={{ marginTop: 8 }}>
                <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>New password</label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  style={{ width: "100%", padding: 10, borderRadius: 6, border: "1px solid #e6e6e6" }}
                  required
                />
              </div>

              <div style={{ marginTop: 8 }}>
                <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>Confirm password</label>
                <input
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  type="password"
                  style={{ width: "100%", padding: 10, borderRadius: 6, border: "1px solid #e6e6e6" }}
                  required
                />
              </div>

              <div style={{ marginTop: 14 }}>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: "10px 14px",
                    width: "100%",
                    background: "#2563eb",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    fontWeight: 700,
                    cursor: loading ? "default" : "pointer",
                  }}
                >
                  {loading ? "Updating…" : "Update password"}
                </button>
              </div>

              {message && <div style={{ marginTop: 12, color: message.type === "error" ? "red" : "green" }}>{message.text}</div>}
            </form>
          )}
        </div>
      </main>
    </>
  );
}
