// src/pages/quote.tsx
// src/pages/quote.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";

/* ----------------------- Types & defaults ----------------------- */
type FormState = {
  customer_name: string;
  email: string;
  phone: string;
  customer_type: "business" | "residential";
  company_name?: string;
  postcode: string;
  city?: string;
  fuel: "petrol" | "diesel";
  quantity_litres: string;
  urgency: "asap" | "this_week" | "flexible";
  preferred_delivery?: string;
  use_case?: string;
  access_notes?: string;
  notes?: string;
  marketing_opt_in: boolean;
};

const initialState: FormState = {
  customer_name: "",
  email: "",
  phone: "",
  customer_type: "residential",
  company_name: "",
  postcode: "",
  city: "",
  fuel: "diesel",
  quantity_litres: "",
  urgency: "flexible",
  preferred_delivery: "",
  use_case: "",
  access_notes: "",
  notes: "",
  marketing_opt_in: false,
};

/* ---------------------- Small helper utils ---------------------- */
const label = "block text-sm font-medium mb-1 text-white/90";
const baseInput =
  "w-full p-2 rounded-lg bg-white/[0.06] text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:border-transparent";
const okRing = "focus:ring-yellow-500/40 border border-white/15";
const errRing = "border border-red-400/60 focus:ring-red-400/40";

const grid2 = "grid grid-cols-1 md:grid-cols-2 gap-4";
const fmtGBP = (n: number) =>
  `£${(isFinite(n) ? n : 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

/* ------------------------- Simple Modal ------------------------- */
function Modal({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-[92vw] max-w-3xl rounded-2xl bg-[#0B2344] text-white shadow-2xl border border-white/10">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md px-2 py-1 text-white/70 hover:text-white hover:bg-white/10"
          >
            ✕
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

/* ---------------------- CTA Button component ---------------------- */
function CTAButton({
  title,
  subtitle,
  icon,
  onClick,
  color = "from-yellow-400 via-amber-400 to-orange-400",
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  onClick?: () => void;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group w-full rounded-2xl bg-gradient-to-r ${color} p-[2px] shadow-xl transition-transform hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-yellow-300`}
    >
      <div className="flex h-full w-full items-center gap-4 rounded-2xl bg-[#0B2344] px-5 py-4 text-left">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-white/10 text-white">
          {icon}
        </div>
        <div>
          <div className="text-lg font-semibold text-white">{title}</div>
          <div className="text-sm text-white/80">{subtitle}</div>
        </div>
        <div className="ml-auto text-white/70 group-hover:translate-x-1 transition-transform">
          →
        </div>
      </div>
    </button>
  );
}

