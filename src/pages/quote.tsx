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

// ── Brand config
const LOGO_SRC = "/logo-email.png"; // place logo in /public/logo-email.png
const BRAND_NAVY = "#041F3E";
const BRAND_NAVY_2 = "#0E2E57";

export default function QuotePage() {
  const [form, setForm] = useState<FormState>(initialState);
  const [captchaToken, setCaptchaToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const label = "block text-sm font-medium mb-1";
  const input =
    "w-full p-2 rounded-lg border border-white/15 bg-white/5 text-white placeholder-white/40 " +
    "focus:outline-none focus:ring focus:ring-yellow-500/40 focus:border-yellow-400/60";
  const grid = "grid grid-cols-1 md:grid-cols-2 gap-4";

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
        const msg = data?.error || (res.status === 405 ? "POST /api/quote not found (405). Ensure src/pages/api/quote.ts exists." : `Request failed (${res.status})`);
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
    <div className="min-h-screen text-white relative">
      {/* BACKGROUND (brand gradients + subtle dotted overlay) */}
      <div
        className="absolute inset-0 -z-20"
        style={{
          background: `
            radial-gradient(1200px 600px at 70% -10%, rgba(14,46,87,0.85), transparent 60%),
            radial-gradient(800px 400px at -10% 30%, rgba(14,46,87,0.7), transparent 55%),
            linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_NAVY_2} 60%, ${BRAND_NAVY} 100%)
          `,
        }}
      />
      <div
        className="absolute inset-0 opacity-15 pointer-events-none -z-10"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.12) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
          backgroundPosition: "0 0",
        }}
      />

      {/* HEADER (logo + title only) */}
      <div className="mx-auto max-w-6xl px-4 pt-6 pb-2">
        <div className="flex items-center gap-4">
          <img
            src={LOGO_SRC}
            alt="FuelFlow"
            width={140}
            height={35}
            className="h-9 w-auto object-contain"
          />
          <h1 className="text-3xl md:text-4xl font-extrabold leading-tight">
            <span className="bg-gradient-to-r from-yellow-400 via-yellow-300 to-orange-400 bg-clip-text text-transparent">
              Request a Fuel Quote
            </span>
          </h1>
        </div>
        <p className="mt-3 text-white/80">
          For non-registered customers. Registered users can order at live prices in the dashboard.
        </p>
      </div>

      {/* FORM CARD */}
      <main className="mx-auto max-w-6xl px-4 pb-12">
        <div className="relative">
          <div className="absolute inset-0 blur-2xl rounded-3xl bg-yellow-500/10 -z-10" />
          <form
            onSubmit={onSubmit}
            className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl shadow-2xl p-6 md:p-8 space-y-6"
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
                className="w-full bg-yellow-500 text-[#041F3E] py-3 rounded-2xl font-semibold
                           hover:bg-yellow-400 active:bg-yellow-300 focus:outline-none focus:ring-2 focus:ring-yellow-300
                           disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? "Submitting..." : "Submit request"}
              </button>

              {message && (
                <p className={`text-center ${message.type === "success" ? "text-green-400" : "text-red-300"}`}>
                  {message.text}
                </p>
              )}

              <p className="text-xs text-white/70 text-center">Protected by hCaptcha.</p>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}


