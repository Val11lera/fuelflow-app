// src/pages/update-password.tsx
// src/pages/update-password.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

type Msg = { type: "error" | "success" | "info"; text: string };

function parseHashParams() {
  // Parses URLs like: /update-password#access_token=...&refresh_token=...&type=recovery
  const h = typeof window !== "undefined" ? window.location.hash : "";
  if (!h || !h.startsWith("#")) return {};
  return Object.fromEntries(new URLSearchParams(h.slice(1)));
}

export default function UpdatePassword() {
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);

  const canSubmit = useMemo(() => {
    return password.length >= 8 && confirm === password && hasSession && !loading;
  }, [password, confirm, hasSession, loading]);

  // --- IMPORTANT: capture the session delivered by the email link ---
  useEffect(() => {
    (async () => {
      try {
        // Case A: hash tokens (common for password recovery)
        const hash = parseHashParams();
        if (hash["access_token"] && hash["refresh_token"]) {
          const { error } = await supabase.auth.setSession({
            access_token: String(hash["access_token"]),
            refresh_token: String(hash["refresh_token"]),
          });
          if (error) throw error;
        }

        // Case B: PKCE / code param (some configurations)
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        if (code) {
          // exchange the code for a session
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        // Confirm we now have a session
        const { data } = await supabase.auth.getSession();
        setHasSession(!!data.session);
      } catch (e: any) {
        console.error(e);
        setMsg({ type: "error", text: "This reset link is invalid or has expired. Please request a new email." });
      } finally {
        setReady(true);
      }
    })();
  }, []);

  async function onUpdate() {
    try {
      setLoading(true);
      setMsg(null);

      if (!hasSession) {
        setMsg({ type: "error", text: "Auth session missing. Please re-open the reset link from your email." });
        return;
      }
      if (password.length < 8) {
        setMsg({ type: "error", text: "Password must be at least 8 characters." });
        return;
      }
      if (password !== confirm) {
        setMsg({ type: "error", text: "Passwords do not match." });
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setMsg({ type: "success", text: "Password updated. Redirecting to login…" });
      setTimeout(() => (window.location.href = "/login"), 1200);
    } catch (e: any) {
      setMsg({ type: "error", text: e?.message || "Couldn’t update password." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[100svh] md:min-h-screen relative text-white">
      {/* BRAND BACKGROUND */}
      <div className="absolute inset-0 bg-[#041F3E]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.07),transparent_60%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#082246]/40 via-[#041F3E]/40 to-[#041F3E]" />
      <div aria-hidden className="pointer-events-none absolute -top-24 right-[-12%] opacity-[0.05] rotate-[-12deg]">
        <img src="/logo-email.png" alt="" className="w-[920px] max-w-none" />
      </div>

      {/* HEADER */}
      <header className="relative z-10">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-6">
          <img src="/logo-email.png" alt="FuelFlow" className="h-8 w-auto" />
          <span className="text-white/80">FuelFlow</span>
        </div>
      </header>

      {/* CARD */}
      <main className="relative z-10 mx-auto max-w-3xl px-4 pb-14">
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] shadow-2xl backdrop-blur-sm">
          <div className="px-6 py-6 md:px-8 md:py-8">
            <h1 className="text-3xl font-bold">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 via-yellow-300 to-orange-400">
                Reset your password
              </span>
            </h1>
            <p className="mt-2 text-white/80">
              Enter a new password below. For security, use at least 8 characters.
            </p>

            {!ready && (
              <div className="mt-6 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white/80">
                Validating secure link…
              </div>
            )}

            {ready && !hasSession && (
              <div className="mt-6 rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-rose-200">
                This reset link is invalid or has expired. Please request a new one from the login page.
              </div>
            )}

            {/* FORM */}
            <div className="mt-6 grid gap-4">
              <label className="text-sm">
                <span className="mb-1 block text-white/85">New password</span>
                <div className="relative">
                  <input
                    type={show ? "text" : "password"}
                    className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 pr-16 text-white placeholder-white/40 outline-none focus:ring focus:ring-yellow-500/30"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={!hasSession}
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/15"
                    disabled={!hasSession}
                    aria-label={show ? "Hide password" : "Show password"}
                  >
                    {show ? "Hide" : "Show"}
                  </button>
                </div>
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-white/85">Confirm password</span>
                <input
                  type={show ? "text" : "password"}
                  className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none focus:ring focus:ring-yellow-500/30"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={!hasSession}
                />
              </label>

              <button
                onClick={onUpdate}
                disabled={!canSubmit}
                className="mt-2 rounded-xl bg-yellow-500 px-4 py-3 font-semibold text-[#041F3E] hover:bg-yellow-400 disabled:opacity-60"
              >
                {loading ? "Updating…" : "Update password"}
              </button>

              {msg && (
                <div
                  className={[
                    "rounded-lg border px-3 py-2 text-sm",
                    msg.type === "error"
                      ? "border-rose-400/40 bg-rose-500/10 text-rose-200"
                      : msg.type === "success"
                      ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                      : "border-white/15 bg-white/5 text-white/80",
                  ].join(" ")}
                >
                  {msg.text}
                </div>
              )}

              <div className="mt-2 flex items-center justify-between text-sm text-white/70">
                <a href="/login" className="hover:underline underline-offset-2">
                  Back to login
                </a>
                <a href="https://fuelflow.co.uk" target="_blank" rel="noreferrer" className="text-yellow-300 hover:underline underline-offset-2">
                  fuelflow.co.uk →
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="relative z-10 mx-auto max-w-3xl px-4 pb-8 text-center text-xs text-white/60">
        © {new Date().getFullYear()} FuelFlow. Secure reset powered by Supabase.
      </footer>
    </div>
  );
}

