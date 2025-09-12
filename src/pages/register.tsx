// src/pages/register.tsx
"use client";

import React, { useRef, useState, type ReactElement } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import type HCaptchaType from "@hcaptcha/react-hcaptcha";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/router";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

type Msg = { type: "error" | "success" | "info"; text: string };
type FeatureKey = "pricing" | "delivery" | "checkout" | "support";

/* ---- same features/illustrations as login ---- */
const FEATURES: Record<
  FeatureKey,
  {
    title: string;
    blurb: string;
    detail: string;
    Art: (p: { className?: string }) => ReactElement;
  }
> = {
  pricing: {
    title: "Live pricing",
    blurb: "See today’s rate before you order.",
    detail:
      "Prices update from our suppliers throughout the day. View your personalised rate card and lock a price before you place an order.",
    Art: ChartArt,
  },
  delivery: {
    title: "Scheduled delivery",
    blurb: "Pick a preferred date — subject to availability.",
    detail:
      "Choose a delivery window that suits you. Availability varies by area and supplier, and may change without notice.",
    Art: TruckArt,
  },
  checkout: {
    title: "Secure checkout",
    blurb: "3-D Secure payments powered by Stripe.",
    detail:
      "All payments are processed through Stripe with 3-D Secure. Your card details never touch our servers.",
    Art: ShieldCardArt,
  },
  support: {
    title: "UK-based support",
    blurb: "Email or live chat when you need a hand.",
    detail:
      "Reach our UK team by email or live chat for account queries, delivery questions and billing help during business hours.",
    Art: HeadsetArt,
  },
};

