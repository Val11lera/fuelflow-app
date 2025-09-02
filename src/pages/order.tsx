// src/pages/order.tsx
// src/pages/order.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { createClient } from "@supabase/supabase-js";

/* ----------------------------- Supabase (public) ----------------------------- */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

/* ----------------------------- Utilities ----------------------------- */
function fmtGBP(n: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
  }).format(n);
}

/* --------------------------- Page Component -------------------------- */
export default function OrderPage() {
  /* ----- Pricing (live from same views as dashboard) ----- */
  const [pricePetrol, setPricePetrol] = useState<number | null>(null);
  const [priceDiesel, setPriceDiesel] = useState<number | null>(null);
  const [priceErr, setPriceErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setPriceErr(null);
        let { data: lp, error } = await supabase
          .from("latest_prices")
          .select("fuel,total_price");
        if (error) throw error;
        if (!lp?.length) {
          const { data: dp, error: e2 } = await supabase
            .from("latest_daily_prices")
            .select("fuel,total_price");
          if (e2) throw e2;
          lp = dp as any;
        }
        (lp || []).forEach((r: any) => {
          if (r.fuel === "petrol") setPricePetrol(Number(r.total_price));
          if (r.fuel === "diesel") setPriceDiesel(Number(r.total_price));
        });
      } catch (e: any) {
        setPriceErr(e?.message || "Failed to load prices");
      }
    })();
  }, []);

  /* ----- Order basics ----- */
  const [fuel, setFuel] = useState<"diesel" | "petrol">("diesel");
  const [litres, setLitres] = useState<number>(1000);

  const liveUnit = useMemo(() => {
    const p = fuel === "diesel" ? priceDiesel : pricePetrol;
    return typeof p === "number" ? p : 0;
  }, [fuel, priceDiesel, pricePetrol]);
  const total = useMemo(() => litres * liveUnit, [litres, liveUnit]);

  /* ----- Terms & CTA state ----- */
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [starting, setStarting] = useState(false);

  /* ----- Contract option & panels ----- */
  const [tankOption, setTankOption] = useState<"none" | "rent" | "buy">("none");
  const [showROI, setShowROI] = useState<null | "rent" | "buy">(null);
  const [showContract, setShowContract] = useState<null | "rent" | "buy">(null);

  /* ----- Contract status loaded by email ----- */
  const [emailInput, setEmailInput] = useState("");
  const [buySigned, setBuySigned] = useState(false);
  const [rentSigned, setRentSigned] = useState(false);
  const [rentApproved, setRentApproved] = useState(false);

  // Pull status each time the email changes
  useEffect(() => {
    let abort = false;
    async function load(option: "buy" | "rent") {
      if (!emailInput) return { exists: false, approved: false };
      const r = await fetch(`/api/contracts/latest?option=${option}&email=${encodeURIComponent(emailInput)}`);
      const j = await r.json().catch(() => ({ exists: false, approved: false }));
      return j as { exists?: boolean; approved?: boolean };
    }
    (async () => {
      if (!emailInput) {
        if (!abort) {
          setBuySigned(false);
          setRentSigned(false);
          setRentApproved(false);
        }
        return;
      }
      const [b, r] = await Promise.all([load("buy"), load("rent")]);
      if (!abort) {
        setBuySigned(Boolean(b?.exists));
        setRentSigned(Boolean(r?.exists));
        setRentApproved(Boolean(r?.approved));
      }
    })();
    return () => { abort = true; };
  }, [emailInput]);

  /* ----- Other controlled inputs (for checkout metadata only) ----- */
  const [fullNameInput, setFullNameInput] = useState("");
  const [address1Input, setAddress1Input] = useState("");
  const [address2Input, setAddress2Input] = useState("");
  const [cityInput, setCityInput] = useState("");
  const [postcodeInput, setPostcodeInput] = useState("");

  /* ------------------------------ Actions ------------------------------ */
  async function onSubmitOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!acceptedTerms) return;
    if (tankOption === "rent" && !rentApproved) return; // RENT gate

    try {
      setStarting(true);
      const resp = await fetch("/api/stripe/checkout/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userEmail: emailInput,
          fuel,
          litres,
          deliveryDate: null,
          name: fullNameInput || null,
          address:
            (address1Input || address2Input
              ? `${address1Input} ${address2Input}`.trim()
              : null) || null,
          postcode: postcodeInput || null,
        }),
      });
      const json = await resp.json();
      if (!resp.ok || !json?.url) {
        alert(json?.error || "Failed to create order");
        return;
      }
      window.location.href = json.url as string;
    } catch (e: any) {
      alert(e?.message || "Failed to create order");
    } finally {
      setStarting(false);
    }
  }

  // Labels & disabled states for the Start Contract buttons
  const buyStartDisabled = buySigned;
  const buyStartLabel = buySigned ? "Contract signed" : "Start Contract";

  const rentStartDisabled = rentApproved || rentSigned;
  const rentStartLabel = rentApproved
    ? "Approved"
    : rentSigned
    ? "Awaiting admin approval"
    : "Start Contract";

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
            onStartContract={() => !buyStartDisabled && setShowContract("buy")}
            startLabel={buyStartLabel}
            startDisabled={buyStartDisabled}
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
            onStartContract={() => !rentStartDisabled && setShowContract("rent")}
            startLabel={rentStartLabel}
            startDisabled={rentStartDisabled}
            selected={tankOption === "rent"}
            onSelect={() => setTankOption("rent")}
          />
        </div>

        {/* PRICE CARDS */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card title="Petrol (95)" value={`${fmtGBP(pricePetrol ?? 0)} `} suffix="/ litre" />
          <Card title="Diesel" value={`${fmtGBP(priceDiesel ?? 0)} `} suffix="/ litre" />
          <Card title="Estimated Total" value={fmtGBP(total)} />
        </div>
        {priceErr && (
          <p className="mt-2 text-sm text-red-300">Price load error: {priceErr}</p>
        )}

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
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none"
              />
            </Field>

            <Field className="md:col-span-2" label="Full name">
              <input
                value={fullNameInput}
                onChange={(e) => setFullNameInput(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none"
              />
            </Field>

            <Field label="Address line 1">
              <input
                value={address1Input}
                onChange={(e) => setAddress1Input(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none"
              />
            </Field>

            <Field label="Address line 2">
              <input
                value={address2Input}
                onChange={(e) => setAddress2Input(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none"
              />
            </Field>

            <Field label="Postcode">
              <input
                value={postcodeInput}
                onChange={(e) => setPostcodeInput(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none"
              />
            </Field>

            <Field label="City">
              <input
                value={cityInput}
                onChange={(e) => setCityInput(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none"
              />
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

              {/* Helpful status line */}
              <div className="mt-2 text-sm text-white/70">
                {tankOption === "none" && <>No tank selected — you can order fuel only.</>}
                {tankOption === "buy" && (
                  <>
                    Contract required:{" "}
                    {buySigned ? (
                      <span className="font-medium text-green-400">Signed</span>
                    ) : (
                      <span className="text-red-300">Not signed</span>
                    )}
                    .
                  </>
                )}
                {tankOption === "rent" && (
                  <>
                    Contract required:{" "}
                    {rentApproved ? (
                      <span className="font-medium text-green-400">Approved</span>
                    ) : rentSigned ? (
                      <span className="font-medium text-yellow-300">Signed (awaiting admin approval)</span>
                    ) : (
                      <span className="text-red-300">Not signed</span>
                    )}{" "}
                    — payment enabled only after approval.
                  </>
                )}
              </div>
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
                disabled={
                  starting ||
                  !acceptedTerms ||
                  (tankOption === "rent" && !rentApproved)
                }
                className={`rounded-xl px-5 py-2 font-semibold ${
                  starting || !acceptedTerms || (tankOption === "rent" && !rentApproved)
                    ? "cursor-not-allowed bg-yellow-500/50 text-[#041F3E]"
                    : "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400"
                }`}
              >
                {starting ? "Starting checkout…" : "Pay with Stripe"}
              </button>
            </div>
          </div>
        </form>

        <p className="mt-3 text-center text-xs text-white/60">
          Tip: If you select <b>Rent</b>, payment is disabled until an admin approves your rental
          contract.
        </p>

        <footer className="flex items-center justify-center py-10 text-sm text-white/60">
          © {new Date().getFullYear()} FuelFlow. All rights reserved.
        </footer>
      </section>

      {/* ROI modal */}
      {showROI && <RoiModal option={showROI} onClose={() => setShowROI(null)} />}

      {/* Contract modal */}
      {showContract && (
        <ContractModal
          option={showContract}
          onClose={() => setShowContract(null)}
          onSigned={() => {
            // re-check status after saving
            setTimeout(() => setEmailInput((v) => v), 50);
          }}
          fuel={fuel}
          litres={litres}
          defaultName={fullNameInput}
          defaultEmail={emailInput}
          defaultAddr1={address1Input}
          defaultAddr2={address2Input}
          defaultCity={cityInput}
          defaultPostcode={postcodeInput}
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
  startLabel,
  startDisabled,
}: {
  type: "buy" | "rent";
  title: string;
  bullets: string[];
  onOpenROI: () => void;
  onStartContract: () => void;
  onSelect: () => void;
  selected: boolean;
  startLabel: string;
  startDisabled: boolean;
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
          disabled={startDisabled}
          className={`rounded-xl px-4 py-2 font-semibold ${
            startDisabled
              ? "cursor-not-allowed bg-white/10 text-white/60"
              : "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400"
          }`}
        >
          {startLabel}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------- ROI Modal -------------------------------- */
// (unchanged from your working version – trimmed for space)
function RoiModal({ option, onClose }: { option: "buy" | "rent"; onClose: () => void }) {
  const [market, setMarket] = useState<number>(1.35);
  const [diff, setDiff] = useState<number>(0.09);
  const [consumption, setConsumption] = useState<number>(10000);

  const fuelflow = Math.max(0, market - diff);
  const monthlySavings = Math.max(0, (market - fuelflow) * consumption);
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
            <input type="number" min={0} step="0.01" value={market} onChange={(e) => setMarket(parseFloat(e.target.value || "0"))}
              className="w-full rounded-xl border border-white/15 bg-[#0A2446] p-2 outline-none" />
          </Field>
          <Field label="FuelFlow cheaper by (GBP/L)">
            <input type="number" min={0} step="0.01" value={diff} onChange={(e) => setDiff(parseFloat(e.target.value || "0"))}
              className="w-full rounded-xl border border-white/15 bg-[#0A2446] p-2 outline-none" />
          </Field>
          <Field label="Monthly consumption (L)">
            <input type="number" min={0} step="1" value={consumption} onChange={(e) => setConsumption(parseInt(e.target.value || "0", 10))}
              className="w-full rounded-xl border border-white/15 bg-[#0A2446] p-2 outline-none" />
          </Field>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card title="FuelFlow price" value={`${fmtGBP(Math.max(0, market - diff))} `} suffix="/ litre" />
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
// (your existing working modal; unchanged except default* props, omitted here for brevity)
function ContractModal(props: any) {
  // keep your last working implementation from earlier message
  // (it posts to /api/contracts and shows the hCaptcha)
  return null as any;
}

