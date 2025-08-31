// src/pages/order.tsx
// src/pages/order.tsx
// src/pages/order.tsx
// src/pages/order.tsx
// src/pages/order.tsx
// src/pages/order.tsx
import { useEffect, useMemo, useState } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";

/* ----------------------------- Utilities ----------------------------- */
function fmtGBP(n: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
  }).format(n);
}

const TERMS_LS_KEY = "ff_terms_accepted_v2";
const CONTRACT_OK_LS_KEY = "ff_contract_signed_v1";

/* --------------------------- Page Component -------------------------- */
export default function OrderPage() {
  /* ----- Order basics ----- */
  const [fuel, setFuel] = useState<"diesel" | "petrol">("diesel");
  const [litres, setLitres] = useState<number>(1000);
  const unitPetrol = 0.46;
  const unitDiesel = 0.49;
  const unitPrice = useMemo(() => (fuel === "diesel" ? unitDiesel : unitPetrol), [fuel]);
  const total = useMemo(() => litres * unitPrice, [litres, unitPrice]);

  /* ----- Terms gate for payment ----- */
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  useEffect(() => setAcceptedTerms(localStorage.getItem(TERMS_LS_KEY) === "1"), []);
  useEffect(() => {
    try {
      localStorage.setItem(TERMS_LS_KEY, acceptedTerms ? "1" : "0");
    } catch {}
  }, [acceptedTerms]);

  /* ----- Tank option & contract state ----- */
  const [tankOption, setTankOption] = useState<"none" | "rent" | "buy">("none");
  const [contractSigned, setContractSigned] = useState(false);
  useEffect(() => setContractSigned(localStorage.getItem(CONTRACT_OK_LS_KEY) === "1"), []);
  const contractNeeded = tankOption === "rent" || tankOption === "buy";

  /* ----- Modals ----- */
  const [showROI, setShowROI] = useState<null | "rent" | "buy">(null);
  const [showContract, setShowContract] = useState<null | "rent" | "buy">(null);

  function onSubmitOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!acceptedTerms) return;
    if (contractNeeded && !contractSigned) return;

    // TODO: replace with your real Stripe / API flow
    alert("Proceeding to payment…");
  }

  return (
    <main className="min-h-screen bg-[#071B33] text-white">
      {/* Top bar */}
      <div className="mx-auto flex w-full max-w-6xl items-center justify-end px-4 pt-6">
        <a href="/client-dashboard" className="text-sm text-white/80 hover:text-white">
          Back to Dashboard
        </a>
      </div>

      <section className="mx-auto w-full max-w-6xl px-4">
        <h1 className="mt-2 text-3xl font-bold">Place an Order</h1>

        {/* BUY / RENT PANELS */}
        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
          <TankPanel
            type="buy"
            title="Buy a Fuel Tank"
            bullets={[
              "One-time cost with full ownership.",
              "Variety of sizes and specifications.",
              "Best for long-term sites and high-volume usage.",
            ]}
            onOpenROI={() => setShowROI("buy")}
            onStartContract={() => setShowContract("buy")}
            selected={tankOption === "buy"}
            onSelect={() => setTankOption("buy")}
          />

          <TankPanel
            type="rent"
            title="Rent a Fuel Tank"
            bullets={[
              "Flexible rental plans (short & long term).",
              "Maintenance and support included.",
              "Ideal for temp sites and events.",
            ]}
            onOpenROI={() => setShowROI("rent")}
            onStartContract={() => setShowContract("rent")}
            selected={tankOption === "rent"}
            onSelect={() => setTankOption("rent")}
          />
        </div>

        {/* PRICE CARDS */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card title="Petrol (95)" value={`${fmtGBP(unitPetrol)} `} suffix="/ litre" />
          <Card title="Diesel" value={`${fmtGBP(unitDiesel)} `} suffix="/ litre" />
          <Card title="Estimated Total" value={fmtGBP(total)} />
        </div>

        {/* ORDER FORM */}
        <form onSubmit={onSubmitOrder} className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Fuel">
              <select
                value={fuel}
                onChange={(e) => setFuel(e.target.value as "diesel" | "petrol")}
                className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none"
              >
                <option value="diesel">Diesel</option>
                <option value="petrol">Petrol (95)</option>
              </select>
            </Field>

            <Field label="Litres">
              <input
                type="number"
                min={1}
                value={litres}
                onChange={(e) => setLitres(parseInt(e.target.value || "0", 10))}
                className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none"
              />
            </Field>

            <Field label="Delivery date">
              <input type="date" className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none" />
            </Field>

            <Field label="Your email (receipt)">
              <input type="email" className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none" />
            </Field>

            <Field className="md:col-span-2" label="Full name">
              <input className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none" />
            </Field>

            <Field label="Address line 1">
              <input className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none" />
            </Field>

            <Field label="Address line 2">
              <input className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none" />
            </Field>

            <Field label="Postcode">
              <input className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none" />
            </Field>

            <Field label="City">
              <input className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none" />
            </Field>

            <Field label="Tank option" className="md:col-span-2">
              <div className="flex flex-wrap gap-3">
                {(["none", "buy", "rent"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setTankOption(opt)}
                    className={`rounded-xl border px-4 py-2 ${
                      tankOption === opt
                        ? "border-yellow-400 bg-yellow-400/10"
                        : "border-white/15 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    {opt === "none" ? "No tank" : opt.toUpperCase()}
                  </button>
                ))}
              </div>
              {contractNeeded && (
                <p className="mt-2 text-sm text-white/70">
                  Contract required:{" "}
                  {contractSigned ? (
                    <span className="text-green-400 font-medium">Signed & saved</span>
                  ) : (
                    <span className="text-red-300">Not yet signed</span>
                  )}{" "}
                  — use the panel above to{" "}
                  <button
                    type="button"
                    className="underline underline-offset-4 hover:text-white"
                    onClick={() => setShowContract(tankOption as "rent" | "buy")}
                  >
                    start contract
                  </button>
                  .
                </p>
              )}
            </Field>
          </div>

          {/* Terms + CTA */}
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 md:items-center">
            <label className="inline-flex items-center gap-3 text-sm text-white/80">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="h-4 w-4 accent-yellow-500"
              />
              <span>
                I agree to the{" "}
                <a href="/terms" target="_blank" className="underline underline-offset-4 hover:text-white">
                  Terms &amp; Conditions
                </a>
                .
              </span>
            </label>

            <div className="flex items-center justify-end gap-3">
              <button
                type="submit"
                disabled={!acceptedTerms || (contractNeeded && !contractSigned)}
                className={`rounded-xl px-5 py-2 font-semibold ${
                  !acceptedTerms || (contractNeeded && !contractSigned)
                    ? "cursor-not-allowed bg-yellow-500/50 text-[#041F3E]"
                    : "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400"
                }`}
              >
                Pay with Stripe
              </button>
            </div>
          </div>
        </form>

        <footer className="flex items-center justify-center py-10 text-sm text-white/60">
          © {new Date().getFullYear()} FuelFlow. All rights reserved.
        </footer>
      </section>

      {/* ROI modal */}
      {showROI && (
        <RoiModal option={showROI} onClose={() => setShowROI(null)} />
      )}

      {/* Contract modal */}
      {showContract && (
        <ContractModal
          option={showContract}
          onClose={() => setShowContract(null)}
          onSigned={() => {
            setContractSigned(true);
            try {
              localStorage.setItem(CONTRACT_OK_LS_KEY, "1");
            } catch {}
          }}
          fuel={fuel}
          litres={litres}
        />
      )}
    </main>
  );
}

/* ------------------------------ Sub-components ------------------------------ */
function Card({ title, value, suffix }: { title: string; value: string; suffix?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <h3 className="text-white/80">{title}</h3>
      <p className="mt-2 text-2xl font-bold">
        {value} {suffix ? <span className="text-base font-normal text-white/70">{suffix}</span> : null}
      </p>
    </div>
  );
}

function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm text-white/80">{label}</span>
      {children}
    </label>
  );
}

function TankPanel({
  type,
  title,
  bullets,
  onOpenROI,
  onStartContract,
  onSelect,
  selected,
}: {
  type: "buy" | "rent";
  title: string;
  bullets: string[];
  onOpenROI: () => void;
  onStartContract: () => void;
  onSelect: () => void;
  selected: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-6 ${
        selected ? "border-yellow-400 bg-white/5" : "border-white/10 bg-white/5"
      }`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-semibold">{title}</h3>
        <button
          type="button"
          onClick={onSelect}
          className={`rounded-xl px-3 py-1 text-sm ${
            selected ? "bg-yellow-400 text-[#041F3E]" : "border border-white/20 bg-white/10"
          }`}
        >
          {selected ? "Selected" : "Select"}
        </button>
      </div>

      <ul className="mt-4 space-y-2 text-white/80">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2">
            <span>✔</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onOpenROI}
          className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 hover:bg-white/15"
        >
          Open ROI
        </button>
        <button
          type="button"
          onClick={onStartContract}
          className="rounded-xl bg-yellow-500 px-4 py-2 font-semibold text-[#041F3E] hover:bg-yellow-400"
        >
          Start Contract
        </button>
      </div>
    </div>
  );
}

/* ------------------------------- ROI Modal -------------------------------- */
function RoiModal({ option, onClose }: { option: "buy" | "rent"; onClose: () => void }) {
  const [market, setMarket] = useState<number>(1.35);
  const [diff, setDiff] = useState<number>(0.09); // FuelFlow cheaper by…
  const [consumption, setConsumption] = useState<number>(10000); // L / month

  const fuelflow = Math.max(0, market - diff);
  const monthlySavings = Math.max(0, (market - fuelflow) * consumption);
  // naive payback if "buy", assume £12,000 capex
  const capex = 12000;
  const paybackMonths = option === "buy" ? (monthlySavings > 0 ? Math.ceil(capex / monthlySavings) : Infinity) : 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-[101] w-[min(820px,92vw)] rounded-2xl border border-white/10 bg-[#0E2E57] p-6 shadow-2xl">
        <div className="flex items-center gap-3 pb-4">
          <img src="/logo-email.png" className="h-7 w-auto" alt="FuelFlow" />
          <h3 className="text-lg font-semibold">Savings Calculator — {option === "buy" ? "Buy" : "Rent"}</h3>
          <button onClick={onClose} className="ml-auto rounded-lg px-3 py-1.5 text-white/70 hover:bg-white/10">✕</button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Market price (GBP/L)">
            <input
              type="number"
              min={0}
              step="0.01"
              value={market}
              onChange={(e) => setMarket(parseFloat(e.target.value || "0"))}
              className="w-full rounded-xl border border-white/15 bg-[#0A2446] p-2 outline-none"
            />
          </Field>
          <Field label="FuelFlow cheaper by (GBP/L)">
            <input
              type="number"
              min={0}
              step="0.01"
              value={diff}
              onChange={(e) => setDiff(parseFloat(e.target.value || "0"))}
              className="w-full rounded-xl border border-white/15 bg-[#0A2446] p-2 outline-none"
            />
          </Field>
          <Field label="Monthly consumption (L)">
            <input
              type="number"
              min={0}
              step="1"
              value={consumption}
              onChange={(e) => setConsumption(parseInt(e.target.value || "0", 10))}
              className="w-full rounded-xl border border-white/15 bg-[#0A2446] p-2 outline-none"
            />
          </Field>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card title="FuelFlow price" value={`${fmtGBP(fuelflow)} `} suffix="/ litre" />
          <Card title="Est. monthly savings" value={fmtGBP(monthlySavings)} />
          {option === "buy" ? (
            <Card title="Est. payback" value={Number.isFinite(paybackMonths) ? `${paybackMonths} months` : "—"} />
          ) : (
            <Card title="Capex required" value="£0 (rental)" />
          )}
        </div>

        <div className="mt-5 flex items-center justify-end">
          <button onClick={onClose} className="rounded-xl bg-yellow-500 px-4 py-2 font-semibold text-[#041F3E] hover:bg-yellow-400">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Contract Modal ----------------------------- */
function ContractModal({
  option,
  onClose,
  onSigned,
  fuel,
  litres,
}: {
  option: "buy" | "rent";
  onClose: () => void;
  onSigned: () => void;
  fuel: "diesel" | "petrol";
  litres: number;
}) {
  // lightweight form for contracting
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [city, setCity] = useState("");
  const [postcode, setPostcode] = useState("");

  const [tankSize, setTankSize] = useState<number>(5000);
  const [monthlyConsumption, setMonthlyConsumption] = useState<number>(10000);

  // ROI assumptions prefill
  const [market, setMarket] = useState<number>(1.35);
  const [diff, setDiff] = useState<number>(0.09);
  const fuelflow = Math.max(0, market - diff);
  const monthlySavings = Math.max(0, (market - fuelflow) * monthlyConsumption);
  const paybackMonths = option === "buy" ? (monthlySavings > 0 ? Math.ceil(12000 / monthlySavings) : 0) : 0;

  const [signature, setSignature] = useState("");
  const [accept, setAccept] = useState(false);

  const [captchaToken, setCaptchaToken] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function submitContract() {
    setMsg(null);
    if (!fullName || !email || !signature || !accept) {
      setMsg({ type: "err", text: "Please complete name, email, signature and accept the terms." });
      return;
    }
    if (!captchaToken) {
      setMsg({ type: "err", text: "Please complete the captcha." });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          email,
          company_name: company,
          phone,
          address1,
          address2,
          city,
          postcode,

          option,
          tank_size_litres: tankSize,
          monthly_consumption_litres: monthlyConsumption,

          market_price_per_litre: market,
          fuelflow_price_per_litre: fuelflow,
          est_monthly_savings: monthlySavings,
          est_payback_months: option === "buy" ? paybackMonths : null,

          fuel,
          litres,

          terms_version: "v1",
          signature_name: signature,

          hcaptchaToken: captchaToken,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to save contract.");
      setMsg({ type: "ok", text: "Contract signed and saved." });
      onSigned();
      // close after a short moment
      setTimeout(onClose, 900);
    } catch (e: any) {
      setMsg({ type: "err", text: e.message || "Failed to save contract." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative z-[101] w-[min(980px,94vw)] max-h-[92vh] overflow-hidden rounded-2xl border border-white/10 bg-[#0E2E57] shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10 bg-[#0A2446]">
          <img src="/logo-email.png" alt="FuelFlow" className="h-7 w-auto" />
          <h2 className="text-lg font-semibold text-white">FuelFlow {option === "buy" ? "Purchase" : "Rental"} Contract</h2>
          <button onClick={onClose} className="ml-auto rounded-lg px-3 py-1.5 text-white/70 hover:bg-white/10">✕</button>
        </div>

        {/* Body (scrollable) */}
        <div className="grid max-h-[calc(92vh-140px)] grid-cols-1 gap-6 overflow-y-auto p-6 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-white/90">Your details</h3>
            <div className="space-y-3">
              <Field label="Full name">
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full rounded-xl border border-white/15 bg-[#0A2446] p-2 outline-none" />
              </Field>
              <Field label="Email">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-white/15 bg-[#0A2446] p-2 outline-none" />
              </Field>
              <Field label="Company (optional)">
                <input value={company} onChange={(e) => setCompany(e.target.value)} className="w-full rounded-xl border border-white/15 bg-[#0A2446] p-2 outline-none" />
              </Field>
              <Field label="Phone (optional)">
                <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-xl border border-white/15 bg-[#0A2446] p-2 outline-none" />
              </Field>
              <Field label="Address line 1">
                <input value={address1} onChange={(e) => setAddress1(e.target.value)} className="w-full rounded-xl border border-white/15 bg-[#0A2446] p-2 outline-none" />
              </Field>
              <Field label="Address line 2">
                <input value={address2} onChange={(e) => setAddress2(e.target.value)} className="w-full rounded-xl border border-white/15 bg-[#0A2446] p-2 outline-none" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="City">
                  <input value={city} onChange={(e) => setCity(e.target.value)} className="w-full rounded-xl border border-white/15 bg-[#0A2446] p-2 outline-none" />
                </Field>
                <Field label="Postcode">
                  <input value={postcode} onChange={(e) => setPostcode(e.target.value)} className="w-full rounded-xl border border-white/15 bg-[#0A2446] p-2 outline-none" />
                </Field>
              </div>
            </div>

            <h3 className="mt-6 mb-2 text-sm font-semibold text-white/90">
              Tank & pricing assumptions
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tank size (L)">
                <input type="number" min={0} value={tankSize} onChange={(e) => setTankSize(parseInt(e.target.value || "0", 10))} className="w-full rounded-xl border border-white/15 bg-[#0A2446] p-2 outline-none" />
              </Field>
              <Field label="Monthly consumption (L)">
                <input type="number" min={0} value={monthlyConsumption} onChange={(e) => setMonthlyConsumption(parseInt(e.target.value || "0", 10))} className="w-full rounded-xl border border-white/15 bg-[#0A2446] p-2 outline-none" />
              </Field>
              <Field label="Market price (GBP/L)">
                <input type="number" step="0.01" min={0} value={market} onChange={(e) => setMarket(parseFloat(e.target.value || "0"))} className="w-full rounded-xl border border-white/15 bg-[#0A2446] p-2 outline-none" />
              </Field>
              <Field label="FuelFlow cheaper by (GBP/L)">
                <input type="number" step="0.01" min={0} value={diff} onChange={(e) => setDiff(parseFloat(e.target.value || "0"))} className="w-full rounded-xl border border-white/15 bg-[#0A2446] p-2 outline-none" />
              </Field>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-3">
              <Card title="FuelFlow price" value={`${fmtGBP(Math.max(0, market - diff))} `} suffix="/ L" />
              <Card title="Est. monthly savings" value={fmtGBP(monthlySavings)} />
              {option === "buy" ? (
                <Card title="Est. payback" value={monthlySavings > 0 ? `${Math.ceil(12000 / monthlySavings)} months` : "—"} />
              ) : (
                <Card title="Capex required" value="£0 (rental)" />
              )}
            </div>
          </div>

          {/* Compact legal terms */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-white/90">Key terms (summary)</h3>
            <ul className="space-y-2 text-sm text-white/80">
              <li>• You confirm your site and tank are safe/compliant or will use our partner install.</li>
              <li>• Rental equipment remains our/partner property; lost/damaged items are chargeable.</li>
              <li>• You’ll use reasonable care to prevent spills/contamination; notify incidents immediately.</li>
              <li>• Deliveries subject to availability, access and force-majeure events.</li>
              <li>• Pricing varies with market until order confirmation; overdue sums may incur interest.</li>
              <li>• Liability limited to direct losses; no liability for indirect/consequential loss.</li>
              <li>• Full T&amp;Cs: <a href="/terms" target="_blank" className="underline">fuelflow.co.uk/terms</a></li>
            </ul>

            <div className="mt-6 space-y-3">
              <Field label="Type your full legal name as signature">
                <input value={signature} onChange={(e) => setSignature(e.target.value)} className="w-full rounded-xl border border-white/15 bg-[#0A2446] p-2 outline-none" />
              </Field>
              <label className="inline-flex items-center gap-3 text-sm text-white/80">
                <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="h-4 w-4 accent-yellow-500" />
                <span>
                  I confirm I am authorised and I accept FuelFlow’s{" "}
                  <a href="/terms" target="_blank" className="underline">Terms &amp; Conditions</a>.
                </span>
              </label>

              <div className="pt-1">
                <HCaptcha
                  sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY || ""}
                  onVerify={setCaptchaToken}
                  onExpire={() => setCaptchaToken("")}
                  onClose={() => setCaptchaToken("")}
                />
              </div>

              {msg && (
                <p className={msg.type === "ok" ? "text-green-400" : "text-red-300"}>{msg.text}</p>
              )}

              <div className="flex items-center justify-end gap-3">
                <button onClick={onClose} type="button" className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 hover:bg-white/10">
                  Cancel
                </button>
                <button
                  onClick={submitContract}
                  type="button"
                  disabled={submitting}
                  className="rounded-xl bg-yellow-500 px-4 py-2 font-semibold text-[#041F3E] hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Saving…" : "Sign & Save"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer bar */}
        <div className="border-t border-white/10 bg-[#0A2446] px-6 py-3 text-right text-xs text-white/60">
          Signed contracts are stored in your account. You can view them from the client dashboard.
        </div>
      </div>
    </div>
  );
}