export default function Register() {
  const router = useRouter();
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
    try {
      setLoading(true);
      setMsg(null);

      if (!email || !password) {
        setMsg({ type: "error", text: "Please enter your email and password." });
        return;
      }
      if (!agree) {
        setMsg({ type: "error", text: "Please accept the Terms and Privacy Policy." });
        return;
      }
      if (!captchaToken) {
        setMsg({ type: "error", text: "Please complete the captcha." });
        return;
      }

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { captchaToken },
      });

      if (error) {
        setMsg({ type: "error", text: "Registration failed: " + error.message });
        resetCaptcha();
        return;
      }

      resetCaptcha();
      setMsg({
        type: "success",
        text:
          "Registration successful! Please check your email for a verification link.",
      });
      // Optionally route to login after a short pause:
      // setTimeout(() => router.push("/login"), 1200);
    } catch (e: any) {
      setMsg({ type: "error", text: e?.message || "Unexpected error." });
    } finally {
      setLoading(false);
    }
  }

  function onEnter(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleRegister();
  }

  return (
    <div className="relative flex min-h-[100svh] md:min-h-screen flex-col bg-[#0b1220] text-white">
      {/* Header — same as login (uses the SAME logo file) */}
      <header className="relative">
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

      <main className="relative flex-1">
        {/* Equal-height columns; mirrors login grid */}
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-stretch gap-6 px-4 py-8 lg:grid-cols-12 lg:py-12">
          {/* VISUAL / Welcome (left) */}
          <section className="order-2 flex lg:order-1 lg:col-span-7">
            <div className="flex-1 rounded-2xl bg-gray-800/40 p-6 md:p-7 h-full">
              <h1 className="text-3xl font-bold tracking-tight">Create your FuelFlow account</h1>
              <p className="mt-2 max-w-xl text-white/70">
                Access live pricing, manage orders and documents, and get support — all in one secure dashboard.
              </p>

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {(
                  [
                    ["pricing", FEATURES.pricing],
                    ["delivery", FEATURES.delivery],
                    ["checkout", FEATURES.checkout],
                    ["support", FEATURES.support],
                  ] as [FeatureKey, (typeof FEATURES)[FeatureKey]][]
                ).map(([key, f]) => (
                  <button
                    key={key}
                    className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-gray-800 to-gray-850 p-4 text-left ring-1 ring-inset ring-white/10 transition hover:translate-y-[-1px] hover:ring-white/20"
                    type="button"
                    title={f.title}
                  >
                    <span className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-yellow-500/10 blur-2xl" />
                    <div className="mb-3">
                      <f.Art className="h-12 w-12 opacity-90 transition group-hover:scale-105" />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-lg font-semibold">{f.title}</div>
                      <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider group-hover:bg-white/15">
                        Included
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-white/75">{f.blurb}</div>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* REGISTER card (right) — same visual style as login card */}
          <section className="order-1 flex lg:order-2 lg:col-span-5">
            <div className="flex-1 rounded-2xl bg-gray-800 p-6 md:p-7 h-full">
              <div className="mb-5">
                <h2 className="text-xl font-semibold tracking-tight">Register as a client</h2>
                <p className="mt-1 text-sm text-white/70">Use a valid email and a strong password.</p>
              </div>

              {/* Email */}
              <label className="block text-sm">
                <span className="mb-1 block text-white/85">Email</span>
                <div className="relative">
                  <input
                    type="email"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 pr-10 text-white placeholder-white/40 outline-none focus:border-white/20 focus:ring-2 focus:ring-yellow-500/30"
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
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 pr-16 text-white placeholder-white/40 outline-none focus:border-white/20 focus:ring-2 focus:ring-yellow-500/30"
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
                  Use at least 8 characters. Adding numbers and symbols improves strength.
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
                </a>{" "}
                and{" "}
                <a href="/privacy" target="_blank" rel="noreferrer" className="text-yellow-300 underline-offset-2 hover:underline">
                  Privacy Policy
                </a>
                .
              </label>

              {/* CTAs */}
              <div className="mt-4 grid grid-cols-1 gap-2">
                <button
                  onClick={handleRegister}
                  disabled={loading}
                  className="rounded-lg bg-yellow-500 px-4 py-2 font-semibold text-[#041F3E] hover:bg-yellow-400 disabled:opacity-60"
                >
                  {loading ? "Creating account…" : "Create account"}
                </button>
              </div>

              {/* Divider + Login link */}
              <div className="my-5 flex items-center gap-3 text-white/40">
                <span className="h-px w-full bg-white/10" />
                <span className="text-[11px] uppercase tracking-widest">Already have an account?</span>
                <span className="h-px w-full bg-white/10" />
              </div>
              <a
                href="https://dashboard.fuelflow.co.uk/login"
                className="inline-flex w-full items-center justify-center rounded-lg border border-white/15 bg-transparent px-4 py-2 text-sm font-semibold hover:bg-white/5"
              >
                Back to login
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
                We’ll send a verification email after you register. You can only access the dashboard once verified.
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

/* ---------- small components & illustrations (same as login) ---------- */
function MailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" ry="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

function ChartArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className}>
      <defs>
        <linearGradient id="g1" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#FFD000" stopOpacity="0.2" />
          <stop offset="1" stopColor="#FFD000" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      <rect x="6" y="10" width="52" height="40" rx="8" fill="none" stroke="currentColor" opacity="0.3" />
      <path
        d="M12 40 L24 28 L34 33 L46 20 L54 24"
        fill="none"
        stroke="url(#g1)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="28" r="2" fill="#FFD000" />
      <circle cx="46" cy="20" r="2" fill="#FFD000" />
    </svg>
  );
}
function TruckArt({ className }: { className?: string }) {
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
function ShieldCardArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className}>
      <path d="M32 10l16 6v12c0 10-7 18-16 22-9-4-16-12-16-22V16l16-6z" fill="none" stroke="currentColor" opacity="0.35" />
      <rect x="22" y="24" width="20" height="12" rx="3" fill="none" stroke="#FFD000" opacity="0.6" />
      <circle cx="32" cy="30" r="2" fill="#FFD000" />
    </svg>
  );
}
function HeadsetArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className}>
      <path d="M12 36v-4c0-11 9-20 20-20s20 9 20 20v4" fill="none" stroke="currentColor" opacity="0.35" />
      <rect x="10" y="34" width="10" height="12" rx="3" fill="#FFD000" />
      <rect x="44" y="34" width="10" height="12" rx="3" fill="#FFD000" />
      <path d="M40 48c0 3-4 6-8 6" stroke="currentColor" opacity="0.35" />
    </svg>
  );
}
