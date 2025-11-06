// src/pages/register.tsx
// src/pages/register.tsx
"use client";

import React, { useRef, useState, type ReactElement } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import type HCaptchaType from "@hcaptcha/react-hcaptcha";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

type Msg = { type: "error" | "success" | "info"; text: string };

export default function Register() {
  const captchaRef = useRef<HCaptchaType>(null);

  // form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // ui
  const [showPassword, setShowPassword] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);

  // messages
  const [msg, setMsg] = useState<Msg | null>(null);

  // hCaptcha
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  function handleCaps(e: React.KeyboardEvent<HTMLInputElement>) {
    setCapsOn(e.getModifierState && e.getModifierState("CapsLock"));
  }

  function resetCaptcha() {
    captchaRef.current?.resetCaptcha();
    setCaptchaToken(null);
  }

  async function handleRegister() {
    if (loading) return; // prevent double-clicks
    try {
      setLoading(true);
      setMsg(null);

      if (!email || !password) {
        setMsg({ type: "error", text: "Please enter your email and password." });
        return;
      }
      if (!agree) {
        setMsg({ type: "error", text: "Please accept the Terms." });
        return;
      }
      if (!captchaToken) {
        setMsg({ type: "error", text: "Please complete the captcha." });
        return;
      }

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: "https://fuelflow.co.uk/welcome", // adjust if needed
          captchaToken, // must be FRESH each submit
        },
      });

      if (error) {
        setMsg({ type: "error", text: "Registration failed: " + error.message });
        return;
      }

      setMsg({
        type: "success",
        text:
          "Registration successful! Check your email for a verification link, then sign in.",
      });
    } catch (e: any) {
      setMsg({ type: "error", text: e?.message || "Unexpected error." });
    } finally {
      // IMPORTANT: never reuse a token — force a new solve next time
      resetCaptcha();
      setLoading(false);
    }
  }

  function onEnter(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleRegister();
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-[#0b1220] text-white overflow-x-hidden">
      {/* Global fixes: ensure no white strip and dark bg everywhere */}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap');
        html, body { height: 100%; background:#0b1220; }
        body { overflow-x: hidden; }
        .ff-display { font-family: 'Outfit', ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"; }
      `}</style>

      {/* Header */}
      <header className="relative">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <a href="https://fuelflow.co.uk" className="flex items-center gap-3">
            <img
              src="https://dashboard.fuelflow.co.uk/logo-email.png"
              alt="FuelFlow"
              className="h-7 w-auto"
            />
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
        {/* Background accents */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div
            className="absolute -top-24 -left-16 h-72 w-72 rounded-full blur-3xl opacity-25"
            style={{ background: "radial-gradient(circle at 30% 30%, #FFE27A, transparent 60%)" }}
          />
          <div
            className="absolute -bottom-28 -right-10 h-96 w-96 rounded-full blur-3xl opacity-20"
            style={{ background: "radial-gradient(circle at 30% 30%, #FDB022, transparent 60%)" }}
          />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.04)_0%,rgba(255,255,255,0.02)_30%,transparent_30%),linear-gradient(0deg,transparent_0%,transparent_96%,rgba(255,255,255,0.06)_96%)]" />
        </div>

        {/* Form LEFT, benefits RIGHT */}
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-stretch gap-6 px-4 py-8 lg:grid-cols-12 lg:py-12">
          {/* Register card */}
          <section className="order-1 flex lg:order-1 lg:col-span-5">
            <div className="flex-1 rounded-2xl bg-white/5 backdrop-blur p-6 md:p-7 ring-1 ring-inset ring-white/10">
              {/* Stepper */}
              <ol className="ff-display mb-5 flex items-center justify-between gap-2 text-[11px] uppercase tracking-widest text-white/70">
                <li className="flex items-center gap-2">
                  <StepDot active /> Create
                </li>
                <Line />
                <li className="flex items-center gap-2">
                  <StepDot /> Verify
                </li>
                <Line />
                <li className="flex items-center gap-2">
                  <StepDot /> Start
                </li>
              </ol>

              <div className="mb-2 ff-display">
                <h1 className="text-2xl font-extrabold tracking-tight">Register your account</h1>
                <p className="mt-1 text-sm font-medium text-white/70">
                  Quick setup — verify by email, then you’re in.
                </p>
              </div>

              {/* Email */}
              <label className="mt-4 block text-sm">
                <span className="mb-1 block text-white/85">Email</span>
                <div className="relative">
                  <input
                    type="email"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 pr-10 text-white placeholder-white/45 outline-none focus:border-white/20 focus:ring-2 focus:ring-yellow-500/30"
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
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 pr-16 text-white placeholder-white/45 outline-none focus:border-white/20 focus:ring-2 focus:ring-yellow-500/30"
                      placeholder="Minimum 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={handleCaps}
                      autoComplete="new-password"
                      minLength={8}
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
                <p className="mt-1 text-xs text-white/60">
                  Tip: include numbers & symbols for a stronger password.
                </p>
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

              {/* Terms */}
              <label className="mt-3 flex items-start gap-2 text-xs text-white/80">
                <input
                  type="checkbox"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                  className="mt-0.5 accent-yellow-500"
                />
                I agree to the{" "}
                <a href="/terms" target="_blank" rel="noreferrer" className="text-yellow-300 underline-offset-2 hover:underline">
                  Terms
                </a>
                .
              </label>

              {/* CTA */}
              <div className="mt-4 grid grid-cols-1 gap-2">
                <button
                  onClick={handleRegister}
                  disabled={loading}
                  className="ff-display rounded-lg bg-yellow-500 px-4 py-2 text-sm font-semibold tracking-wide text-[#041F3E] hover:bg-yellow-400 disabled:opacity-60"
                >
                  {loading ? "Creating account…" : "Create account"}
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

              {/* Switch to login */}
              <p className="mt-4 text-center text-xs text-white/70">
                Already have an account?{" "}
                <a href="/login" className="text-yellow-300 underline-offset-2 hover:underline">
                  Sign in
                </a>
              </p>
            </div>
          </section>

          {/* Right: hero/benefits */}
          <section className="order-2 flex lg:order-2 lg:col-span-7">
            <div className="relative flex-1 overflow-hidden rounded-2xl bg-[radial-gradient(1200px_400px_at_80%_-10%,rgba(253,176,34,0.18),transparent),radial-gradient(1000px_500px_at_-10%_110%,rgba(255,226,122,0.14),transparent)] p-6 md:p-8 ring-1 ring-inset ring-white/10">
              <span className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-yellow-500/15 blur-3xl" />
              <div className="ff-display">
                <h2 className="text-4xl font-extrabold leading-tight tracking-tight">
                  Join FuelFlow
                  <br />
                  <span className="text-yellow-300">in minutes</span>
                </h2>
                <p className="mt-3 max-w-xl text-white/75">
                  A modern client area for pricing, orders, and documents — built for clarity and speed.
                </p>
              </div>

              <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Benefit title="Clear pricing" blurb="See today’s rates and lock a price before you order." Icon={ChartIcon} />
                <Benefit title="Secure checkout" blurb="3-D Secure payments via Stripe; card details never touch our servers." Icon={ShieldIcon} />
                <Benefit title="Flexible delivery" blurb="Pick a preferred slot — availability may vary by area and supplier." Icon={TruckIcon} />
                <Benefit title="Human support" blurb="Email or live chat with our UK-based team during business hours." Icon={HeadsetIcon} />
              </div>

              <p className="mt-6 text-xs text-white/60">
                No marketing spam. We’ll email you only about your account and orders.
              </p>
            </div>
          </section>
        </div>
      </main>

      <footer className="relative border-t border-white/10">
        <div className="mx-auto max-w-6xl px-4 py-4 text-center text-xs text-white/60">
          © {new Date().getFullYear()} FuelFlow. Secure signup powered by Supabase &amp; hCaptcha.
        </div>
      </footer>
    </div>
  );
}

/* ---------- helpers & icons ---------- */
function StepDot({ active = false }: { active?: boolean }) {
  return (
    <span
      className={[
        "inline-block h-2.5 w-2.5 rounded-full",
        active ? "bg-yellow-400 shadow-[0_0_0_3px_rgba(253,176,34,0.25)]" : "bg-white/30",
      ].join(" ")}
    />
  );
}
function Line() {
  return <span className="h-px w-12 bg-white/15" />;
}

function Benefit({
  title,
  blurb,
  Icon,
}: {
  title: string;
  blurb: string;
  Icon: (p: { className?: string }) => ReactElement;
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-gray-800 to-gray-850 p-4 ring-1 ring-inset ring-white/10 transition hover:translate-y-[-1px] hover:ring-white/20">
      <span className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-yellow-500/10 blur-2xl" />
      <div className="mb-3">
        <Icon className="h-12 w-12 opacity-90 transition group-hover:scale-105" />
      </div>
      <div className="text-lg font-semibold">{title}</div>
      <div className="mt-1 text-sm text-white/75">{blurb}</div>
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
function ChartIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className}>
      <defs>
        <linearGradient id="g1" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#FFD000" stopOpacity="0.25" />
          <stop offset="1" stopColor="#FFD000" stopOpacity="0.45" />
        </linearGradient>
      </defs>
      <rect x="6" y="10" width="52" height="40" rx="8" fill="none" stroke="currentColor" opacity="0.3" />
      <path d="M12 40 L24 28 L34 33 L46 20 L54 24" fill="none" stroke="url(#g1)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24" cy="28" r="2" fill="#FFD000" />
      <circle cx="46" cy="20" r="2" fill="#FFD000" />
    </svg>
  );
}
function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className}>
      <path d="M32 10l16 6v12c0 10-7 18-16 22-9-4-16-12-16-22V16l16-6z" fill="none" stroke="currentColor" opacity="0.35" />
      <rect x="22" y="24" width="20" height="12" rx="3" fill="none" stroke="#FFD000" opacity="0.6" />
      <circle cx="32" cy="30" r="2" fill="#FFD000" />
    </svg>
  );
}
function TruckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className}>
      <rect x="6" y="22" width="30" height="16" rx="3" fill="none" stroke="currentColor" opacity="0.35" />
      <path d="M36 26h10l6 6v6H36z" fill="none" stroke="currentColor" opacity="0.35" />
      <circle cx="18" cy="42" r="4" fill="#FFD000" />
      <circle cx="46" cy="42" r="4" fill="#FFD000" />
      <path d="M8 22h26" stroke="#FFD000" strokeWidth="2" opacity="0.5" />
    </svg>
  );
}
function HeadsetIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className}>
      <path d="M12 36v-4c0-11 9-20 20-20s20 9 20 20v4" fill="none" stroke="currentColor" opacity="0.35" />
      <rect x="10" y="34" width="10" height="12" rx="3" fill="#FFD000" />
      <rect x="44" y="34" width="10" height="12" rx="3" fill="#FFD000" />
      <path d="M40 48c0 3-4 6-8 6" stroke="currentColor" opacity="0.35" />
    </svg>
  );
}

