// src/pages/update-password.tsx
// src/pages/update-password.tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

// ✅ Prevent static generation during build (avoids "window is not defined")
export const dynamic = "force-dynamic";

type Stage = "checking" | "ready" | "error" | "done";

export default function UpdatePassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);

  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<Stage>("checking");
  const [banner, setBanner] = useState<{ t: "ok" | "err" | "info"; m: string } | null>(null);
  const [email, setEmail] = useState("");

  // ✅ Only run client-side logic after mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    (async () => {
      try {
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const urlError = hash.get("error");
        const urlErrorCode = hash.get("error_code");
        const urlErrorDesc = hash.get("error_description");

        if (urlError || urlErrorCode) {
          setBanner({
            t: "err",
            m: urlErrorDesc || "This reset link is invalid or has expired. Request a new one below.",
          });
          setStage("error");
          return;
        }

        const { data, error } = await supabase.auth.exchangeCodeForSession(window.location.href);
        if (error) {
          setBanner({ t: "err", m: error.message || "Could not verify your reset link." });
          setStage("error");
          return;
        }

        setEmail(data.session?.user?.email || "");
        setStage("ready");
      } catch (e: any) {
        setBanner({ t: "err", m: e?.message || "Could not verify your reset link." });
        setStage("error");
      }
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null);

    if (stage !== "ready") {
      setBanner({ t: "err", m: "Auth session missing. Request a new reset link below." });
      setStage("error");
      return;
    }

    if (!password || password.length < 8) {
      setBanner({ t: "err", m: "Use at least 8 characters." });
      return;
    }
    if (password !== confirm) {
      setBanner({ t: "err", m: "Passwords don’t match." });
      return;
    }

    try {
      setBusy(true);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setBanner({ t: "ok", m: "Password updated. You can now sign in." });
      setStage("done");
    } catch (e: any) {
      setBanner({ t: "err", m: e?.message || "Update failed." });
      setStage("error");
    } finally {
      setBusy(false);
    }
  }

  async function resendReset() {
    try {
      const addr = email.trim();
      if (!addr) throw new Error("Enter your email to resend the reset link.");
      const { error } = await supabase.auth.resetPasswordForEmail(addr, {
        redirectTo: "https://dashboard.fuelflow.co.uk/update-password",
      });
      if (error) throw error;
      setBanner({
        t: "info",
        m: `We’ve sent a new password reset link to ${addr}. Check your inbox and spam.`,
      });
    } catch (e: any) {
      setBanner({ t: "err", m: e?.message || "Could not send reset email." });
    }
  }

  return (
    <div className="min-h-screen bg-[#081a2f] text-white relative">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.06),transparent_60%)]" />

      {/* Header */}
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
          <p className="text-white/80 mb-6">
            Enter a new password below. For security, use at least 8 characters.
          </p>

          {banner && (
            <div
              className={`mb-4 rounded-md border p-2 text-sm ${
                banner.t === "ok"
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                  : banner.t === "info"
                  ? "border-white/20 bg-white/5 text-white/90"
                  : "border-rose-400/40 bg-rose-500/10 text-rose-200"
              }`}
            >
              {banner.m}
            </div>
          )}

          {stage !== "done" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm mb-1 block">New password</label>
                <div className="relative">
                  <input
                    type={show ? "text" : "password"}
                    className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 outline-none focus:ring focus:ring-yellow-500/30"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={stage !== "ready"}
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
                  className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 outline-none focus:ring focus:ring-yellow-500/30"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={stage !== "ready"}
                />
              </div>

              <button
                type="submit"
                disabled={busy || stage !== "ready"}
                className="w-full rounded-xl bg-yellow-500 py-3 font-semibold text-[#041F3E] hover:bg-yellow-400 disabled:opacity-60"
              >
                {busy ? "Updating…" : "Update password"}
              </button>
            </form>
          )}

          {stage === "error" && (
            <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm mb-2">Resend a new reset link</div>
              <div className="flex gap-2">
                <input
                  placeholder="email@domain.com"
                  className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none focus:ring focus:ring-yellow-500/30"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <button
                  onClick={resendReset}
                  className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
                >
                  Send
                </button>
              </div>
            </div>
          )}

          {stage === "done" && (
            <div className="mt-6 rounded-md border border-emerald-400/40 bg-emerald-500/10 p-3 text-emerald-200">
              Password updated. You can now <a className="underline" href="/login">sign in</a>.
            </div>
          )}

          <div className="mt-6 flex items-center justify-between text-sm">
            <a href="/login" className="text-white/80 hover:underline">
              Back to login
            </a>
            <a href="https://fuelflow.co.uk" target="_blank" className="text-yellow-300 hover:underline">
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


