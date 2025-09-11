// src/pages/update-password.tsx
// src/pages/update-password.tsx
"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

// --- shared UI tokens to match /quote.tsx ---
const label = "block text-sm font-medium mb-1 text-white/90";
const baseInput =
  "w-full p-2 rounded-lg bg-white/[0.06] text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:border-transparent";
const okRing = "focus:ring-yellow-500/40 border border-white/15";
const errRing = "border border-red-400/60 focus:ring-red-400/40";

export default function UpdatePassword() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);

  const [msg, setMsg] = useState<string | null>(null);
  const [msgType, setMsgType] = useState<"ok" | "err" | "info">("info");
  const [loading, setLoading] = useState(false);

  // Exchange code for session if present (supabase v2 flow)
  useEffect(() => {
    (async () => {
      try {
        await supabase.auth.exchangeCodeForSession(window.location.href).catch(() => {});
      } finally {
        setReady(true);
      }
    })();
  }, []);

  function validate(): string[] {
    const issues: string[] = [];
    if (!password || password.length < 8) {
      issues.push("Password must be at least 8 characters.");
    }
    if (confirm !== password) {
      issues.push("Passwords do not match.");
    }
    return issues;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const issues = validate();
    if (issues.length) {
      setMsg(issues.join(" "));
      setMsgType("err");
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setMsg(error.message);
        setMsgType("err");
        return;
      }
      setMsg("Password updated. You can now sign in with your new password.");
      setMsgType("ok");
      setPassword("");
      setConfirm("");
    } catch (err: any) {
      setMsg(err?.message || "Unexpected error.");
      setMsgType("err");
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#041F3E] text-white grid place-items-center">
        <div className="opacity-80">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white relative overflow-x-hidden">
      {/* Brand background (matches /quote.tsx) */}
      <div className="absolute inset-0 bg-[#041F3E]" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#082246]/40 via-[#041F3E]/40 to-[#041F3E]" />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 right-[-10%] opacity-[0.05] rotate-[-10deg]"
      >
        <img src="/logo-email.png" alt="" className="w-[860px] max-w-none" />
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.08),transparent_55%)]" />

      {/* Page content */}
      <main className="relative z-10 mx-auto w-full max-w-lg px-4 py-10 md:py-14">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <img src="/logo-email.png" alt="FuelFlow" className="h-9 w-auto" />
          <h1 className="text-2xl md:text-3xl font-bold">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 via-yellow-300 to-orange-400">
              Reset your password
            </span>
          </h1>
        </div>

        {/* Card */}
        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-white/10 bg-white/[0.06] p-6 md:p-8 shadow-2xl backdrop-blur-sm"
        >
          <p className="text-white/80 text-sm mb-4">
            Enter a new password below. For security, make it unique and at least 8 characters.
          </p>

          {/* Password */}
          <div className="mb-4">
            <label className={label} htmlFor="pw">
              New password
            </label>
            <div className="relative">
              <input
                id="pw"
                type={show ? "text" : "password"}
                className={`${baseInput} ${
                  password && password.length < 8 ? errRing : okRing
                }`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/15"
              >
                {show ? "Hide" : "Show"}
              </button>
            </div>
            {password && password.length < 8 && (
              <p className="mt-1 text-xs text-red-300">Minimum 8 characters.</p>
            )}
          </div>

          {/* Confirm */}
          <div className="mb-4">
            <label className={label} htmlFor="confirm">
              Confirm password
            </label>
            <input
              id="confirm"
              type={show ? "text" : "password"}
              className={`${baseInput} ${confirm && confirm !== password ? errRing : okRing}`}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat password"
            />
            {confirm && confirm !== password && (
              <p className="mt-1 text-xs text-red-300">Passwords must match.</p>
            )}
          </div>

          {/* CTA */}
          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-xl bg-yellow-500 py-3 font-semibold text-[#041F3E]
                       hover:bg-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-300
                       disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Updating…" : "Update password"}
          </button>

          {/* Message */}
          {msg && (
            <div
              className={`mt-4 rounded-lg border p-2 text-sm ${
                msgType === "ok"
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                  : msgType === "err"
                  ? "border-rose-400/40 bg-rose-500/10 text-rose-200"
                  : "border-white/15 bg-white/5 text-white/80"
              }`}
              role="alert"
            >
              {msg}
            </div>
          )}

          {/* links */}
          <div className="mt-4 flex items-center justify-between text-sm text-white/70">
            <a className="hover:underline" href="/login">
              Back to login
            </a>
            <a
              className="hover:underline text-yellow-300"
              href="https://fuelflow.co.uk"
              target="_blank"
              rel="noreferrer"
            >
              fuelflow.co.uk →
            </a>
          </div>
        </form>
      </main>
    </div>
  );
}

