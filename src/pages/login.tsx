// src/pages/login.tsx
"use client";

import { useEffect, useRef, useState } from "react";
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
        captchaRef.current?.resetCaptcha();
        setCaptchaToken(null);
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

      const redirectTo = `${window.location.origin}/client-dashboard`;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });

      if (error) {
        setMsg({ type: "error", text: "Couldn’t send magic link: " + error.message });
        return;
      }
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

      const redirectTo = `${window.location.origin}/update-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });

      if (error) {
        setMsg({ type: "error", text: "Couldn’t send reset email: " + error.message });
        return;
      }
      setMsg({ type: "success", text: "Password reset email sent." });
    } catch (e: any) {
      setMsg({ type: "error", text: e?.message || "Unexpected error." });
    } finally {
      setLoading(false);
    }
  }

  function onEnter(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      handleLogin();
    }
  }

  return (
    <div className="relative min-h-screen text-white">
      {/* Premium layered background */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0b2344] via-[#061B34] to-[#041F3E]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.08),transparent_55%)]" />
      <div className="absolute -top-24 -left-24 w-[520px] h-[520px] rounded-full blur-3xl opacity-20 bg-yellow-500/20" />
      <div className="absolute -bottom-32 -right-24 w-[420px] h-[420px] rounded-full blur-3xl opacity-10 bg-cyan-400/20" />

      <header className="relative z-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <img src="/logo-email.png" alt="FuelFlow" className="h-8 w-auto" />
            <span className="hidden sm:block text-sm text-white/70">
              Secure client access
            </span>
          </div>
          <a
            href="https://fuelflow.co.uk"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10"
          >
            Back to fuelflow.co.uk
          </a>
        </div>
      </header>

      <main className="relative z-10">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-5 py-8 lg:grid-cols-12 lg:py-12">
          {/* Brand / value props (hidden on very small screens) */}
          <section className="order-2 lg:order-1 lg:col-span-7">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm ring-1 ring-white/5">
              <h1 className="text-2xl md:text-3xl font-bold">Welcome back</h1>
              <p className="mt-2 max-w-xl text-white/70">
                Sign in to manage your fuel orders, contracts and invoices in one secure place.
              </p>

              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ValueCard
                  title="Transparent pricing"
                  body="Live price cards keep you in control."
                />
                <ValueCard
                  title="Fast delivery"
                  body="Choose a date two weeks out—sorted."
                />
                <ValueCard
                  title="Secure payments"
                  body="Stripe checkout with 3-D Secure."
                />
                <ValueCard
                  title="UK-based support"
                  body="We’re here if you need a hand."
                />
              </div>
            </div>
          </section>

          {/* Login card */}
          <section className="order-1 lg:order-2 lg:col-span-5">
            <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur-md ring-1 ring-white/10">
              <div className="mb-4 flex items-center gap-2">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-yellow-500 text-[#041F3E] font-bold">
                  FF
                </div>
                <div>
                  <div className="text-lg font-semibold">Client Login</div>
                  <div className="text-xs text-white/60">Use your account email and password</div>
                </div>
              </div>

              {/* Email */}
              <label className="block text-sm">
                <span className="mb-1 block text-white/80">Email</span>
                <div className="relative">
                  <input
                    type="email"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 pr-10 text-white placeholder-white/40 outline-none focus:ring focus:ring-yellow-500/30"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={onEnter}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 opacity-70">
                    <MailIcon className="h-4 w-4" />
                  </span>
                </div>
              </label>

              {/* Password */}
              <div className="mt-3">
                <label className="block text-sm">
                  <span className="mb-1 block text-white/80">Password</span>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 pr-10 text-white placeholder-white/40 outline-none focus:ring focus:ring-yellow-500/30"
                      placeholder="Your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => {
                        handleCaps(e);
                        onEnter(e);
                      }}
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
                {capsOn && (
                  <div className="mt-1 text-xs text-amber-300">
                    Caps Lock is ON
                  </div>
                )}
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

              {/* CTA buttons */}
              <div className="mt-4 grid grid-cols-1 gap-2">
                <button
                  onClick={handleLogin}
                  disabled={loading}
                  className="rounded-xl bg-yellow-500 px-4 py-2 font-semibold text-[#041F3E] hover:bg-yellow-400 disabled:opacity-60"
                >
                  {loading ? "Signing in…" : "Sign In"}
                </button>
                <button
                  onClick={handleMagicLink}
                  disabled={loading || !email}
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 font-semibold hover:bg-white/10 disabled:opacity-50"
                  title={!email ? "Enter your email first" : ""}
                >
                  Email me a magic link
                </button>
              </div>

              {/* Message */}
              {msg && (
                <div
                  className={[
                    "mt-3 rounded-lg border p-2 text-sm",
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
                . For assistance, email{" "}
                <a href="mailto:support@fuelflow.co.uk" className="text-yellow-300 underline-offset-2 hover:underline">
                  support@fuelflow.co.uk
                </a>.
              </p>
            </div>
          </section>
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/10 bg-white/[0.02]">
        <div className="mx-auto max-w-6xl px-5 py-4 text-center text-xs text-white/60">
          © {new Date().getFullYear()} FuelFlow. Secure login powered by Supabase & hCaptcha.
        </div>
      </footer>
    </div>
  );
}

/* ---------- small components ---------- */

function ValueCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 ring-1 ring-white/5">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 text-sm text-white/75">{body}</div>
    </div>
  );
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 6h16v12H4z" />
      <path d="M22 6l-10 7L2 6" />
    </svg>
  );
}



