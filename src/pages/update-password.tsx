// src/pages/update-password.tsx
// src/pages/update-password.tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

export default function UpdatePassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; m: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Ensure the auth session is loaded (Supabase injects it when the link is opened)
  useEffect(() => {
    supabase.auth.getSession(); // warms up session for the recovery link
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

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
  }

  return (
    <div className="min-h-screen bg-[#081a2f] text-white relative">
      {/* soft background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.06),transparent_60%)]" />

      {/* Header — single brand only */}
      <header className="relative mx-auto max-w-5xl px-4 py-6">
        <a href="/login" className="flex items-center gap-3">
          <img src="/logo-email.png" alt="FuelFlow" className="h-9 w-auto" />
          {/* Remove the second visible “FuelFlow” */}
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

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm mb-1 block">New password</label>
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 outline-none focus:ring focus:ring-yellow-500/30"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-yellow-500 py-3 font-semibold text-[#041F3E] hover:bg-yellow-400 disabled:opacity-60"
            >
              {busy ? "Updating…" : "Update password"}
            </button>

            {msg && (
              <div
                className={`rounded-md border p-2 text-sm ${
                  msg.t === "ok"
                    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                    : "border-rose-400/40 bg-rose-500/10 text-rose-200"
                }`}
              >
                {msg.m}
              </div>
            )}
          </form>

          <div className="mt-6 flex items-center justify-between text-sm">
            <a href="/login" className="text-white/80 hover:underline">
              Back to login
            </a>
            <a
              href="https://fuelflow.co.uk"
              target="_blank"
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
