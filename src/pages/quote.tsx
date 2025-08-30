// src/pages/quote.tsx
// src/pages/quote.tsx
"use client";

import { useMemo, useState } from "react";
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
const label =
  "block text-sm font-medium mb-1 text-white/90";
const input =
  "w-full p-2 rounded-lg border border-white/15 bg-white/[0.06] text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-yellow-500/40 focus:border-transparent";
const grid2 = "grid grid-cols-1 md:grid-cols-2 gap-4";
const grid1 = "grid grid-cols-1 gap-4";

function fmtCurrency(n: number, currency = "£") {
  if (!isFinite(n)) return `${currency}0`;
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n);
  const [int, dec] = v.toFixed(2).split(".");
  return `${sign}${currency}${int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${dec}`;
}

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
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      aria-modal="true"
      role="dialog"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
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

/* ============================== Page ============================== */
export default function QuotePage() {
  const [form, setForm] = useState<FormState>(initialState);
  const [captchaToken, setCaptchaToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Savings Calculator modal
  const [showCalc, setShowCalc] = useState(false);
  const [consumption, setConsumption] = useState<number>(20000); // litres / month
  const [marketPrice, setMarketPrice] = useState<number>(1.35);  // £/L default
  const [ourPrice, setOurPrice] = useState<number>(1.26);        // £/L default (9p cheaper)
  const [option, setOption] = useState<"rent" | "buy">("rent");
  const [tankPrice, setTankPrice] = useState<number>(12000);     // buy option one-off cost

  const savingsPerLitre = useMemo(() => Math.max(marketPrice - ourPrice, 0), [marketPrice, ourPrice]);
  const monthlySaving = useMemo(() => consumption * savingsPerLitre, [consumption, savingsPerLitre]);
  const annualSaving = useMemo(() => monthlySaving * 12, [monthlySaving]);
  const paybackMonths = useMemo(() => (monthlySaving > 0 ? tankPrice / monthlySaving : Infinity), [tankPrice, monthlySaving]);

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
      {/* Background */}
      <div className="absolute inset-0 bg-[#041F3E]" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#082246]/40 via-[#041F3E]/40 to-[#041F3E]" />
      {/* faint logo watermark */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 right-[-10%] opacity-[0.05] rotate-[-10deg]"
      >
        <img
          src="/logo-email.png"
          alt=""
          className="w-[860px] max-w-none"
        />
      </div>
      {/* subtle vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.08),transparent_55%)]" />

      <main className="relative z-10 mx-auto w-full max-w-5xl px-4 py-10 md:py-14">
        {/* Header row: logo + title */}
        <div className="mb-6 flex items-center gap-3">
          <img
            src="/logo-email.png"
            alt="FuelFlow"
            className="h-9 w-auto rounded-md bg-transparent"
          />
          <h1 className="text-3xl md:text-4xl font-bold">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 via-yellow-300 to-orange-400">
              Request a Fuel Quote
            </span>
          </h1>
        </div>

        <p className="text-white/80 mb-6">
          For non-registered customers. Registered users can order at live prices in the dashboard.
        </p>

        {/* Info cards */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
            <h3 className="font-semibold text-yellow-300 mb-2">Why FuelFlow</h3>
            <ul className="list-disc list-inside text-white/85 space-y-1">
              <li>Live pricing + rapid quotes</li>
              <li>Sustainable approach — we plant trees for every new account</li>
              <li>Automation lowers our overheads so savings can be passed on</li>
              <li>Pro installation & service partners (site surveys, safety first)</li>
              <li>Clear terms, credit-checked accounts, and UK-based support</li>
            </ul>
            <a
              href="https://fuelflow.co.uk/fuel-tank-options"
              target="_blank"
              rel="noreferrer"
              className="inline-block mt-3 text-sm text-yellow-300 hover:underline"
            >
              Learn more about tank options →
            </a>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
            <h3 className="font-semibold text-yellow-300 mb-2">Savings Calculator</h3>
            <p className="text-white/85">
              Compare typical market prices with your FuelFlow rate to estimate monthly savings and payback.
            </p>
            <button
              onClick={() => setShowCalc(true)}
              className="mt-3 rounded-lg bg-yellow-500 px-4 py-2 font-semibold text-[#041F3E] hover:bg-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-300"
            >
              Open calculator
            </button>
          </div>
        </section>

        {/* Form */}
        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-white/10 bg-white/[0.06] p-6 md:p-8 shadow-2xl backdrop-blur-sm"
        >
          {/* Contact */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3 text-white">Contact</h2>
            <div className={grid2}>
              <div>
                <label className={label}>Full name *</label>
                <input
                  className={input}
                  placeholder="Jane Smith"
                  value={form.customer_name}
                  onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                />
              </div>
              <div>
                <label className={label}>Email *</label>
                <input
                  type="email"
                  className={input}
                  placeholder="name@company.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <label className={label}>Phone *</label>
                <input
                  className={input}
                  placeholder="+44 7…"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div>
                <label className={label}>Customer type *</label>
                <select
                  className={input}
                  value={form.customer_type}
                  onChange={(e) => setForm({ ...form, customer_type: e.target.value as any })}
                >
                  <option value="residential">Residential</option>
                  <option value="business">Business</option>
                </select>
              </div>
              {form.customer_type === "business" && (
                <div className="md:col-span-2">
                  <label className={label}>Company name</label>
                  <input
                    className={input}
                    value={form.company_name}
                    onChange={(e) => setForm({ ...form, company_name: e.target.value })}
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
                <label className={label}>Postcode *</label>
                <input
                  className={input}
                  placeholder="SW1A 1AA"
                  value={form.postcode}
                  onChange={(e) => setForm({ ...form, postcode: e.target.value })}
                />
              </div>
              <div>
                <label className={label}>City/Town</label>
                <input
                  className={input}
                  placeholder="London"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Request */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3 text-white">Request</h2>
            <div className={grid2}>
              <div>
                <label className={label}>Fuel *</label>
                <select
                  className={input}
                  value={form.fuel}
                  onChange={(e) => setForm({ ...form, fuel: e.target.value as any })}
                >
                  <option value="diesel">Diesel</option>
                  <option value="petrol">Petrol</option>
                </select>
              </div>
              <div>
                <label className={label}>Quantity (litres) *</label>
                <input
                  type="number"
                  min={1}
                  step="1"
                  className={input}
                  placeholder="1000"
                  value={form.quantity_litres}
                  onChange={(e) => setForm({ ...form, quantity_litres: e.target.value })}
                />
              </div>
              <div>
                <label className={label}>Urgency</label>
                <select
                  className={input}
                  value={form.urgency}
                  onChange={(e) => setForm({ ...form, urgency: e.target.value as any })}
                >
                  <option value="asap">ASAP</option>
                  <option value="this_week">This week</option>
                  <option value="flexible">Flexible</option>
                </select>
              </div>
              <div>
                <label className={label}>Preferred delivery date</label>
                <input
                  type="date"
                  className={input}
                  value={form.preferred_delivery}
                  onChange={(e) => setForm({ ...form, preferred_delivery: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Extras */}
          <div className={grid2}>
            <div>
              <label className={label}>Use case</label>
              <input
                className={input}
                placeholder="vehicles, machinery, generators…"
                value={form.use_case}
                onChange={(e) => setForm({ ...form, use_case: e.target.value })}
              />
            </div>
            <div>
              <label className={label}>Access notes</label>
              <input
                className={input}
                placeholder="e.g., gate code 1234, height limit 3.5m"
                value={form.access_notes}
                onChange={(e) => setForm({ ...form, access_notes: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <label className={label}>Notes</label>
              <textarea
                rows={3}
                className={input}
                placeholder="Anything else we should know?"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>

          <label className="mt-4 flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="accent-yellow-500"
              checked={form.marketing_opt_in}
              onChange={(e) => setForm({ ...form, marketing_opt_in: e.target.checked })}
            />
            I’d like occasional updates from FuelFlow.
          </label>

          <div className="mt-5 space-y-4">
            <HCaptcha
              sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY || ""}
              onVerify={setCaptchaToken}
              onExpire={() => setCaptchaToken("")}
              onClose={() => setCaptchaToken("")}
            />
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-yellow-500 py-3 font-semibold text-[#041F3E]
                         hover:bg-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-300
                         disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Submitting..." : "Submit request"}
            </button>
            {message && (
              <p className={`text-center ${message.type === "success" ? "text-green-400" : "text-red-300"}`}>
                {message.text}
              </p>
            )}

            {/* NOTE: VAT removed per your request */}
            <p className="text-xs text-white/70 text-center">
              Indicative only. Prices move with the market and are confirmed on order acceptance.
              Service subject to credit checks, site survey and safety compliance. See terms for full details.
              Protected by hCaptcha.
            </p>
          </div>
        </form>
      </main>

      {/* Savings calculator modal */}
      <Modal open={showCalc} onClose={() => setShowCalc(false)} title="Savings calculator">
        <div className={grid2}>
          <div>
            <label className={label}>Monthly consumption (L)</label>
            <input
              type="number"
              min={0}
              className={input}
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
              className={input}
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
              className={input}
              value={ourPrice}
              onChange={(e) => setOurPrice(Number(e.target.value))}
            />
          </div>
          <div>
            <label className={label}>Model</label>
            <select
              className={input}
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
                className={input}
                value={tankPrice}
                onChange={(e) => setTankPrice(Number(e.target.value))}
              />
            </div>
          )}
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-lg bg-white/[0.06] border border-white/10 p-4">
            <div className="text-xs text-white/60 mb-1">Saving / Litre</div>
            <div className="text-lg font-semibold">{fmtCurrency(savingsPerLitre)}</div>
          </div>
          <div className="rounded-lg bg-white/[0.06] border border-white/10 p-4">
            <div className="text-xs text-white/60 mb-1">Monthly saving</div>
            <div className="text-lg font-semibold">{fmtCurrency(monthlySaving)}</div>
          </div>
          <div className="rounded-lg bg-white/[0.06] border border-white/10 p-4">
            <div className="text-xs text-white/60 mb-1">Annual saving</div>
            <div className="text-lg font-semibold">{fmtCurrency(annualSaving)}</div>
          </div>
        </div>

        {option === "buy" && (
          <div className="mt-4 rounded-lg bg-white/[0.06] border border-white/10 p-4">
            <div className="text-sm text-white/85">
              Estimated payback:{" "}
              <strong>
                {isFinite(paybackMonths) ? `${paybackMonths.toFixed(1)} months` : "—"}
              </strong>
              {isFinite(paybackMonths) && (
                <> ({(paybackMonths / 12).toFixed(1)} years)</>
              )}
            </div>
          </div>
        )}

        <p className="mt-5 text-xs text-white/70">
          Calculations are indicative only and may exclude delivery/installation. Pricing is dynamic and
          confirmed at order. Any free-rental model requires minimum volumes, credit approval and adherence to
          service terms.
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


