// src/pages/quote.tsx
// src/pages/quote.tsx
import { useState } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";

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

// ── Brand + business constants (tweak as needed)
const LOGO_SRC = "/logo-email.png";     // make sure this file exists in /public
const BRAND_NAVY = "#041F3E";
const BRAND_NAVY_2 = "#0E2E57";
const CONTAINER_CAPEX = 12000;          // Buy option up-front cost (£)
const MIN_RENT_VOLUME_LPM = 15000;      // Min litres/month for free-rental model

export default function QuotePage() {
  const [form, setForm] = useState<FormState>(initialState);
  const [captchaToken, setCaptchaToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // UI state for the two modals
  const [showAbout, setShowAbout] = useState(false);
  const [showCalc, setShowCalc] = useState(false);

  // ROI calculator state
  const [consumption, setConsumption] = useState<number>(20000); // litres/month
  const [marketPrice, setMarketPrice] = useState<number>(1.49);  // £/L
  const [ourPrice, setOurPrice] = useState<number>(1.42);        // £/L
  const [option, setOption] = useState<"rent" | "buy">("rent");

  const label = "block text-sm font-medium mb-1";
  const input =
    "w-full p-3 rounded-xl border border-white/10 bg-white/5 text-white placeholder-white/40 " +
    "focus:outline-none focus:ring focus:ring-yellow-500/40 focus:border-yellow-400/50";
  const grid = "grid grid-cols-1 md:grid-cols-2 gap-5";

  // Simple ROI calcs
  const priceDelta = Math.max(0, marketPrice - ourPrice);
  const monthlySavings = priceDelta * consumption;
  const annualSavings = monthlySavings * 12;
  const paybackMonths =
    option === "buy" ? (monthlySavings > 0 ? Math.ceil(CONTAINER_CAPEX / monthlySavings) : Infinity) : 0;
  const meetsRentThreshold = consumption >= MIN_RENT_VOLUME_LPM;
  const breakEvenDeltaFor12M = CONTAINER_CAPEX / (consumption * 12 || 1); // £/L needed for 12-month payback

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!form.customer_name || !form.email || !form.phone || !form.postcode || !form.quantity_litres) {
      setMessage({ type: "error", text: "Please complete all required fields." });
      return;
    }
    if (!captchaToken) {
      setMessage({ type: "error", text: "Please complete the captcha." });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, quantity_litres: Number(form.quantity_litres), captchaToken }),
      });

      const raw = await res.text();
      let data: any = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { data = { error: raw || "Non-JSON response" }; }

      if (!res.ok) {
        const msg =
          data?.error ||
          (res.status === 405
            ? "POST /api/quote not found (405). Ensure src/pages/api/quote.ts exists."
            : `Request failed (${res.status})`);
        throw new Error(msg);
      }

      const emailed = !!data?.emailSent;
      setMessage({
        type: "success",
        text: emailed
          ? "Thanks! Your enquiry has been logged. We’ve emailed you a confirmation."
          : "Thanks! Your enquiry has been logged. (Note: the confirmation email could not be sent.)",
      });

      setForm(initialState);
      setCaptchaToken("");
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Submission failed." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen text-white relative overflow-hidden">
      {/* ───────── BACKGROUND */}
      <div
        className="absolute inset-0 -z-30"
        style={{
          background: `
            radial-gradient(1200px 600px at 75% -10%, rgba(14,46,87,0.75), transparent 60%),
            radial-gradient(800px 400px at -15% 25%, rgba(14,46,87,0.6), transparent 55%),
            linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_NAVY_2} 60%, ${BRAND_NAVY} 100%)
          `,
        }}
      />
      <div
        className="absolute inset-0 -z-20 opacity-15"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.12) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      <div
        className="absolute -z-10 pointer-events-none"
        style={{
          top: "8vh",
          left: "50%",
          transform: "translateX(-50%)",
          width: "min(70vw, 900px)",
          height: "min(70vw, 900px)",
          backgroundImage: `url(${LOGO_SRC})`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          backgroundSize: "contain",
          opacity: 0.06,
          filter: "saturate(0.9)",
        }}
        aria-hidden
      />

      {/* ───────── HEADER */}
      <div className="mx-auto max-w-5xl px-4 pt-10 pb-4">
        <div className="flex items-center gap-4 justify-center">
          <img src={LOGO_SRC} alt="FuelFlow" width={136} height={34} className="h-9 w-auto object-contain drop-shadow-sm" />
          <h1 className="text-3xl md:text-4xl font-extrabold leading-tight">
            <span className="bg-gradient-to-r from-yellow-400 via-yellow-300 to-orange-400 bg-clip-text text-transparent">
              Request a Fuel Quote
            </span>
          </h1>
        </div>
        <p className="mt-3 text-center text-white/85">
          For non-registered customers. Registered users can order at live prices in the dashboard.
        </p>
      </div>

      {/* ───────── VALUE CARDS (NEW) */}
      <section className="mx-auto max-w-5xl px-4 mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Why FuelFlow */}
        <button
          onClick={() => setShowAbout(true)}
          className="group text-left rounded-2xl p-5 border border-white/10 bg-white/6 backdrop-blur-md hover:bg-white/10 transition
                     shadow-xl focus:outline-none focus:ring-2 focus:ring-yellow-400/40"
        >
          <div className="flex items-center gap-3">
            <div className="shrink-0 h-10 w-10 rounded-xl bg-yellow-500/20 grid place-items-center">
              {/* fuel pump icon */}
              <svg width="22" height="22" viewBox="0 0 24 24" className="text-yellow-400">
                <path fill="currentColor" d="M4 4h9v16H4zM16 7h2l2 2v7a2 2 0 1 1-4 0v-9zM6 2h5v2H6z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold">Why FuelFlow</h3>
              <p className="text-white/80 text-sm">
                Reduce your fuel run-rate with on-site tanks, smart automation and sustainability built-in.
              </p>
            </div>
          </div>
        </button>

        {/* ROI Calculator */}
        <button
          onClick={() => setShowCalc(true)}
          className="group text-left rounded-2xl p-5 border border-white/10 bg-white/6 backdrop-blur-md hover:bg-white/10 transition
                     shadow-xl focus:outline-none focus:ring-2 focus:ring-yellow-400/40"
        >
          <div className="flex items-center gap-3">
            <div className="shrink-0 h-10 w-10 rounded-xl bg-yellow-500/20 grid place-items-center">
              {/* calculator icon */}
              <svg width="22" height="22" viewBox="0 0 24 24" className="text-yellow-400">
                <path fill="currentColor" d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2m0 4v4h10V6H7Zm0 6v6h10v-6H7Z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold">ROI Calculator</h3>
              <p className="text-white/80 text-sm">
                Compare today’s market price with our price. See monthly savings & payback for rent vs buy.
              </p>
            </div>
          </div>
        </button>
      </section>

      {/* ───────── FORM */}
      <main className="mx-auto max-w-5xl px-4 pb-14 pt-4">
        <div className="relative">
          <div className="absolute inset-0 -z-10 blur-3xl rounded-[28px] bg-yellow-500/10" />
          <form
            onSubmit={onSubmit}
            className="bg-white/6 backdrop-blur-md border border-white/12 rounded-[22px] shadow-2xl p-6 md:p-8 space-y-7"
          >
            {/* Contact */}
            <section>
              <h2 className="text-lg font-semibold mb-3">Contact</h2>
              <div className={grid}>
                <div>
                  <label className={label}>Full name *</label>
                  <input className={input} value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} placeholder="Jane Smith" />
                </div>
                <div>
                  <label className={label}>Email *</label>
                  <input type="email" className={input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@company.com" />
                </div>
                <div>
                  <label className={label}>Phone *</label>
                  <input className={input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+44 7..." />
                </div>
                <div>
                  <label className={label}>Customer type *</label>
                  <select className={input} value={form.customer_type} onChange={(e) => setForm({ ...form, customer_type: e.target.value as any })}>
                    <option value="residential">Residential</option>
                    <option value="business">Business</option>
                  </select>
                </div>
                {form.customer_type === "business" && (
                  <div className="md:col-span-2">
                    <label className={label}>Company name</label>
                    <input className={input} value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} placeholder="FuelFlow Ltd" />
                  </div>
                )}
              </div>
            </section>

            {/* Location */}
            <section>
              <h2 className="text-lg font-semibold mb-3">Location</h2>
              <div className={grid}>
                <div>
                  <label className={label}>Postcode *</label>
                  <input className={input} value={form.postcode} onChange={(e) => setForm({ ...form, postcode: e.target.value.toUpperCase() })} placeholder="SW1A 1AA" />
                </div>
                <div>
                  <label className={label}>City/Town</label>
                  <input className={input} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="London" />
                </div>
              </div>
            </section>

            {/* Request */}
            <section>
              <h2 className="text-lg font-semibold mb-3">Request</h2>
              <div className={grid}>
                <div>
                  <label className={label}>Fuel *</label>
                  <select className={input} value={form.fuel} onChange={(e) => setForm({ ...form, fuel: e.target.value as any })}>
                    <option value="diesel">Diesel</option>
                    <option value="petrol">Petrol</option>
                  </select>
                </div>
                <div>
                  <label className={label}>Quantity (litres) *</label>
                  <input type="number" min={1} step="1" className={input} value={form.quantity_litres} onChange={(e) => setForm({ ...form, quantity_litres: e.target.value })} placeholder="1000" />
                </div>
                <div>
                  <label className={label}>Urgency</label>
                  <select className={input} value={form.urgency} onChange={(e) => setForm({ ...form, urgency: e.target.value as any })}>
                    <option value="asap">ASAP</option>
                    <option value="this_week">This week</option>
                    <option value="flexible">Flexible</option>
                  </select>
                </div>
                <div>
                  <label className={label}>Preferred delivery date</label>
                  <input type="date" className={input} value={form.preferred_delivery} onChange={(e) => setForm({ ...form, preferred_delivery: e.target.value })} />
                </div>
              </div>
            </section>

            {/* Extras */}
            <section>
              <div className={grid}>
                <div>
                  <label className={label}>Use case</label>
                  <input className={input} placeholder="vehicles, machinery, generators…" value={form.use_case} onChange={(e) => setForm({ ...form, use_case: e.target.value })} />
                </div>
                <div>
                  <label className={label}>Access notes</label>
                  <input className={input} placeholder="e.g., gate code 1234, height limit 3.5m" value={form.access_notes} onChange={(e) => setForm({ ...form, access_notes: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <label className={label}>Notes</label>
                  <textarea rows={3} className={input} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Anything else we should know?" />
                </div>
              </div>
            </section>

            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" className="accent-yellow-500" checked={form.marketing_opt_in} onChange={(e) => setForm({ ...form, marketing_opt_in: e.target.checked })} />
              I’d like occasional updates from FuelFlow.
            </label>

            <div className="space-y-4">
              <HCaptcha
                sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY || ""}
                onVerify={setCaptchaToken}
                onExpire={() => setCaptchaToken("")}
                onClose={() => setCaptchaToken("")}
              />
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-yellow-500 text-[#041F3E] py-3 rounded-2xl font-semibold hover:bg-yellow-400 active:bg-yellow-300
                           focus:outline-none focus:ring-2 focus:ring-yellow-300 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? "Submitting..." : "Submit request"}
              </button>

              {message && (
                <p className={`text-center ${message.type === "success" ? "text-green-400" : "text-red-300"}`}>
                  {message.text}
                </p>
              )}

              <p className="text-xs text-white/70 text-center">
                Indicative only. Prices move with the market and are confirmed on order acceptance. Calculations exclude VAT.
                Service subject to credit checks, site survey and safety compliance. See terms for full details. Protected by hCaptcha.
              </p>
            </div>
          </form>
        </div>
      </main>

      {/* ───────── ABOUT MODAL */}
      {showAbout && (
        <Modal onClose={() => setShowAbout(false)} title="Why FuelFlow">
          <div className="space-y-4 text-white/90">
            <p className="text-white">
              We help organisations reduce their fuel run-rate with on-site tanks, optimised deliveries and automation. Fewer
              call-outs, lower logistics overheads, and better control.
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <span className="font-semibold">Sustainability:</span> for every purchase we sponsor tree-planting to help balance
                emissions over the tank lifecycle (via a trusted partner). This is a contribution, not a carbon-neutral guarantee.
              </li>
              <li>
                <span className="font-semibold">Automation:</span> meter readings, level alerts & scheduling reduce admin and
                operating cost—the savings can be passed through to you.
              </li>
              <li>
                <span className="font-semibold">On-site storage:</span> bulk buying + fewer deliveries usually beats pump prices,
                especially for steady consumption.
              </li>
            </ul>
            <a
              href="https://fuelflow.co.uk/fuel-tank-options"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-yellow-500 text-[#041F3E] font-semibold hover:bg-yellow-400"
            >
              Explore tank options
              <svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="m14 3l7 7l-1.4 1.4l-4.6-4.6V21h-2V6.8l-4.6 4.6L7 10z"/></svg>
            </a>
            <p className="text-xs text-white/70">
              Note: site survey, base, electrical works and permitting may be required. Customer remains responsible for safe tank
              siting, access for deliveries, and compliance with local environmental regulations.
            </p>
          </div>
        </Modal>
      )}

      {/* ───────── CALCULATOR MODAL */}
      {showCalc && (
        <Modal onClose={() => setShowCalc(false)} title="ROI Calculator">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={label}>Monthly consumption (L)</label>
              <input
                type="number"
                className={input}
                value={consumption}
                min={0}
                onChange={(e) => setConsumption(Number(e.target.value))}
              />
            </div>
            <div>
              <label className={label}>Market price (€/£ per litre)</label>
              <input
                type="number"
                step="0.001"
                className={input}
                value={marketPrice}
                min={0}
                onChange={(e) => setMarketPrice(Number(e.target.value))}
              />
            </div>
            <div>
              <label className={label}>FuelFlow price (€/£ per litre)</label>
              <input
                type="number"
                step="0.001"
                className={input}
                value={ourPrice}
                min={0}
                onChange={(e) => setOurPrice(Number(e.target.value))}
              />
            </div>
            <div>
              <label className={label}>Container option</label>
              <select className={input} value={option} onChange={(e) => setOption(e.target.value as "rent" | "buy")}>
                <option value="rent">Rent (no capex; min volume applies)</option>
                <option value="buy">Buy (capex)</option>
              </select>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
            <Stat title="Monthly savings" value={fmtCurrency(monthlySavings)} />
            <Stat title="Annual savings" value={fmtCurrency(annualSavings)} />
            {option === "buy" ? (
              <Stat title="Payback (months)" value={monthlySavings > 0 ? `${paybackMonths}` : "—"} />
            ) : (
              <Stat
                title="Min volume for free rent"
                value={`${MIN_RENT_VOLUME_LPM.toLocaleString()} L/mo`}
                note={meetsRentThreshold ? "✓ Meets threshold" : "Below threshold"}
              />
            )}
          </div>

          {option === "buy" && (
            <p className="mt-4 text-sm text-white/80">
              For a 12-month payback you’d need a price difference of approx{" "}
              <span className="font-semibold">{fmtCurrency(breakEvenDeltaFor12M)}/L</span> at your entered volume.
            </p>
          )}

          <p className="mt-5 text-xs text-white/70">
            Calculations are indicative only, exclude VAT and delivery/installation, and assume steady monthly consumption.
            Pricing is dynamic and confirmed at order. Any free-rental model requires minimum volumes, credit approval and
            adherence to service terms.
          </p>
        </Modal>
      )}
    </div>
  );
}

/* ───────────────── helpers ───────────────── */

function fmtCurrency(n: number, currency = "£") {
  if (!isFinite(n)) return "—";
  return `${currency}${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function Stat({ title, value, note }: { title: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="text-white/70 text-xs">{title}</div>
      <div className="text-xl font-semibold">{value}</div>
      {note && <div className="text-xs text-white/70 mt-1">{note}</div>}
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-3xl rounded-2xl border border-white/10 bg-[#0B264A]/95 backdrop-blur-md p-6 shadow-2xl">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h3 className="text-xl font-semibold">{title}</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 focus:ring-2 focus:ring-yellow-400/40">
            <svg width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="m18.3 5.71l-1.41-1.41L12 9.17L7.11 4.3L5.7 5.71L10.59 10.6L5.7 15.49l1.41 1.41L12 12.01l4.89 4.89l1.41-1.41l-4.89-4.89z"/></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}


