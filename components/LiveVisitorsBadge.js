import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function getVisitorId() {
  if (typeof window === "undefined") return "server";
  try {
    const key = "live_visitor_id";
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
    window.localStorage.setItem(key, id);
    return id;
  } catch (err) {
    return String(Date.now()) + Math.random().toString(16).slice(2);
  }
}

export default function LiveVisitorsBadge() {
  const [count, setCount] = useState(null);
  const channelRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const visitorId = getVisitorId();
    const channel = supabase.channel("live_visitors", {
      config: { presence: { key: visitorId } },
    });
    channelRef.current = channel;

    const updateCount = () => {
      try {
        const state = channel.presenceState();
        const keys = Object.keys(state || {});
        setCount(keys.length);
      } catch (err) {
        setCount((prev) => (typeof prev === "number" ? prev : 1));
      }
    };

    channel
      .on("presence", { event: "sync" }, updateCount)
      .on("presence", { event: "join" }, updateCount)
      .on("presence", { event: "leave" }, updateCount)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          try {
            await channel.track({ id: visitorId, ts: Date.now() });
          } catch (err) {
            // ignore; realtime might be disabled
          }
        }
        updateCount();
      });

    const onVisibility = () => {
      if (!channelRef.current) return;
      if (document.visibilityState === "visible") {
        channelRef.current.track({ id: visitorId, ts: Date.now() }).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      try {
        supabase.removeChannel(channel);
      } catch (err) {
        channel.unsubscribe();
      }
    };
  }, []);

  return (
    <>
      <div className="live-visitor-badge" aria-live="polite" aria-label="Live visitors">
        <span className="live-dot" aria-hidden="true" />
        <span className="live-label">Active</span>
        <span className="live-count">{typeof count === "number" ? count : "…"}</span>
      </div>
      <style jsx>{`
        .live-visitor-badge {
          position: fixed;
          right: 18px;
          bottom: 18px;
          z-index: 9999;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          border-radius: 999px;
          background: rgba(8, 16, 32, 0.85);
          color: #e8f7ff;
          border: 1px solid rgba(0, 210, 255, 0.18);
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35), inset 0 0 0 1px rgba(0, 210, 255, 0.08);
          font-weight: 700;
          font-size: 13px;
          letter-spacing: 0.2px;
          backdrop-filter: blur(6px);
        }
        .live-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #22c55e;
          box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.2);
        }
        .live-label {
          color: rgba(255, 255, 255, 0.85);
        }
        .live-count {
          color: #00d2ff;
          font-weight: 800;
          min-width: 18px;
          text-align: right;
        }
        @media (max-width: 600px) {
          .live-visitor-badge {
            right: 12px;
            bottom: 12px;
            padding: 9px 12px;
            font-size: 12px;
          }
        }
      `}</style>
    </>
  );
}