/* --------------------------- Error banner --------------------------- */
function ErrorBanner({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div
      className="mb-4 rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-red-200"
      role="alert"
      aria-live="polite"
    >
      <div className="font-semibold mb-1">Please complete the following:</div>
      <ul className="list-disc list-inside space-y-0.5">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------ Success “screen” ------------------------ */
function SuccessPanel({
  summary,
  emailSent,
  onReset,
}: {
  summary: {
    customer_name: string;
    fuel: string;
    quantity_litres: number;
    postcode: string;
    preferred_delivery?: string;
  };
  emailSent: boolean;
  onReset: () => void;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-8 shadow-2xl backdrop-blur-sm text-white">
      <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-green-500/20 text-green-300">
        {/* checkmark */}
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20 6L9 17l-5-5"
          />
        </svg>
      </div>

      <h2 className="text-center text-2xl font-semibold mb-2">
        Enquiry logged — thank you!
      </h2>
      <p className="text-center text-white/80 mb-6">
        We’ve received your request{emailSent ? " and emailed a confirmation." : "."}
      </p>

      <div className="mx-auto max-w-xl rounded-xl border border-white/10 bg-white/[0.04] p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-white/60">Name</div>
            <div className="font-medium">{summary.customer_name || "—"}</div>
          </div>
          <div>
            <div className="text-white/60">Fuel</div>
            <div className="font-medium capitalize">{summary.fuel || "—"}</div>
          </div>
          <div>
            <div className="text-white/60">Quantity</div>
            <div className="font-medium">{summary.quantity_litres.toLocaleString()} L</div>
          </div>
          <div>
            <div className="text-white/60">Postcode</div>
            <div className="font-medium">{summary.postcode || "—"}</div>
          </div>
          <div className="sm:col-span-2">
            <div className="text-white/60">Preferred delivery</div>
            <div className="font-medium">{summary.preferred_delivery || "—"}</div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
        <a
          href="/client-dashboard"
          className="inline-flex justify-center rounded-xl bg-yellow-500 px-4 py-2 font-semibold text-[#041F3E] hover:bg-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-300"
        >
          View client dashboard
        </a>
        <button
          onClick={onReset}
          className="inline-flex justify-center rounded-xl bg-white/10 px-4 py-2 font-semibold text-white hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/30"
        >
          Make another request
        </button>
      </div>
    </div>
  );
}

/* ============================== Page ============================== */
export default function QuotePage() {
  const [form, setForm] = useState<FormState>(initialState);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [errorList, setErrorList] = useState<string[]>([]);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  // Success state
  const [success, setSuccess] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [lastSummary, setLastSummary] = useState<{
    customer_name: string;
    fuel: string;
    quantity_litres: number;
    postcode: string;
    preferred_delivery?: string;
  } | null>(null);

  // Modals
  const [showAbout, setShowAbout] = useState(false);
  const [showCalc, setShowCalc] = useState(false);

  // Calculator state (GBP)
  const [consumption, setConsumption] = useState<number>(20000);
  const [marketPrice, setMarketPrice] = useState<number>(1.35);
  const [ourPrice, setOurPrice] = useState<number>(1.26);
  const [option, setOption] = useState<"rent" | "buy">("rent");
  const [tankPrice, setTankPrice] = useState<number>(12000);

  const savingsPerLitre = useMemo(
    () => Math.max(marketPrice - ourPrice, 0),
    [marketPrice, ourPrice]
  );
  const monthlySaving = useMemo(
    () => consumption * savingsPerLitre,
    [consumption, savingsPerLitre]
  );
  const annualSaving = useMemo(() => monthlySaving * 12, [monthlySaving]);
  const paybackMonths = useMemo(
    () => (monthlySaving > 0 ? tankPrice / monthlySaving : Infinity),
    [tankPrice, monthlySaving]
  );

  // hCaptcha compact on mobile
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const update = () =>
      setIsMobile(window.matchMedia("(max-width: 640px)").matches);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  /* -------------------- Validation helpers -------------------- */
  function validate(current: FormState) {
    const e: Record<string, string> = {};

    if (!current.customer_name.trim()) e.customer_name = "Full name is required";
    if (!current.email.trim()) e.email = "Email is required";
    if (!current.phone.trim()) e.phone = "Phone is required";
    if (!current.postcode.trim()) e.postcode = "Postcode is required";
    if (!current.quantity_litres || Number(current.quantity_litres) <= 0)
      e.quantity_litres = "Please enter a valid quantity";

    return e;
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    // live clear error as user types
    setErrors((es) => {
      const copy = { ...es };
      delete copy[key as string];
      return copy;
    });
  }

  function focusFirstError(errMap: Record<string, string>) {
    const order = [
      "customer_name",
      "email",
      "phone",
      "postcode",
      "quantity_litres",
    ];
    for (const id of order) {
      if (errMap[id]) {
        const el = document.getElementById(id);
        if (el && "focus" in el) (el as any).focus();
        break;
      }
    }
  }

  /* ------------------------ Submit handler ------------------------ */
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setRequestError(null);

    // Validate fields
    const errMap = validate(form);
    const errList = Object.keys(errMap).map((k) => errMap[k]);
    setErrors(errMap);
    setErrorList(errList);

    if (Object.keys(errMap).length) {
      focusFirstError(errMap);
      return;
    }

    if (!captchaToken) {
      setCaptchaError("Please complete the captcha.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          quantity_litres: Number(form.quantity_litres),
          captchaToken,
        }),
      });

      const raw = await res.text();
      let data: any = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { error: raw || "Non-JSON response" };
      }

      if (!res.ok) {
        const msg =
          data?.error ||
          (res.status === 405
            ? "POST /api/quote not found (405). Ensure src/pages/api/quote.ts exists."
            : `Request failed (${res.status})`);
        throw new Error(msg);
      }

      // capture summary BEFORE clearing form
      const summary = {
        customer_name: form.customer_name,
        fuel: form.fuel,
        quantity_litres: Number(form.quantity_litres) || 0,
        postcode: form.postcode,
        preferred_delivery: form.preferred_delivery,
      };
      setLastSummary(summary);
      setEmailSent(!!data?.emailSent);
      setSuccess(true);

      // reset form/captcha
      setForm(initialState);
      setCaptchaToken("");
      setErrors({});
      setErrorList([]);
    } catch (err: any) {
      setRequestError(err.message || "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  /* ------------------------------ UI ------------------------------ */
  return (
    // IMPORTANT: overflow-x-hidden (not overflow-hidden) so hCaptcha overlay can render on mobile
    <div className="min-h-screen text-white relative overflow-x-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-[#041F3E]" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#082246]/40 via-[#041F3E]/40 to-[#041F3E]" />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 right-[-10%] opacity-[0.05] rotate-[-10deg]"
      >
        <img src="/logo-email.png" alt="" className="w-[860px] max-w-none" />
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.08),transparent_55%)]" />

      <main className="relative z-10 mx-auto w-full max-w-5xl px-4 py-10 md:py-14">
        {/* Header row */}
        <div className="mb-8 flex items-center gap-3">
          <img src="/logo-email.png" alt="FuelFlow" className="h-9 w-auto" />
          <h1 className="text-3xl md:text-4xl font-bold">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 via-yellow-300 to-orange-400">
              Request a Fuel Quote
            </span>
          </h1>
        </div>

        {/* Two big CTAs */}
        {!success && (
          <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-4">
            <CTAButton
              title="Who we are"
              subtitle="Lower run-rate on fuel, sustainable approach, automation-led savings."
              icon={<span className="text-2xl">🌿</span>}
              onClick={() => setShowAbout(true)}
            />
            <CTAButton
              title="Savings calculator"
              subtitle="Compare market vs. FuelFlow pricing and estimate ROI."
              icon={<span className="text-2xl">📈</span>}
              onClick={() => setShowCalc(true)}
            />
          </div>
        )}

        {/* Success state */}
        {success && lastSummary ? (
          <SuccessPanel
            summary={lastSummary}
            emailSent={emailSent}
            onReset={() => {
              setSuccess(false);
              setRequestError(null);
              setCaptchaError(null);
            }}
          />
        ) : (
          // Form
          <form
            onSubmit={onSubmit}
            className="rounded-2xl border border-white/10 bg-white/[0.06] p-6 md:p-8 shadow-2xl backdrop-blur-sm"
            noValidate
          >
            {/* Error banner */}
            <ErrorBanner items={errorList} />
            {requestError && (
              <div
                className="mb-4 rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-red-200"
                role="alert"
              >
                {requestError}
              </div>
            )}

            {/* Contact */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-3 text-white">Contact</h2>
              <div className={grid2}>
                <div>
                  <label className={label} htmlFor="customer_name">
                    Full name *
                  </label>
                  <input
                    id="customer_name"
                    className={`${baseInput} ${errors.customer_name ? errRing : okRing}`}
                    placeholder="Jane Smith"
                    value={form.customer_name}
                    onChange={(e) => setField("customer_name", e.target.value)}
                    onBlur={() => setErrors((es) => ({ ...es, ...validate(form) }))}
                  />
                  {errors.customer_name && (
                    <p className="mt-1 text-xs text-red-300">{errors.customer_name}</p>
                  )}
                </div>
                <div>
                  <label className={label} htmlFor="email">
                    Email *
                  </label>
                  <input
                    id="email"
                    type="email"
                    className={`${baseInput} ${errors.email ? errRing : okRing}`}
                    placeholder="name@company.com"
                    value={form.email}
                    onChange={(e) => setField("email", e.target.value)}
                    onBlur={() => setErrors((es) => ({ ...es, ...validate(form) }))}
                  />
                  {errors.email && (
                    <p className="mt-1 text-xs text-red-300">{errors.email}</p>
                  )}
                </div>
                <div>
                  <label className={label} htmlFor="phone">
                    Phone *
                  </label>
                  <input
                    id="phone"
                    className={`${baseInput} ${errors.phone ? errRing : okRing}`}
                    placeholder="+44 7…"
                    value={form.phone}
                    onChange={(e) => setField("phone", e.target.value)}
                    onBlur={() => setErrors((es) => ({ ...es, ...validate(form) }))}
                  />
                  {errors.phone && (
                    <p className="mt-1 text-xs text-red-300">{errors.phone}</p>
                  )}
                </div>
                <div>
                  <label className={label} htmlFor="customer_type">
                    Customer type *
                  </label>
                  <select
                    id="customer_type"
                    className={`${baseInput} ${okRing}`}
                    value={form.customer_type}
                    onChange={(e) =>
                      setField("customer_type", e.target.value as FormState["customer_type"])
                    }
                  >
                    <option value="residential">Residential</option>
                    <option value="business">Business</option>
                  </select>
                </div>
                {form.customer_type === "business" && (
                  <div className="md:col-span-2">
                    <label className={label} htmlFor="company_name">
                      Company name
                    </label>
                    <input
                      id="company_name"
                      className={`${baseInput} ${okRing}`}
                      value={form.company_name}
                      onChange={(e) => setField("company_name", e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Location */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-3 text-white">Location</h2>
              <div className={grid2}>
                <div>
                  <label className={label} htmlFor="postcode">
                    Postcode *
                  </label>
                  <input
                    id="postcode"
                    className={`${baseInput} ${errors.postcode ? errRing : okRing}`}
                    placeholder="SW1A 1AA"
                    value={form.postcode}
                    onChange={(e) => setField("postcode", e.target.value)}
                    onBlur={() => setErrors((es) => ({ ...es, ...validate(form) }))}
                  />
                  {errors.postcode && (
                    <p className="mt-1 text-xs text-red-300">{errors.postcode}</p>
                  )}
                </div>
                <div>
                  <label className={label} htmlFor="city">
                    City/Town
                  </label>
                  <input
                    id="city"
                    className={`${baseInput} ${okRing}`}
                    placeholder="London"
                    value={form.city}
                    onChange={(e) => setField("city", e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Request */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-3 text-white">Request</h2>
              <div className={grid2}>
                <div>
                  <label className={label} htmlFor="fuel">
                    Fuel *
                  </label>
                  <select
                    id="fuel"
                    className={`${baseInput} ${okRing}`}
                    value={form.fuel}
                    onChange={(e) => setField("fuel", e.target.value as any)}
                  >
                    <option value="diesel">Diesel</option>
                    <option value="petrol">Petrol</option>
                  </select>
                </div>
                <div>
                  <label className={label} htmlFor="quantity_litres">
                    Quantity (litres) *
                  </label>
                  <input
                    id="quantity_litres"
                    type="number"
                    min={1}
                    step="1"
                    className={`${baseInput} ${errors.quantity_litres ? errRing : okRing}`}
                    placeholder="1000"
                    value={form.quantity_litres}
                    onChange={(e) => setField("quantity_litres", e.target.value)}
                    onBlur={() => setErrors((es) => ({ ...es, ...validate(form) }))}
                  />
                  {errors.quantity_litres && (
                    <p className="mt-1 text-xs text-red-300">{errors.quantity_litres}</p>
                  )}
                </div>
                <div>
                  <label className={label} htmlFor="urgency">
                    Urgency
                  </label>
                  <select
                    id="urgency"
                    className={`${baseInput} ${okRing}`}
                    value={form.urgency}
                    onChange={(e) => setField("urgency", e.target.value as any)}
                  >
                    <option value="asap">ASAP</option>
                    <option value="this_week">This week</option>
                    <option value="flexible">Flexible</option>
                  </select>
                </div>
                <div>
                  <label className={label} htmlFor="preferred_delivery">
                    Preferred delivery date
                  </label>
                  <input
                    id="preferred_delivery"
                    type="date"
                    className={`${baseInput} ${okRing}`}
                    value={form.preferred_delivery}
                    onChange={(e) => setField("preferred_delivery", e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Extras */}
            <div className={grid2}>
              <div>
                <label className={label} htmlFor="use_case">
                  Use case
                </label>
                <input
                  id="use_case"
                  className={`${baseInput} ${okRing}`}
                  placeholder="vehicles, machinery, generators…"
                  value={form.use_case}
                  onChange={(e) => setField("use_case", e.target.value)}
                />
              </div>
              <div>
                <label className={label} htmlFor="access_notes">
                  Access notes
                </label>
                <input
                  id="access_notes"
                  className={`${baseInput} ${okRing}`}
                  placeholder="e.g., gate code 1234, height limit 3.5m"
                  value={form.access_notes}
                  onChange={(e) => setField("access_notes", e.target.value)}
                />
              </div>
              <div className="md:col-span-2">
                <label className={label} htmlFor="notes">
                  Notes
                </label>
                <textarea
                  id="notes"
                  rows={3}
                  className={`${baseInput} ${okRing}`}
                  placeholder="Anything else we should know?"
                  value={form.notes}
                  onChange={(e) => setField("notes", e.target.value)}
                />
              </div>
            </div>

            <label className="mt-4 flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="accent-yellow-500"
                checked={form.marketing_opt_in}
                onChange={(e) => setField("marketing_opt_in", e.target.checked)}
              />
              I’d like occasional updates from FuelFlow.
            </label>

            <div className="mt-5 space-y-4">
              {/* hCaptcha */}
              <div style={{ zIndex: 5, position: "relative" }}>
                <HCaptcha
                  key={isMobile ? "compact" : "normal"}
                  sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY || ""}
                  size={isMobile ? "compact" : "normal"}
                  theme="dark"
                  onVerify={(token) => {
                    setCaptchaError(null);
                    setCaptchaToken(token);
                  }}
                  onExpire={() => setCaptchaToken("")}
                  onClose={() => setCaptchaToken("")}
                  onError={(e) =>
                    setCaptchaError(typeof e === "string" ? e : "Captcha error")
                  }
                />
              </div>
              {captchaError && (
                <p className="text-sm text-red-300">
                  {captchaError} Please refresh and try again.
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-yellow-500 py-3 font-semibold text-[#041F3E]
                         hover:bg-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-300
                         disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Submitting..." : "Submit request"}
              </button>

              <p className="text-xs text-white/70 text-center">
                Indicative only. Prices move with the market and are confirmed on order
                acceptance. Service subject to credit checks, site survey and safety
                compliance. Protected by hCaptcha.
              </p>
            </div>
          </form>
        )}
      </main>

      {/* About modal */}
      <Modal open={showAbout} onClose={() => setShowAbout(false)} title="Who we are">
        <div className="space-y-3 text-white/90">
          <p>
            FuelFlow helps businesses and residential customers reduce their ongoing
            fuel cost with live pricing, simple ordering and reliable delivery
            partners.
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>We optimise operations with automation so savings can be passed to you.</li>
            <li>We’re sustainability-minded (tree planting for new accounts).</li>
            <li>UK-based support, transparent terms and safety-first installation partners.</li>
          </ul>
          <a
            href="https://fuelflow.co.uk/fuel-tank-options"
            target="_blank"
            rel="noreferrer"
            className="inline-block mt-2 text-yellow-300 hover:underline"
          >
            Learn more about tank options →
          </a>
          <p className="text-xs text-white/60 mt-4">
            Notes: supply subject to credit checks, site surveys and statutory
            compliance. Minimum volume commitments may apply to free-rental models.
            This overview is not an offer; terms provided on account setup.
          </p>
        </div>
      </Modal>

      {/* Calculator modal (GBP, no VAT mention) */}
      <Modal open={showCalc} onClose={() => setShowCalc(false)} title="Savings calculator">
        <div className={grid2}>
          <div>
            <label className={label}>Monthly consumption (L)</label>
            <input
              type="number"
              min={0}
              className={`${baseInput} ${okRing}`}
              value={consumption}
              onChange={(e) => setConsumption(Number(e.target.value))}
            />
          </div>
          <div>
            <label className={label}>Market price (£/L)</label>
            <input
              type="number"
              step="0.01"
              min={0}
              className={`${baseInput} ${okRing}`}
              value={marketPrice}
              onChange={(e) => setMarketPrice(Number(e.target.value))}
            />
          </div>
          <div>
            <label className={label}>FuelFlow price (£/L)</label>
            <input
              type="number"
              step="0.01"
              min={0}
              className={`${baseInput} ${okRing}`}
              value={ourPrice}
              onChange={(e) => setOurPrice(Number(e.target.value))}
            />
          </div>
          <div>
            <label className={label}>Model</label>
            <select
              className={`${baseInput} ${okRing}`}
              value={option}
              onChange={(e) => setOption(e.target.value as "rent" | "buy")}
            >
              <option value="rent">Rent tank (minimum volume applies)</option>
              <option value="buy">Buy tank</option>
            </select>
          </div>

          {option === "buy" && (
            <div className="md:col-span-2">
              <label className={label}>Tank cost (one-off)</label>
              <input
                type="number"
                min={0}
                className={`${baseInput} ${okRing}`}
                value={tankPrice}
                onChange={(e) => setTankPrice(Number(e.target.value))}
              />
            </div>
          )}
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-lg bg-white/[0.06] border border-white/10 p-4">
            <div className="text-xs text-white/60 mb-1">Saving / litre</div>
            <div className="text-lg font-semibold">{fmtGBP(savingsPerLitre)}</div>
          </div>
          <div className="rounded-lg bg-white/[0.06] border border-white/10 p-4">
            <div className="text-xs text-white/60 mb-1">Monthly saving</div>
            <div className="text-lg font-semibold">{fmtGBP(monthlySaving)}</div>
          </div>
          <div className="rounded-lg bg-white/[0.06] border border-white/10 p-4">
            <div className="text-xs text-white/60 mb-1">Annual saving</div>
            <div className="text-lg font-semibold">{fmtGBP(annualSaving)}</div>
          </div>
        </div>

        {option === "buy" && (
          <div className="mt-4 rounded-lg bg-white/[0.06] border border-white/10 p-4">
            <div className="text-sm text-white/85">
              Estimated payback:{" "}
              <strong>
                {isFinite(paybackMonths) ? `${paybackMonths.toFixed(1)} months` : "—"}
              </strong>
              {isFinite(paybackMonths) && <> ({(paybackMonths / 12).toFixed(1)} years)</>}
            </div>
          </div>
        )}

        <p className="mt-5 text-xs text-white/70">
          Calculations are indicative only and may exclude delivery/installation.
          Pricing is dynamic and confirmed at order. Any free-rental model requires
          minimum volumes, credit approval and adherence to service terms.
        </p>

        <div className="mt-5 flex justify-end">
          <button
            onClick={() => setShowCalc(false)}
            className="rounded-lg bg-white/10 px-4 py-2 hover:bg-white/15"
          >
            Close
          </button>
        </div>
      </Modal>
    </div>
  );
}

