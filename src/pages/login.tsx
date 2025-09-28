// src/pages/login.tsx
// src/pages/login.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

type Mode = "password"; // extend later (e.g., "magic")

function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode] = useState<Mode>("password");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null); // only set after real success
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  // `next` param (default to client dashboard)
  const next = useMemo(() => {
    try {
      const u = new URL(window.location.href);
      const n = u.searchParams.get("next");
      return n && n.startsWith("/") ? n : "/client-dashboard";
    } catch {
      return "/client-dashboard";
    }
  }, []);

  // Reason banner from redirects (blocked, pending, signin)
  const reason = useMemo(() => {
    try {
      const u = new URL(window.location.href);
      return u.searchParams.get("reason");
    } catch {
      return null;
    }
  }, []);

  // IMPORTANT: do NOT show any success on page load.
  // Only if a user is already logged in do we *check access* and then redirect silently.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Small debounce to avoid flicker
      await new Promise((r) => setTimeout(r, 50));

      const { data } = await supabase.auth.getUser();
      const currentEmail = data?.user?.email?.toLowerCase() || null;
      if (!currentEmail || cancelled) return;

      // If already signed in, gate with server-driven pages (simplest: send them to next and let SSR decide)
      window.location.replace(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [next]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      // Optional: verify hCaptcha server-side
      if (captchaToken) {
        try {
          const resp = await fetch("/api/auth/verify-captcha", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: captchaToken }),
          });
          if (!resp.ok) {
            const txt = await resp.text();
            throw new Error(txt || "Captcha failed");
          }
        } catch (err: any) {
          throw new Error(err?.message || "Captcha failed");
        }
      }

      if (mode === "password") {
        const { error: signErr } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signErr) {
          // Common messages unified
          if (/invalid/i.test(signErr.message)) throw new Error("Invalid email or password.");
          throw signErr;
        }
      }

      // At this point we have a session. Let the client dashboard SSR decide blocked/pending.
      setSuccessMsg("Login successful! Redirecting…");
      window.location.replace(next);
    } catch (err: any) {
      setError(err?.message || "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0b1220] text-white">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <header className="flex items-center gap-3">
          <a href="https://fuelflow.co.uk" aria-label="FuelFlow website" className="shrink-0">
            <img src="/logo-email.png" alt="FuelFlow" className="h-7 w-auto" />
          </a>
          <div className="ml-auto">
            <a
              href="https://fuelflow.co.uk"
              className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
            >
              Back to fuelflow.co.uk
            </a>
          </div>
        </header>

        <main className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left info panel */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-7">
            <h1 className="text-2xl md:text-3xl font-bold">Welcome to FuelFlow</h1>
            <p className="mt-1 text-white/70">
              Your hub for live fuel pricing, orders, contracts and invoices — all in one place.
            </p>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InfoCard title="Live pricing" text="See today's rate before you order." />
              <InfoCard title="Scheduled delivery" text="Pick a preferred date — subject to availability." />
              <InfoCard title="Secure checkout" text="3-D Secure payments powered by Stripe." />
              <InfoCard title="UK-based support" text="Email or live chat when you need a hand." />
            </div>
          </section>

          {/* Right form panel */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 md:p-7">
            <h2 className="text-xl font-semibold">Client login</h2>
            <p className="text-sm text-white/70">Use your account email and password.</p>

            {/* Redirect reason */}
            {reason && (
              <div
                className={cx(
                  "mt-3 rounded border px-3 py-2 text-sm",
                  reason === "blocked"
                    ? "border-rose-400/50 bg-rose-500/10 text-rose-200"
                    : reason === "pending"
                    ? "border-yellow-400/50 bg-yellow-500/10 text-yellow-200"
                    : "border-white/20 bg-white/5 text-white/80"
                )}
              >
                {reason === "blocked" && "Your account is blocked. Contact support if this is a mistake."}
                {reason === "pending" && "Your account is pending approval. You’ll get access once an admin approves it."}
                {reason === "signin" && "Please sign in to continue."}
                {!["blocked", "pending", "signin"].includes(reason) && reason}
              </div>
            )}

            {/* Success banner – ONLY shown after a real successful submit */}
            {successMsg && (
              <div className="mt-3 rounded border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                {successMsg}
              </div>
            )}

            {/* Error banner */}
            {error && (
              <div className="mt-3 rounded border border-rose-400/50 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                {error}
              </div>
            )}

            <form onSubmit={onSubmit} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs text-white/70 mb-1">Email</label>
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 outline-none focus:ring focus:ring-yellow-500/30"
                  placeholder="you@company.com"
                />
              </div>
              <div>
                <label className="block text-xs text-white/70 mb-1">Password</label>
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 outline-none focus:ring focus:ring-yellow-500/30"
                  placeholder="••••••••"
                />
              </div>

              {/* hCaptcha placeholder – wire up your widget to call setCaptchaToken(token) */}
              <div className="mt-2">
                {/* Replace this block with your hCaptcha component and call setCaptchaToken(token) on verify */}
                {/* <HCaptcha sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY!} onVerify={setCaptchaToken} /> */}
              </div>

              <div className="flex items-center justify-between text-sm mt-2">
                <label className="inline-flex items-center gap-2 text-white/70">
                  <input type="checkbox" className="rounded bg-white/10 border-white/20" defaultChecked />
                  Remember my email
                </label>
                <a href="/forgot-password" className="text-yellow-300 hover:text-yellow-200">
                  Forgot password?
                </a>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className={cx(
                  "mt-2 w-full rounded-xl py-2.5 text-base font-semibold",
                  submitting ? "bg-yellow-600/80 cursor-wait" : "bg-yellow-500 hover:bg-yellow-400 text-[#041F3E]"
                )}
              >
                {submitting ? "Signing in…" : "Sign in"}
              </button>

              <p className="text-xs text-white/60 mt-2">
                By signing in you agree to our <a href="/terms" className="underline">Terms</a>.
              </p>
            </form>
          </section>
        </main>
      </div>
    </div>
  );
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <div className="font-semibold">{title}</div>
      <div className="text-white/70 text-sm mt-1">{text}</div>
    </div>
  );
}


