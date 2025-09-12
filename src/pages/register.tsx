"use client";
import { useRef, useState } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

// simple strength check
function strength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[a-z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4);
}

function BrandLogo({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#FFE27A" />
          <stop offset="100%" stopColor="#FDB022" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#0E2E57" />
      <path d="M18 40c10-2 18-10 22-22l6 6C42 36 32 46 18 48v-8z" fill="url(#g)" />
      <circle cx="24" cy="24" r="5" fill="#FFE27A" />
    </svg>
  );
}

export default function Register() {
  const captchaRef = useRef<any>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [agree, setAgree] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const pwStrength = strength(password);

  const handleRegister = async () => {
    setMessage(null);
    if (!captchaToken) return setMessage("Please complete the captcha.");
    if (!agree) return setMessage("Please accept the Terms to continue.");
    setStatus("loading");

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { captchaToken },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      captchaRef.current?.resetCaptcha();
      setCaptchaToken("");
      return;
    }

    setStatus("success");
    setMessage("Registration successful. Check your email to verify your account.");
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center bg-[#041F3E] text-white overflow-hidden">
      {/* background accents */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full blur-3xl opacity-30"
             style={{ background: "radial-gradient(circle at 30% 30%, #FFE27A, transparent 60%)" }}/>
        <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full blur-3xl opacity-25"
             style={{ background: "radial-gradient(circle at 30% 30%, #FDB022, transparent 60%)" }}/>
      </div>

      <div className="relative z-10 w-full max-w-5xl grid md:grid-cols-2 gap-8 p-6">
        {/* left pitch */}
        <div className="flex flex-col justify-center">
          <div className="flex items-center gap-3 mb-6">
            <BrandLogo />
            <div>
              <p className="text-sm text-white/70">Welcome to</p>
              <h1 className="text-2xl font-bold tracking-tight">FuelFlow Clients</h1>
            </div>
          </div>

          <h2 className="text-3xl md:text-4xl font-semibold leading-tight mb-4">
            Create a Client Account
          </h2>
          <p className="text-white/80 mb-6 max-w-md">
            Access your dashboard, manage projects, and collaborate securely.
          </p>

          <ul className="space-y-2 text-white/90 text-sm">
            <li>• Secure sign-up protected by hCaptcha</li>
            <li>• Email verification for safety</li>
            <li>• No spam — cancel anytime</li>
          </ul>
        </div>

        {/* right form */}
        <div className="bg-[#0E2E57]/80 backdrop-blur border border-white/10 shadow-2xl rounded-2xl p-6">
          {status === "success" ? (
            <div className="text-center py-10">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-green-500/20 grid place-items-center">✓</div>
              <h3 className="text-lg font-semibold mb-2">You're almost there!</h3>
              <p className="text-white/80">
                We sent a verification link to <span className="font-medium">{email}</span>.
              </p>
            </div>
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); handleRegister(); }}
              className="space-y-5"
            >
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm">Email</label>
                <input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  className="w-full p-3 rounded-lg bg-[#041F3E] border border-white/10 placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-yellow-400/60"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm">Password</label>
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="w-full p-3 rounded-lg bg-[#041F3E] border border-white/10 placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-yellow-400/60"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
                {/* strength meter */}
                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={[
                      "h-full transition-all",
                      pwStrength === 0 ? "w-1/12 bg-red-400" :
                      pwStrength === 1 ? "w-1/4 bg-orange-400" :
                      pwStrength === 2 ? "w-2/4 bg-yellow-400" :
                      pwStrength === 3 ? "w-3/4 bg-lime-400" : "w-full bg-green-400"
                    ].join(" ")}
                  />
                </div>
              </div>

              <HCaptcha
                sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY || ""}
                onVerify={setCaptchaToken}
                ref={captchaRef}
                theme="dark"
              />

              <label className="flex items-start gap-2 text-sm text-white/80">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-white/20 bg-[#041F3E]"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                />
                I agree to the <a className="underline underline-offset-4" href="/terms" target="_blank">Terms</a> and
                {" "}<a className="underline underline-offset-4" href="/privacy" target="_blank">Privacy Policy</a>.
              </label>

              {message && (
                <div className="text-sm rounded-md p-3 border border-yellow-400/40 bg-yellow-400/10 text-yellow-100">
                  {message}
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-yellow-500 text-[#041F3E] mt-2 py-3 rounded-lg font-semibold shadow-lg hover:shadow-xl transition-shadow disabled:opacity-60"
                disabled={status === "loading"}
              >
                {status === "loading" ? "Creating account…" : "Create account"}
              </button>

              <p className="text-xs text-white/60 text-center">
                Already registered? <a href="/login" className="underline underline-offset-4">Sign in</a>
              </p>
            </form>
          )}
        </div>
      </div>

      <footer className="absolute bottom-4 inset-x-0 mx-auto w-full max-w-5xl px-6 text-center text-xs text-white/60">
        <div className="inline-flex items-center gap-2">
          <BrandLogo className="w-5 h-5" />
          <span>© {new Date().getFullYear()} FuelFlow</span>
        </div>
      </footer>
    </div>
  );
}

