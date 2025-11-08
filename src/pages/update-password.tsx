// src/pages/update-password.tsx
// src/pages/update-password.tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import HCaptcha from "@hcaptcha/react-hcaptcha";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

type Msg = { t: "ok" | "err" | "info"; m: string };

export default function UpdatePassword() {
  // UI state
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [busy, setBusy] = useState(false);

  // Resend section
  const [email, setEmail] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  // Link/session status
  const [haveSession, setHaveSession] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  /**
   * Parse hash parameters only on the client.
   * Check for a Supabase recovery session.
   */
  useEffect(() => {
    // Read hash params like #error=access_denied&error_code=otp_expired...
    try {
      const hash = typeof window !== "undefined" ? window.location.hash : "";
      if (hash?.includes("error=")) {
        const qp = new URLSearchParams(hash.replace(/^#/, ""));
        const err = qp.get("error_description") || qp.get("error") || null;
        if (err) setLinkError(err.replace(/\+/g, " "));
      }
    } catch {
      /* ignore */
    }

    // Warm session (Supabase injects a session for valid recovery links)
    (async () => {
      const { data } = await supabase.auth.getSession();
      const ok = !!data.session;
      setHaveSession(ok);

      // If no session and no link error supplied by hash, show a friendly hint
      if (!ok && !linkError) {
        setLinkError("Email link is invalid or has expired");
      }
    })();

    // Also listen for auth events (sometimes the session appears after hydration)
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, sess) => {
      setHaveSession(!!sess);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Update password for a valid recovery session */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!haveSession) {
      setMsg({ t: "err", m: "Auth session missing. Please request a new link below." });
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
    setPassword("");
    setConfirm("");
  }

  /** Resend a new password reset email (hCaptcha required if enabled) */
  async function resendReset(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setMsg({ t: "err", m: "Enter a valid email address." });
      return;
    }
    if (!captchaToken) {
      setMsg({ t: "err", m: "Please complete the captcha first." });
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://dashboard.fuelflow.co.uk/update-password",
      captchaToken, // <- critical when CAPTCHA is required in Supabase
    });
    setBusy(false);

    // clear captcha for the next attempt
    setCaptchaToken(null);

    if (error) {
      setMsg({ t: "err", m: error.message || "Couldn’t send reset email." });
      return;
    }
    setMsg({ t: "info", m: "Reset email sent. Please check your inbox." });
  }

  return (
    <div className="min-h-screen bg-[#081a2f] text-white relative">
      {/* soft background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.06),transparent_60%)]" />

      {/* Header — brand */}
      <header className="relative mx-auto max-w-5xl px-4 py-6">
        <a href="/login" className="flex items-center gap-3">
          <img src="https://dashboard.fuelflow.co.uk/logo-email.png" alt="FuelFlow" className="h-9 w-auto" />
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

          {/* Link/session banner */}
          {linkError && (
            <div className="mb-4 rounded-md border border-rose-400/40 bg-rose-500/10 p-2 text-sm text-rose-200">
              {linkError}
            </div>
          )}

          {/* Update form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm mb-1 block">New password</label>
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 outline-none focus:ring focus:ring-yellow-500/30 disabled:opacity-50"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={!haveSession}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/15"
                >
                  {show ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm mb-1 block">Confirm password</label>
              <input
                type={show ? "text" : "password"}
                className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 outline-none focus:ring focus:ring-yellow-500/30 disabled:opacity-50"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={!haveSession}
              />
            </div>

            <button
              type="submit"
              disabled={busy || !haveSession}
              className="w-full rounded-xl bg-yellow-500 py-3 font-semibold text-[#041F3E] hover:bg-yellow-400 disabled:opacity-60"
            >
              {busy ? "Updating…" : "Update password"}
            </button>
          </form>

          {/* Messages */}
          {msg && (
            <div
              className={`mt-4 rounded-md border p-2 text-sm ${
                msg.t === "ok"
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                  : msg.t === "info"
                  ? "border-white/20 bg-white/10 text-white/90"
                  : "border-rose-400/40 bg-rose-500/10 text-rose-200"
              }`}
            >
              {msg.m}
            </div>
          )}

          {/* Resend panel with hCaptcha */}
          <div className="mt-6 border-t border-white/10 pt-4">
            <form onSubmit={resendReset} className="grid grid-cols-1 gap-3">
              <label className="text-sm text-white/80">Resend a new reset link</label>

              <input
                type="email"
                placeholder="email@domain.com"
                className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 outline-none focus:ring focus:ring-yellow-500/30"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />

              <HCaptcha
                sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY || ""}
                onVerify={(token) => setCaptchaToken(token)}
                onExpire={() => setCaptchaToken(null)}
                onClose={() => setCaptchaToken(null)}
                theme="dark"
              />

              <div className="flex gap-2 justify-end">
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/15 disabled:opacity-60"
                >
                  Send
                </button>
              </div>
            </form>
          </div>

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



