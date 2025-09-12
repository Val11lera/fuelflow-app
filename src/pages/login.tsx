// src/pages/login.tsx
// src/pages/login.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import type HCaptchaType from "@hcaptcha/react-hcaptcha";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/router";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

type Msg = { type: "error" | "success" | "info"; text: string };

export default function Login() {
  const router = useRouter();
  const captchaRef = useRef<HCaptchaType>(null);

  // form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // ui
  const [showPassword, setShowPassword] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);

  // messages
  const [msg, setMsg] = useState<Msg | null>(null);

  // hCaptcha
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  // hydrate remembered email
  useEffect(() => {
    const saved = localStorage.getItem("ff_login_email");
    if (saved) setEmail(saved);
  }, []);

  // remember email on change
  useEffect(() => {
    if (remember && email) localStorage.setItem("ff_login_email", email);
    if (!remember) localStorage.removeItem("ff_login_email");
  }, [remember, email]);

  function handleCaps(e: React.KeyboardEvent<HTMLInputElement>) {
    setCapsOn(e.getModifierState && e.getModifierState("CapsLock"));
  }

  function resetCaptcha() {
    captchaRef.current?.resetCaptcha();
    setCaptchaToken(null);
  }

  async function handleLogin() {
    try {
      setLoading(true);
      setMsg(null);

      if (!email || !password) {
        setMsg({ type: "error", text: "Please enter your email and password." });
        return;
      }
      if (!captchaToken) {
        setMsg({ type: "error", text: "Please complete the captcha." });
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: { captchaToken },
      });

      if (error) {
        setMsg({ type: "error", text: "Login failed: " + error.message });
        resetCaptcha();
        return;
      }

      setMsg({ type: "success", text: "Login successful! Redirecting…" });
      router.push("/client-dashboard");
    } catch (e: any) {
      setMsg({ type: "error", text: e?.message || "Unexpected error." });
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink() {
    try {
      setLoading(true);
      setMsg(null);

      if (!email) {
        setMsg({ type: "error", text: "Enter your email to receive a magic link." });
        return;
      }
      if (!captchaToken) {
        setMsg({ type: "error", text: "Please complete the captcha." });
        return;
      }

      const redirectTo = `${window.location.origin}/client-dashboard`;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo, captchaToken },
      });

      if (error) {
        setMsg({ type: "error", text: "Couldn’t send magic link: " + error.message });
        resetCaptcha();
        return;
      }

      resetCaptcha();
      setMsg({ type: "success", text: "Magic link sent! Check your inbox." });
    } catch (e: any) {
      setMsg({ type: "error", text: e?.message || "Unexpected error." });
    } finally {
      setLoading(false);
    }
  }

  async function handleReset() {
    try {
      setLoading(true);
      setMsg(null);

      if (!email) {
        setMsg({ type: "error", text: "Enter your email to receive a reset link." });
        return;
      }
      if (!captchaToken) {
        setMsg({ type: "error", text: "Please complete the captcha." });
        return;
      }

      const redirectTo = `${window.location.origin}/update-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
        captchaToken,
      });

      if (error) {
        setMsg({ type: "error", text: "Couldn’t send reset email: " + error.message });
        resetCaptcha();
        return;
      }

      resetCaptcha();
      setMsg({ type: "success", text: "Password reset email sent." });
    } catch (e: any) {
      setMsg({ type: "error", text: e?.message || "Unexpected error." });
    } finally {
      setLoading(false);
    }
  }

  function onEnter(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleLogin();
  }

  return (
    <div className="relative flex min-h-[100svh] md:min-h-screen flex-col bg-[#0b1220] text-white">
      {/* Header */}
      <header className="relative">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <a href="https://fuelflow.co.uk" className="flex items-center gap-3">
            <img src="/logo-email.png" alt="FuelFlow" className="h-7 w-auto" />
            {/* removed the 'Secure client access' caption as requested */}
          </a>
          <a
            href="https://fuelflow.co.uk"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-white/10 px-3 py-2 text-xs hover:bg-white/15"
          >
            Back to fuelflow.co.uk
          </a>
        </div>
      </header>

      <main className="relative flex-1">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-8 lg:grid-cols-12 lg:py-12">
          {/* Login card (visual priority) */}
          <section className="order-1 lg:order-2 lg:col-span-5">
            <div className="rounded-2xl bg-gray-800 p-6 md:p-7">
              <div className="mb-5">
                <h2 className="text-xl font-semibold tracking-tight">Client login</h2>
                <p className="mt-1 text-sm text-white/70">Use your email and password to access your account.</p>
              </div>

              {/* Email */}
              <label className="block text-sm">
                <span className="mb-1 block text-white/85">Email</span>
                <div className="relative">
                  <input
                    type="email"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 pr-10 text-white placeholder-white/40 outline-none ring-0 focus:border-white/20 focus:ring-2 focus:ring-yellow-500/30"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={onEnter}
                    autoComplete="email"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 opacity-70">
                    <MailIcon className="h-4 w-4" />
                  </span>
                </div>
              </label>

              {/* Password */}
              <div className="mt-3">
                <label className="block text-sm">
                  <span className="mb-1 block text-white/85">Password</span>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 pr-16 text-white placeholder-white/40 outline-none ring-0 focus:border-white/20 focus:ring-2 focus:ring-yellow-500/30"
                      placeholder="Your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => {
                        handleCaps(e);
                        onEnter(e);
                      }}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/15"
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </label>
                {capsOn && <div className="mt-1 text-xs text-amber-300">Caps Lock is ON</div>}
              </div>

              {/* hCaptcha */}
              <div className="mt-4">
                <HCaptcha
                  sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY || ""}
                  onVerify={(t) => setCaptchaToken(t)}
                  onExpire={() => setCaptchaToken(null)}
                  onClose={() => setCaptchaToken(null)}
                  ref={captchaRef}
                  theme="dark"
                />
              </div>

              {/* Options row */}
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <label className="inline-flex items-center gap-2 text-xs text-white/80">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="accent-yellow-500"
                  />
                  Remember my email
                </label>
                <button
                  onClick={handleReset}
                  className="text-xs text-yellow-300 hover:underline underline-offset-2"
                  type="button"
                  disabled={loading}
                >
                  Forgot password?
                </button>
              </div>

              {/* CTAs */}
              <div className="mt-4 grid grid-cols-1 gap-2">
                <button
                  onClick={handleLogin}
                  disabled={loading}
                  className="rounded-lg bg-yellow-500 px-4 py-2 font-semibold text-[#041F3E] hover:bg-yellow-400 disabled:opacity-60"
                >
                  {loading ? "Signing in…" : "Sign in"}
                </button>
                <button
                  onClick={handleMagicLink}
                  disabled={loading || !email}
                  className="rounded-lg bg-white/10 px-4 py-2 font-semibold hover:bg-white/15 disabled:opacity-50"
                  title={!email ? "Enter your email first" : ""}
                >
                  Email me a magic link
                </button>
              </div>

              {/* Divider + Register */}
              <div className="my-5 flex items-center gap-3 text-white/40">
                <span className="h-px w-full bg-white/10" />
                <span className="text-[11px] uppercase tracking-widest">New to FuelFlow?</span>
                <span className="h-px w-full bg-white/10" />
              </div>
              <a
                href="https://dashboard.fuelflow.co.uk/register"
                className="inline-flex w-full items-center justify-center rounded-lg border border-white/15 bg-transparent px-4 py-2 text-sm font-semibold hover:bg-white/5"
              >
                Register as a client
              </a>

              {/* Message */}
              {msg && (
                <div
                  className={[
                    "mt-4 rounded-lg border p-2 text-sm",
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

              <p className="mt-4 text-[11px] leading-relaxed text-white/60">
                By signing in you agree to our{" "}
                <a href="/terms?return=/client-dashboard" className="text-yellow-300 underline-offset-2 hover:underline">
                  Terms
                </a>
                .
              </p>
            </div>
          </section>

          {/* Welcome / benefits */}
          <section className="order-2 lg:order-1 lg:col-span-7">
            <div className="rounded-2xl bg-gray-800/40 p-6 md:p-7">
              <h1 className="text-3xl font-bold tracking-tight">Welcome back to FuelFlow</h1>
              <p className="mt-2 max-w-xl text-white/70">
                Your hub for live fuel pricing, orders, contracts and invoices — all in one place.
              </p>

              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ValueCard title="Live pricing" body="Know today’s rate before you place an order." />
                <ValueCard title="Fast delivery" body="Pick an available date up to two weeks ahead." />
                <ValueCard title="Secure checkout" body="Payments protected with 3-D Secure via Stripe." />
                <ValueCard title="UK support" body="Talk to a real person when you need a hand." />
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="relative border-t border-white/10">
        <div className="mx-auto max-w-6xl px-4 py-4 text-center text-xs text-white/60">
          © {new Date().getFullYear()} FuelFlow. Secure login powered by Supabase &amp; hCaptcha.
        </div>
      </footer>
    </div>
  );
}

/* ---------- small components ---------- */

function ValueCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl bg-gray-800 p-4">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 text-sm text-white/75">{body}</div>
    </div>
  );
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" ry="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}


