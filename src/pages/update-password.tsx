// src/pages/update-password.tsx
// src/pages/update-password.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

type Msg = { t: "ok" | "err" | "info"; m: string };

export default function UpdatePassword() {
  // UI state
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);

  // Reset flow state
  const [sessionReady, setSessionReady] = useState(false); // true when the email link created a valid session
  const [linkError, setLinkError] = useState<string | null>(null); // error from the link (expired/invalid/etc.)

  // Form
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);

  // Resend box
  const [email, setEmail] = useState("");

  // Derived: allow the password form only if we have a session and no link error
  const canEditPassword = useMemo(() => sessionReady && !linkError, [sessionReady, linkError]);

  // --- Mount: parse the hash safely on the client, hydrate session if needed ---
  useEffect(() => {
    setMounted(true);

    (async () => {
      try {
        // Nothing SSR here — we're already in effect.
        const rawHash = window.location.hash || "";

        // 1) Interpret any error sent by Supabase in the URL fragment
        if (rawHash.includes("error=")) {
          const qp = new URLSearchParams(rawHash.replace(/^#/, ""));
          const code = qp.get("error_code") || "";
          const desc = qp.get("error_description") || "";
          // Show a friendly banner. We still keep the resend panel enabled below.
          setLinkError(desc || code || "The link is invalid or has expired.");
        }

        // 2) If the hash contains a recovery code, convert it into a real session.
        //    This fixes "Auth session missing!" when you submit the new password.
        if (rawHash.includes("type=recovery") || rawHash.includes("access_token")) {
          const { error } = await supabase.auth.exchangeCodeForSession(rawHash);
          if (error) {
            // If the code was expired/used, leave canEdit disabled and show resend UI
            setSessionReady(false);
          } else {
            setSessionReady(true);
          }
        } else {
          // If the page was opened directly (no hash), there won't be a session yet.
          // Leave sessionReady=false; user can use the resend box.
          const { data } = await supabase.auth.getSession();
          setSessionReady(!!data.session);
        }

        // 3) Optional nicety: if email is in the fragment (some providers include it), prefill the resend box
        const qp = new URLSearchParams(rawHash.replace(/^#/, ""));
        const emailFromLink = qp.get("email") || qp.get("user_email");
        if (emailFromLink) setEmail(emailFromLink);
      } catch {
        // Ignore — user can still use the resend box
      }
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!canEditPassword) {
      setMsg({ t: "err", m: "Password cannot be updated because your reset link is invalid or expired. Please use the resend form below." });
      return;
    }
    if (!password || password.length < 8) {
      setMsg({ t: "err", m: "Use at least 8 characters." });
      return;
    }
    if (password !== confirm) {
      setMsg({ t: "err", m: "Passwords don’t match." });
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (error) {
      setMsg({ t: "err", m: error.message || "Update failed." });
      return;
    }
    setMsg({ t: "ok", m: "Password updated. You can now sign in." });

    // Clean out the sensitive fields
    setPassword("");
    setConfirm("");
  }

  async function resendReset(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setMsg({ t: "err", m: "Enter a valid email address." });
      return;
    }

    setBusy(true);
    // v2 API: resetPasswordForEmail sends a recovery email
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://dashboard.fuelflow.co.uk/update-password",
    });
    setBusy(false);

    if (error) {
      setMsg({ t: "err", m: error.message || "Couldn’t send reset email." });
      return;
    }
    setMsg({ t: "info", m: "Reset email sent. Open the link on this device to continue." });
  }

  // Avoid SSR hiccups
  if (!mounted) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#081a2f] text-white">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-6 py-4 text-white/80">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#081a2f] text-white relative">
      {/* soft background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.06),transparent_60%)]" />

      {/* Header — single brand only */}
      <header className="relative mx-auto max-w-5xl px-4 py-6">
        <a href="/login" className="flex items-center gap-3">
          <img src="/logo-email.png" alt="FuelFlow" className="h-9 w-auto" />
          <span className="sr-only">FuelFlow</span>
        </a>
      </header>

      <main className="relative mx-auto max-w-3xl px-4 pb-14">
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md shadow-2xl p-6 md:p-8">
          <h1 className="text-[clamp(26px,4vw,40px)] font-extrabold mb-2">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 to-orange-400">
              Reset your password
            </span>
          </h1>
          <p className="text-white/80 mb-4">
            Enter a new password below. For security, use at least 8 characters.
          </p>

          {/* Link error banner (expired/invalid) */}
          {linkError && (
            <div className="mb-4 rounded-md border border-rose-400/40 bg-rose-500/10 text-rose-200 px-3 py-2 text-sm">
              {linkError || "Email link is invalid or has expired"}
            </div>
          )}

          {/* Password form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm mb-1 block">New password</label>
              <div className="relative">
                <input
                  disabled={!canEditPassword || busy}
                  type={show ? "text" : "password"}
                  className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 outline-none focus:ring focus:ring-yellow-500/30 disabled:opacity-50"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  disabled={!canEditPassword}
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/15 disabled:opacity-30"
                >
                  {show ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm mb-1 block">Confirm password</label>
              <input
                disabled={!canEditPassword || busy}
                type={show ? "text" : "password"}
                className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 outline-none focus:ring focus:ring-yellow-500/30 disabled:opacity-50"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={!canEditPassword || busy}
              className="w-full rounded-xl bg-yellow-500 py-3 font-semibold text-[#041F3E] hover:bg-yellow-400 disabled:opacity-60"
            >
              {busy ? "Updating…" : "Update password"}
            </button>
          </form>

          {/* Resend panel */}
          <div className="mt-6 border-t border-white/10 pt-4">
            <form onSubmit={resendReset} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <label className="text-sm text-white/80 sm:col-span-2">Resend a new reset link</label>
              <input
                type="email"
                placeholder="email@domain.com"
                className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 outline-none focus:ring focus:ring-yellow-500/30"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/15 disabled:opacity-60"
              >
                Send
              </button>
            </form>
          </div>

          {/* Messages */}
          {msg && (
            <div
              className={`mt-4 rounded-md border p-2 text-sm ${
                msg.t === "ok"
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                  : msg.t === "info"
                  ? "border-white/20 bg-white/10 text-white/80"
                  : "border-rose-400/40 bg-rose-500/10 text-rose-200"
              }`}
            >
              {msg.m}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between text-sm">
            <a href="/login" className="text-white/80 hover:underline">
              Back to login
            </a>
            <a
              href="https://fuelflow.co.uk"
              target="_blank"
              rel="noreferrer"
              className="text-yellow-300 hover:underline"
            >
              fuelflow.co.uk →
            </a>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-white/60">
          © {new Date().getFullYear()} FuelFlow. Secure reset powered by Supabase.
        </p>
      </main>
    </div>
  );
}


