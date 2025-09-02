// src/pages/order.tsx
// src/pages/order.tsx
// src/pages/order.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { createClient } from "@supabase/supabase-js";

/* ============================== setup ============================== */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);
const HCAPTCHA_SITEKEY = process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY || "";

type Fuel = "diesel" | "petrol";

function fmtGBP(n: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
  }).format(n);
}

type ContractStatus = {
  exists: boolean;
  status?: "signed" | "approved" | "draft" | "cancelled" | string;
  approved?: boolean;
  id?: string;
};

/* ============================== page ============================== */
export default function OrderPage() {
  /* prices (live from latest_prices view) */
  const [petrolPrice, setPetrolPrice] = useState<number | null>(null);
  const [dieselPrice, setDieselPrice] = useState<number | null>(null);

  /* basic order form */
  const [fuel, setFuel] = useState<Fuel>("diesel");
  const [litres, setLitres] = useState<number>(1000);
  const [deliveryDate, setDeliveryDate] = useState<string>("");

  /* purchaser info */
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [city, setCity] = useState("");
  const [postcode, setPostcode] = useState("");

  /* tank option and terms */
  const [tankOption, setTankOption] = useState<"none" | "buy" | "rent">("none");
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  /* contract status (per option) */
  const [buyStatus, setBuyStatus] = useState<ContractStatus>({ exists: false });
  const [rentStatus, setRentStatus] = useState<ContractStatus>({ exists: false });

  /* UI: modals */
  const [showROI, setShowROI] = useState<null | "rent" | "buy">(null);
  const [showContract, setShowContract] = useState<null | "rent" | "buy">(null);

  /* UI: checkout */
  const [startingCheckout, setStartingCheckout] = useState(false);

  /* derived values */
  const unitPrice = useMemo(() => {
    if (fuel === "diesel") return dieselPrice ?? 0;
    return petrolPrice ?? 0;
  }, [fuel, petrolPrice, dieselPrice]);

  const estimatedTotal = useMemo(() => litres * unitPrice, [litres, unitPrice]);

  const needsContract = tankOption !== "none";
  const canPay =
    acceptedTerms &&
    (!needsContract ||
      (tankOption === "buy" && buyStatus.exists) ||
      (tankOption === "rent" && rentStatus.approved === true));

  /* ----------------------- load prices & status ----------------------- */
  useEffect(() => {
    (async () => {
      try {
        // 1) load user (for contract status check)
        const { data: auth } = await supabase.auth.getUser();
        const jwt = (await supabase.auth.getSession()).data.session?.access_token;

        // 2) prices – both pages use the same source
        const prices = await fetch("/api/prices").then((r) => r.json());
        for (const row of prices as Array<{ fuel: string; total_price: number }>) {
          if (row.fuel === "petrol") setPetrolPrice(Number(row.total_price));
          if (row.fuel === "diesel") setDieselPrice(Number(row.total_price));
        }

        // 3) contract status (if logged in)
        if (auth?.user && jwt) {
          // buy
          const buyRes = await fetch(`/api/contracts/latest?option=buy`, {
            headers: { Authorization: `Bearer ${jwt}` },
          });
          const buyJson = buyRes.ok ? await buyRes.json() : { exists: false };
          setBuyStatus(buyJson);

          // rent
          const rentRes = await fetch(`/api/contracts/latest?option=rent`, {
            headers: { Authorization: `Bearer ${jwt}` },
          });
          const rentJson = rentRes.ok ? await rentRes.json() : { exists: false };
          setRentStatus(rentJson);
        }
      } catch (e) {
        // ignore – UI will show £0.00 if price not loaded
      }
    })();
  }, []);

  /* --------------------------- start checkout --------------------------- */
  async function startCheckout(e: React.FormEvent) {
    e.preventDefault();
    if (!canPay) return;

    setStartingCheckout(true);
    try {
      const resp = await fetch("/api/stripe/checkout/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fuel,
          litres,
          deliveryDate: deliveryDate || null,
          full_name: fullName,
          email,
          address_line1: address1,
          address_line2: address2,
          city,
          postcode,
        }),
      });

      if (resp.ok) {
        const data = await resp.json(); // our API always returns JSON
        if (data?.url) {
          window.location.href = data.url;
          return;
        }
        alert("Stripe URL missing in response.");
      } else {
        const text = await resp.text(); // avoid JSON parse error on non-JSON bodies
        alert(text || `Checkout failed (HTTP ${resp.status})`);
      }
    } catch (err: any) {
      alert(err?.message || "Checkout failed");
    } finally {
      setStartingCheckout(false);
    }
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
            selected={tankOption === "buy"}
            onSelect={() => setTankOption("buy")}
            onOpenROI={() => setShowROI("buy")}
            onStartContract={() => setShowContract("buy")}
            statusBadge={
              buyStatus.exists ? (
                <span className="text-green-400 text-sm">Contract signed</span>
              ) : null
            }
          />

          <TankPanel
            type="rent"
            title="Rent a Fuel Tank"
            bullets={[
              "Flexible rental plans (short & long term).",
              "Maintenance and support included.",
              "Ideal for temp sites and events.",
            ]}
            selected={tankOption === "rent"}
            onSelect={() => setTankOption("rent")}
            onOpenROI={() => setShowROI("rent")}
            onStartContract={() => setShowContract("rent")}
            statusBadge={
              rentStatus.approved
                ? <span className="text-green-400 text-sm">Approved</span>
                : rentStatus.exists
                ? <span className="text-yellow-300 text-sm">Awaiting admin approval</span>
                : null
            }
          />
        </div>

        {/* PRICE CARDS */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card title="Petrol (95)" value={`${fmtGBP(petrolPrice ?? 0)} `} suffix="/ litre" />
          <Card title="Diesel" value={`${fmtGBP(dieselPrice ?? 0)} `} suffix="/ litre" />
          <Card title="Estimated Total" value={fmtGBP(estimatedTotal)} />
        </div>

        {/* ORDER FORM */}
        <form onSubmit={startCheckout} className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Fuel">
              <select
                value={fuel}
                onChange={(e) => setFuel(e.target.value as Fuel)}
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
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none"
              />
            </Field>

            <Field label="Your email (receipt)">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none"
              />
            </Field>

            <Field className="md:col-span-2" label="Full name">
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none"
              />
            </Field>

            <Field label="Address line 1">
              <input
                value={address1}
                onChange={(e) => setAddress1(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none"
              />
            </Field>

            <Field label="Address line 2">
              <input
                value={address2}
                onChange={(e) => setAddress2(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none"
              />
            </Field>

            <Field label="Postcode">
              <input
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none"
              />
            </Field>

            <Field label="City">
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
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

              {needsContract && (
                <p className="mt-2 text-sm text-white/70">
                  Contract required:{" "}
                  {tankOption === "buy" ? (
                    buyStatus.exists ? (
                      <span className="text-green-400 font-medium">Signed</span>
                    ) : (
                      <span className="text-red-300">Not yet signed</span>
                    )
                  ) : rentStatus.approved ? (
                    <span className="text-green-400 font-medium">Approved</span>
                  ) : rentStatus.exists ? (
                    <span className="text-yellow-300">Signed (awaiting approval)</span>
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
                disabled={!canPay || startingCheckout}
                className={`rounded-xl px-5 py-2 font-semibold ${
                  !canPay || startingCheckout
                    ? "cursor-not-allowed bg-yellow-500/50 text-[#041F3E]"
                    : "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400"
                }`}
              >
                {startingCheckout ? "Starting checkout…" : "Pay with Stripe"}
              </button>
            </div>
          </div>

          {/* small helper text */}
          {tankOption === "rent" && !rentStatus.approved && (
            <p className="mt-2 text-xs text-white/60">
              Tip: If you select <b>Rent</b>, payment is disabled until an admin approves your rental contract.
            </p>
          )}
        </form>

        <footer className="flex items-center justify-center py-10 text-sm text-white/60">
          © {new Date().getFullYear()} FuelFlow. All rights reserved.
        </footer>
      </section>

      {/* ROI modal (very light) */}
      {showROI && <RoiModal option={showROI} onClose={() => setShowROI(null)} />}

      {/* Contract modal (short “buy/rent” signer) */}
      {showContract && (
        <ContractModal
          option={showContract}
          onClose={() => setShowContract(null)}
          onSigned={() => {
            if (showContract === "buy") setBuyStatus({ exists: true, status: "signed" });
            if (showContract === "rent") setRentStatus({ exists: true, status: "signed", approved: false });
          }}
        />
      )}
    </main>
  );
}

/* ============================ sub-components ============================ */
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

function TankPanel(props: {
  type: "buy" | "rent";
  title: string;
  bullets: string[];
  selected: boolean;
  onSelect: () => void;
  onOpenROI: () => void;
  onStartContract: () => void;
  statusBadge?: React.ReactNode;
}) {
  const { type, title, bullets, selected, onSelect, onOpenROI, onStartContract, statusBadge } = props;
  return (
    <div className={`rounded-2xl border p-6 ${selected ? "border-yellow-400 bg-white/5" : "border-white/10 bg-white/5"}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-semibold">{title}</h3>
        <div className="flex items-center gap-3">
          {statusBadge}
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

/* ROI – tiny helper (optional) */
function RoiModal({ option, onClose }: { option: "buy" | "rent"; onClose: () => void }) {
  const [market, setMarket] = useState<number>(1.35);
  const [diff, setDiff] = useState<number>(0.09);
  const [consumption, setConsumption] = useState<number>(10000);

  const fuelflow = Math.max(0, market - diff);
  const monthlySavings = Math.max(0, (market - fuelflow) * consumption);
  const paybackMonths = option === "buy" ? (monthlySavings > 0 ? Math.ceil(12000 / monthlySavings) : 0) : 0;

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
            <Card title="Est. payback" value={monthlySavings > 0 ? `${paybackMonths} months` : "—"} />
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

/* Contract modal – short signer for BUY or RENT */
function ContractModal({
  option, onClose, onSigned,
}: {
  option: "buy" | "rent";
  onClose: () => void;
  onSigned: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [signature, setSignature] = useState("");
  const [accept, setAccept] = useState(false);
  const [token, setToken] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function submit() {
    setMsg(null);
    if (!fullName || !email || !signature || !accept) {
      setMsg({ type: "err", text: "Please complete name, email, signature & accept the terms." });
      return;
    }
    if (!token) {
      setMsg({ type: "err", text: "Please complete the captcha." });
      return;
    }

    setBusy(true);
    try {
      const resp = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          email,
          option,
          signature_name: signature,
          terms_version: "v1",
          hcaptchaToken: token,
        }),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(data?.error || "Failed to save contract.");
      setMsg({ type: "ok", text: "Contract signed and saved." });
      onSigned();
      setTimeout(onClose, 900);
    } catch (e: any) {
      setMsg({ type: "err", text: e.message || "Failed to save contract." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-[101] w-[min(980px,94vw)] rounded-2xl border border-white/10 bg-[#0E2E57] shadow-2xl">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10 bg-[#0A2446]">
          <img src="/logo-email.png" alt="FuelFlow" className="h-7 w-auto" />
          <h2 className="text-lg font-semibold text-white">FuelFlow {option === "buy" ? "Purchase" : "Rental"} Contract</h2>
          <button onClick={onClose} className="ml-auto rounded-lg px-3 py-1.5 text-white/70 hover:bg-white/10">✕</button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
          <div>
            <div className="space-y-3">
              <Field label="Full name">
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full rounded-xl border border-white/15 bg-[#0A2446] p-2 outline-none" />
              </Field>
              <Field label="Email">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-white/15 bg-[#0A2446] p-2 outline-none" />
              </Field>
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
                <HCaptcha sitekey={HCAPTCHA_SITEKEY} onVerify={setToken} onExpire={() => setToken("")} onClose={() => setToken("")} />
              </div>
              {msg && <p className={msg.type === "ok" ? "text-green-400" : "text-red-300"}>{msg.text}</p>}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-white/90">Key terms (summary)</h3>
            <ul className="space-y-2 text-sm text-white/80">
              <li>• Equipment safe/compliant; partner install if needed.</li>
              <li>• Rental equipment remains our/partner property.</li>
              <li>• Use reasonable care; report incidents immediately.</li>
              <li>• Deliveries subject to availability & access.</li>
              <li>• Prices vary with market until order confirmation.</li>
              {option === "buy" ? (
                <li>• Buy is a one-off purchase (no approval step).</li>
              ) : (
                <li>• Rental requires admin approval before first payment.</li>
              )}
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 bg-[#0A2446] px-6 py-3 flex items-center justify-end gap-3">
          <button onClick={onClose} className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 hover:bg-white/10">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-xl bg-yellow-500 px-4 py-2 font-semibold text-[#041F3E] hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Saving…" : "Sign & Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
