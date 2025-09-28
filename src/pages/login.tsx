// src/pages/login.tsx
// src/pages/login.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import type HCaptchaType from "@hcaptcha/react-hcaptcha";
import { createClient } from "@supabase/supabase-js";

/* =========================================================
   Supabase client
   ========================================================= */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

/* =========================================================
   Types / helpers
   ========================================================= */
type Msg = { type: "error" | "success" | "info"; text: string };

function getNextPath(router: ReturnType<typeof useRouter>) {
  const qNext = (router.query?.next as string) || "";
  // Only accept same-origin, app-local paths
  if (qNext && qNext.startsWith("/")) return qNext;
  return "/client-dashboard";
}

/* =========================================================
   Component
   ========================================================= */
export default function LoginPage() {
  const router = useRouter();
  const captchaRef = useRef<HCaptchaType>(null);
  const inFlight = useRef(false);

  // form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // ui
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [loading, setLoading] = useState(false);

  // captcha
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  /* ---------------------------------------------------------
     Access router: decides final destination after sign-in
     --------------------------------------------------------- */
  async function routeAfterLogin() {
    if (inFlight.current) return;
    inFlight.current = true;

    try {
      // Who just signed in?
      const { data: auth } = await supabase.auth.getUser();
      const emailLower = (auth?.user?.email || "").toLowerCase();

      if (!emailLower) {
        // No session — back to login
        await supabase.auth.signOut().catch(() => {});
        setMsg({ type: "error", text: "Please sign in." });
        inFlight.current = false;
        return;
      }

      // 1) Admins first
      {
        const { data, error } = await supabase
          .from("admins")
          .select("email")
          .eq("email", emailLower)
          .maybeSingle();

        if (!error && data?.email) {
          setMsg({ type: "success", text: "Login successful! Redirecting…" });
          router.replace("/admin-dashboard");
          return;
        }
      }

      // 2) Client access gate
      const { ensureClientAccess } = await import("../lib/access-guard");
      try {
        await ensureClientAccess(supabase); // throws 'blocked' or 'pending'
      } catch (e: any) {
        const reason = String(e?.message || "");
        if (reason === "blocked") {
          setMsg({ type: "info", text: "Your account is blocked." });
          router.replace("/blocked");
          return;
        }
        if (reason === "pending") {
          setMsg({ type: "info", text: "Your account is pending approval." });
          router.replace("/pending");
          return;
        }
        // Couldn’t validate; force re-auth
        await supabase.auth.signOut().catch(() => {});
        setMsg({ type: "error", text: "Please sign in." });
        inFlight.current = false;
        return;
      }

      // 3) Allowed client → go to next or dashboard
      setMsg({ type: "success", text: "Login successful! Redirecting…" });
      router.replace(getNextPath(router));
    } finally {
      // Do not clear inFlight here; we want to avoid re-entry while router navigates
    }
  }

  /* ---------------------------------------------------------
     On mount: prefill email + if already signed in, route away
     --------------------------------------------------------- */
  useEffect(() => {
    const saved = localStorage.getItem("ff_login_email");
    if (saved) setEmail(saved);

    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (auth?.user?.email) {
        await routeAfterLogin();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (remember && email) localStorage.setItem("ff_login_email", email);
    if (!remember) localStorage.removeItem("ff_login_email");
  }, [remember, email]);

  function resetCaptcha() {
    captchaRef.current?.resetCaptcha();
    setCaptchaToken(null);
  }

  /* ---------------------------------------------------------
     Actions
     --------------------------------------------------------- */
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

      await routeAfterLogin();
    } catch (e: any) {
      setMsg({ type: "error", text: e?.message || "Unexpected error." });
    } finally {
      setLoading(false);
    }
  }

  function onEnter(e: React.KeyboardEvent) {
    if (e.key === "Enter") void handleLogin();
  }

  /* ---------------------------------------------------------
     Render (compact but styled)
     --------------------------------------------------------- */
  return (
    <div className="min-h-screen bg-[#0b1220] text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <a href="https://fuelflow.co.uk" className="flex items-center gap-3">
            <img src="/logo-email.png" alt="FuelFlow" className="h-7 w-auto" />
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

      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-8 lg:grid-cols-12 lg:py-12">
        {/* Left – simple feature tiles */}
        <section className="order-2 flex lg:order-1 lg:col-span-7">
          <div className="flex-1 rounded-2xl bg-gray-800/40 p-6 md:p-7">
            <h1 className="text-3xl font-bold tracking-tight">Welcome to FuelFlow</h1>
            <p className="mt-2 max-w-xl text-white/70">
              Your hub for live fuel pricing, orders, contracts and invoices — all in one place.
            </p>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                ["Live pricing", "See today’s rate before you order."],
                ["Scheduled delivery", "Pick a preferred date — subject to availability."],
                ["Secure checkout", "3-D Secure payments powered by Stripe."],
                ["UK-based support", "Email or live chat when you need a hand."],
              ].map(([t, b]) => (
                <div key={t} className="rounded-xl bg-gradient-to-br from-gray-800 to-gray-850 p-4 ring-1 ring-white/10">
                  <div className="text-lg font-semibold">{t}</div>
                  <div className="mt-2 text-sm text-white/75">{b}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Right – login card */}
        <section className="order-1 flex lg:order-2 lg:col-span-5">
          <div className="flex-1 rounded-2xl bg-gray-800 p-6 md:p-7">
            <div className="mb-5">
              <h2 className="text-xl font-semibold tracking-tight">Client login</h2>
              <p className="mt-1 text-sm text-white/70">Use your account email and password.</p>
            </div>

            {/* Email */}
            <label className="block text-sm">
              <span className="mb-1 block text-white/85">Email</span>
              <input
                type="email"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none focus:border-white/20 focus:ring-2 focus:ring-yellow-500/30"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={onEnter}
                autoComplete="email"
              />
            </label>

            {/* Password */}
            <div className="mt-3">
              <label className="block text-sm">
                <span className="mb-1 block text-white/85">Password</span>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 pr-16 text-white placeholder-white/40 outline-none focus:border-white/20 focus:ring-2 focus:ring-yellow-500/30"
                    placeholder="Your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={onEnter}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/15"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </label>
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
              <a
                className="text-xs text-yellow-300 hover:underline underline-offset-2 cursor-pointer"
                onClick={async () => {
                  if (!email) return setMsg({ type: "error", text: "Enter your email first." });
                  if (!captchaToken) return setMsg({ type: "error", text: "Please complete the captcha." });
                  const redirectTo = `${window.location.origin}/update-password`;
                  const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo,
                    captchaToken,
                  });
                  if (error) {
                    setMsg({ type: "error", text: "Couldn’t send reset email: " + error.message });
                    captchaRef.current?.resetCaptcha();
                    setCaptchaToken(null);
                    return;
                  }
                  setMsg({ type: "success", text: "Password reset email sent." });
                  captchaRef.current?.resetCaptcha();
                  setCaptchaToken(null);
                }}
              >
                Forgot password?
              </a>
            </div>

            {/* Sign in */}
            <div className="mt-4">
              <button
                onClick={handleLogin}
                disabled={loading}
                className="w-full rounded-lg bg-yellow-500 px-4 py-2 font-semibold text-[#041F3E] hover:bg-yellow-400 disabled:opacity-60"
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </div>

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
      </main>

      <footer className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-4 py-4 text-center text-xs text-white/60">
          © {new Date().getFullYear()} FuelFlow. Secure login powered by Supabase &amp; hCaptcha.
        </div>
      </footer>
    </div>
  );
}


