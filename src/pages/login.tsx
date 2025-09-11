// src/pages/login.tsx
// src/pages/login.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import HCaptcha from "react-hcaptcha";
import { createClient } from "@supabase/supabase-js";

/** ---------------------------
 *  Env + Supabase client
 *  ---------------------------
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Prefer NEXT_PUBLIC_SITE_URL for browser; fall back to SITE_URL; default prod URL
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env as any).SITE_URL ||
  "https://dashboard.fuelflow.co.uk";

const HCAPTCHA_SITEKEY = process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

function cx(...cls: (string | false | null | undefined)[]) {
  return cls.filter(Boolean).join(" ");
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [signingIn, setSigningIn] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // hCaptcha token state
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const hcaptchaRef = useRef<HCaptcha>(null);

  useEffect(() => {
    setNotice(null);
    setError(null);
  }, [email, password]);

  async function requireCaptcha(): Promise<string | null> {
    // Use existing token if we already have one and it's fresh
    if (captchaToken) return captchaToken;

    if (!HCAPTCHA_SITEKEY) {
      // If no site key set, do not block (Supabase also needs to have Captcha disabled).
      return null;
    }

    // Ask the widget to execute (invisible mode) if possible
    try {
      const token = await hcaptchaRef.current?.executeAsync?.();
      if (token) {
        setCaptchaToken(token);
        return token;
      }
      return null;
    } catch {
      return null;
    }
  }

  async function onSignIn(e: React.FormEvent) {
    e.preventDefault();
    setSigningIn(true);
    setNotice(null);
    setError(null);

    try {
      const token = await requireCaptcha();

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
        options: {
          captchaToken: token ?? undefined,
        },
      });

      if (error) throw error;

      // Success -> redirect to dashboard
      window.location.href = "/client-dashboard";
    } catch (err: any) {
      setError(err?.message || "Sign in failed.");
    } finally {
      setSigningIn(false);
    }
  }

  async function onMagicLink() {
    setSendingLink(true);
    setNotice(null);
    setError(null);

    try {
      if (!email.trim()) throw new Error("Enter your email first.");

      const token = await requireCaptcha();

      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${SITE_URL}/auth/callback`,
          captchaToken: token ?? undefined,
        },
      });

      if (error) throw error;
      setNotice("Magic link sent. Check your inbox.");
    } catch (err: any) {
      setError(err?.message || "Could not send magic link.");
    } finally {
      setSendingLink(false);
    }
  }

  async function onForgotPassword() {
    setSendingReset(true);
    setNotice(null);
    setError(null);

    try {
      if (!email.trim()) throw new Error("Enter your email first.");

      const token = await requireCaptcha();

      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${SITE_URL}/auth/reset`,
        captchaToken: token ?? undefined,
      });

      if (error) throw error;
      setNotice("Reset link sent. Check your inbox.");
    } catch (err: any) {
      setError(err?.message || "Could not send reset link.");
    } finally {
      setSendingReset(false);
    }
  }

  // Invisible/executed hCaptcha: we still render a widget for token lifecycle
  const showCaptchaWidget = Boolean(HCAPTCHA_SITEKEY);

  return (
    <div className="min-h-screen bg-[#0b1220] text-white">
      {/* Top bar */}
      <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
        <a
          href="https://fuelflow.co.uk"
          className="inline-flex items-center gap-2 text-sm hover:opacity-90"
        >
          <img src="/logo-email.png" alt="FuelFlow" className="h-7 w-auto" />
          <span className="hidden sm:inline text-white/80">Back to fuelflow.co.uk</span>
        </a>
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 pb-12 md:grid-cols-2">
        {/* Left welcome / features (optional) */}
        <div className="hidden md:block rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h1 className="text-3xl font-bold mb-2">Welcome back</h1>
          <p className="text-white/70">
            Sign in to manage your fuel orders, contracts and invoices in one secure place.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
            <Feature title="Transparent pricing" body="Live price cards keep you in control." />
            <Feature title="Fast delivery" body="Choose a date two weeks out—sorted." />
            <Feature title="Secure payments" body="Stripe checkout with 3-D Secure." />
            <Feature title="UK-based support" body="We’re here if you need a hand." />
          </div>
        </div>

        {/* Right: Login card */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="mb-4 flex items-center gap-3">
            <img src="/logo-email.png" alt="FuelFlow" className="h-7 w-auto" />
            <h2 className="text-xl font-semibold">Client Login</h2>
          </div>

          <form onSubmit={onSignIn} className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-white/70">Email</span>
              <div className="relative">
                <input
                  type="email"
                  className="w-full rounded-lg border border-white/10 bg-white/[0.06] p-2 pr-10 text-sm placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-white/70">Password</span>
              <input
                type="password"
                className="w-full rounded-lg border border-white/10 bg-white/[0.06] p-2 text-sm placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>

            {/* hCaptcha (invisible) */}
            {showCaptchaWidget && (
              <HCaptcha
                ref={hcaptchaRef as any}
                sitekey={HCAPTCHA_SITEKEY}
                size="invisible"
                onVerify={(t) => setCaptchaToken(t)}
                onExpire={() => setCaptchaToken(null)}
              />
            )}

            <div className="flex items-center justify-between pt-1">
              <button
                type="submit"
                disabled={signingIn}
                className={cx(
                  "rounded-lg bg-yellow-500 px-4 py-2 text-sm font-semibold text-[#041F3E] hover:bg-yellow-400 disabled:opacity-60"
                )}
              >
                {signingIn ? "Signing in…" : "Sign In"}
              </button>

              <button
                type="button"
                onClick={onForgotPassword}
                disabled={sendingReset}
                className="text-sm text-white/80 hover:text-white underline underline-offset-4"
              >
                {sendingReset ? "Sending reset…" : "Forgot password?"}
              </button>
            </div>
          </form>

          <div className="mt-3">
            <button
              type="button"
              onClick={onMagicLink}
              disabled={sendingLink}
              className="w-full rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/15 disabled:opacity-60"
            >
              {sendingLink ? "Sending…" : "Email me a magic link"}
            </button>
          </div>

          {/* Notices */}
          {(notice || error) && (
            <div
              className={cx(
                "mt-4 rounded-lg border px-3 py-2 text-sm",
                notice
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                  : "border-rose-500/30 bg-rose-500/10 text-rose-200"
              )}
            >
              {notice || error}
            </div>
          )}

          {/* Remove old footer email – intentionally omitted */}
          <div className="mt-5 text-xs text-white/50">
            By signing in you agree to our{" "}
            <a href="https://fuelflow.co.uk/terms" className="underline decoration-yellow-400">
              Terms
            </a>
            .
          </div>
        </div>
      </div>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-sm text-white/70">{body}</div>
    </div>
  );
}



