// src/pages/order.tsx
// src/pages/order.tsx
// src/pages/order.tsx
// src/pages/order.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

type TankOption = "none" | "buy" | "rent";
type Fuel = "diesel" | "petrol";

const supabase =
  typeof window !== "undefined"
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || "",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
      )
    : (null as any);

const card =
  "rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-5 py-4 shadow transition";
const cardSelected = "ring-2 ring-yellow-400 border-yellow-400 bg-white/10";
const pill = "inline-flex items-center text-xs font-medium px-2 py-1 rounded-full";
const button =
  "rounded-2xl px-4 py-2 font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed";
const buttonPrimary =
  "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400 active:bg-yellow-300";
const buttonGhost = "bg-white/10 hover:bg-white/15 text-white border border-white/10";
const input =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none focus:ring focus:ring-yellow-500/30";
const label = "block text-sm font-medium text-white/80 mb-1";

function GBP(n: number) {
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export default function OrderPage() {
  const router = useRouter();
  const qp = useSearchParams();

  // pricing tiles (top)
  const [fuel, setFuel] = useState<Fuel>("diesel");
  const [litres, setLitres] = useState<number>(1000);
  const unitPricePetrol = 0.46; // tiles only (illustrative)
  const unitPriceDiesel = 0.49; // tiles only (illustrative)

  // contact & delivery
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [postcode, setPostcode] = useState("");
  const [city, setCity] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");

  // terms acceptance
  const termsVersion = "v1.1";
  const [accepted, setAccepted] = useState(false);
  const [acceptanceId, setAcceptanceId] = useState<string | null>(null);
  const [checkingTerms, setCheckingTerms] = useState(false);

  // tank choice + UI panels
  const [tankOption, setTankOption] = useState<TankOption>("rent");
  const [showROI, setShowROI] = useState(false);
  const [showContract, setShowContract] = useState(false);
  const [savingContract, setSavingContract] = useState(false);
  const [contractSaved, setContractSaved] = useState<string | null>(null);

  // ROI defaults
  const [tankSizeL, setTankSizeL] = useState<number>(5000);
  const [monthlyConsumptionL, setMonthlyConsumptionL] = useState<number>(10000);
  const [marketPrice, setMarketPrice] = useState<number>(1.35);
  const [cheaperBy, setCheaperBy] = useState<number>(0.09);

  // computed ROI
  const fuelflowPrice = useMemo(
    () => Math.max(0, (marketPrice || 0) - (cheaperBy || 0)),
    [marketPrice, cheaperBy]
  );
  const estMonthlySavings = useMemo(
    () => Math.max(0, (monthlyConsumptionL || 0) * (cheaperBy || 0)),
    [monthlyConsumptionL, cheaperBy]
  );
  const capexRequired = useMemo(() => (tankOption === "buy" ? 12000 : 0), [tankOption]);

  // detect redirect from /terms
  useEffect(() => {
    const acceptedParam = qp.get("accepted");
    const emailParam = qp.get("email");
    if (acceptedParam === "1" && emailParam) {
      localStorage.setItem(`terms:${termsVersion}:${emailParam}`, "1");
      if (emailParam === email) {
        void checkAccepted(emailParam);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // re-check when email changes
  useEffect(() => {
    if (email) void checkAccepted(email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  async function checkAccepted(e: string) {
    setCheckingTerms(true);
    try {
      // quick local cache
      const cached = localStorage.getItem(`terms:${termsVersion}:${e}`);
      if (cached === "1") setAccepted(true);

      if (!supabase) return;

      const { data, error } = await supabase
        .from("terms_acceptances")
        .select("id, email, accepted_at, version")
        .eq("email", e)
        .eq("version", termsVersion)
        .order("accepted_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn("terms check error", error.message);
        return;
      }

      if (data) {
        setAccepted(true);
        setAcceptanceId(data.id);
        localStorage.setItem(`terms:${termsVersion}:${e}`, "1");
      } else {
        setAccepted(false);
        setAcceptanceId(null);
        localStorage.removeItem(`terms:${termsVersion}:${e}`);
      }
    } finally {
      setCheckingTerms(false);
    }
  }

  const unitPrice = fuel === "diesel" ? unitPriceDiesel : unitPricePetrol;
  const estTotal = useMemo(
    () => (Number.isFinite(litres) ? litres * unitPrice : 0),
    [litres, unitPrice]
  );

  function openTerms() {
    const url = `/terms?return=/order&email=${encodeURIComponent(email || "")}`;
    window.open(url, "_self");
  }

  function openRoiWith(type: TankOption) {
    setTankOption(type);
    setShowROI(true);
  }

  function openContractWith(type: TankOption) {
    setTankOption(type);
    setShowContract(true);
  }

  async function saveContract() {
    setSavingContract(true);
    setContractSaved(null);
    try {
      if (!supabase) return;

      // 🔧 HOT-FIX: do not send `contract_type` until PostgREST schema is refreshed
      const { data, error } = await supabase
        .from("contracts")
        .insert({
          // contract_type: tankOption, // ← re-enable later after schema refresh
          status: "draft",

          customer_name: fullName || null,
          email: email || null,
          address_line1: address1 || null,
          address_line2: address2 || null,
          city: city || null,
          postcode: postcode || null,

          tank_option: tankOption, // keep this — determines buy vs rent

          tank_size_l: tankSizeL || null,
          monthly_consumption_l: monthlyConsumptionL || null,
          market_price_gbp_l: marketPrice || null,
          cheaper_by_gbp_l: cheaperBy || null,
          fuelflow_price_gbp_l: fuelflowPrice || null,
          est_monthly_savings_gbp: estMonthlySavings || null,
          capex_required_gbp: capexRequired || null,

          terms_version: termsVersion,
          acceptance_id: acceptanceId || null,
        })
        .select("id")
        .single();

      if (error) throw error;
      setContractSaved(data.id);
    } catch (e: any) {
      alert(e?.message || "Failed to save contract.");
    } finally {
      setSavingContract(false);
    }
  }

  const payDisabled =
    !email ||
    !fullName ||
    !address1 ||
    !postcode ||
    !city ||
    !deliveryDate ||
    !Number.isFinite(litres) ||
    litres <= 0 ||
    !accepted;

  return (
    <main className="min-h-screen bg-[#061B34] text-white pb-20">
      <div className="mx-auto w-full max-w-6xl px-4 pt-10">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <img
            src="/logo-email.png"
            alt="FuelFlow"
            width={116}
            height={28}
            className="opacity-90"
          />
          <div className="ml-2 text-2xl md:text-3xl font-bold">Place an Order</div>
          <div className="ml-auto">
            <Link href="/client-dashboard" className="text-white/70 hover:text-white">
              Back to Dashboard
            </Link>
          </div>
        </div>

        {/* Buy vs Rent selector + actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* BUY */}
          <div className={`${card} ${tankOption === "buy" ? cardSelected : ""}`}>
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Buy a Fuel Tank</h3>
              {tankOption === "buy" ? (
                <span className={`${pill} bg-yellow-500/20 text-yellow-300`}>Selected</span>
              ) : (
                <button
                  className={`${pill} ${buttonGhost} border-none`}
                  onClick={() => setTankOption("buy")}
                >
                  Select
                </button>
              )}
            </div>
            <ul className="mt-3 space-y-2 text-white/70 text-sm">
              <li>✔ One-time cost with full ownership.</li>
              <li>✔ Variety of sizes and specifications.</li>
              <li>✔ Ideal for long-term and high-volume usage.</li>
            </ul>
            <div className="mt-4 flex gap-3">
              <button className={`${button} ${buttonGhost}`} onClick={() => openRoiWith("buy")}>
                Open ROI
              </button>
              <button className={`${button} ${buttonPrimary}`} onClick={() => openContractWith("buy")}>
                Start Contract
              </button>
            </div>
          </div>

          {/* RENT */}
          <div className={`${card} ${tankOption === "rent" ? cardSelected : ""}`}>
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Rent a Fuel Tank</h3>
              {tankOption === "rent" ? (
                <span className={`${pill} bg-yellow-500/20 text-yellow-300`}>Selected</span>
              ) : (
                <button
                  className={`${pill} ${buttonGhost} border-none`}
                  onClick={() => setTankOption("rent")}
                >
                  Select
                </button>
              )}
            </div>
            <ul className="mt-3 space-y-2 text-white/70 text-sm">
              <li>✔ Flexible rental plans (short & long term).</li>
              <li>✔ Maintenance & support included.</li>
              <li>✔ Ideal for temp sites & events.</li>
            </ul>
            <div className="mt-4 flex gap-3">
              <button className={`${button} ${buttonGhost}`} onClick={() => openRoiWith("rent")}>
                Open ROI
              </button>
              <button className={`${button} ${buttonPrimary}`} onClick={() => openContractWith("rent")}>
                Start Contract
              </button>
            </div>
          </div>
        </div>

        {/* price tiles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Tile title="Petrol (95)" value={`${GBP(unitPricePetrol)}`} suffix="/ litre" />
          <Tile title="Diesel" value={`${GBP(unitPriceDiesel)}`} suffix="/ litre" />
          <Tile title="Estimated Total" value={GBP(estTotal)} />
        </div>

        {/* order form */}
        <section className={`${card} px-5 md:px-6 py-6`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={label}>Fuel</label>
              <div className="relative">
                <select className={input} value={fuel} onChange={(e) => setFuel(e.target.value as Fuel)}>
                  <option value="diesel">Diesel</option>
                  <option value="petrol">Petrol</option>
                </select>
              </div>
            </div>

            <div>
              <label className={label}>Litres</label>
              <input
                className={input}
                type="number"
                min={1}
                value={litres}
                onChange={(e) => setLitres(Number(e.target.value))}
              />
            </div>

            <div>
              <label className={label}>Delivery date</label>
              <input
                className={input}
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
              />
            </div>

            <div>
              <label className={label}>Your email (receipt)</label>
              <input
                className={input}
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="md:col-span-2">
              <label className={label}>Full name</label>
              <input className={input} value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>

            <div>
              <label className={label}>Address line 1</label>
              <input className={input} value={address1} onChange={(e) => setAddress1(e.target.value)} />
            </div>

            <div>
              <label className={label}>Address line 2</label>
              <input className={input} value={address2} onChange={(e) => setAddress2(e.target.value)} />
            </div>

            <div>
              <label className={label}>Postcode</label>
              <input className={input} value={postcode} onChange={(e) => setPostcode(e.target.value)} />
            </div>

            <div>
              <label className={label}>City</label>
              <input className={input} value={city} onChange={(e) => setCity(e.target.value)} />
            </div>

            {/* contract requirement notice */}
            <div className="md:col-span-2 text-sm text-white/70 mt-2">
              <span className="text-white/90">Contract required:</span>{" "}
              <span className="text-white/80">
                Click <b>Start Contract</b> in the panel above (buy or rent).
              </span>
              {contractSaved ? <span className="ml-2 text-green-300">Draft saved (ID: {contractSaved})</span> : null}
            </div>

            {/* terms acceptance */}
            <div className="md:col-span-2 mt-2 flex items-center gap-2">
              <input
                id="terms"
                type="checkbox"
                className="h-4 w-4 accent-yellow-500"
                checked={accepted}
                onChange={() => {}}
                disabled
                aria-describedby="termsHelp"
              />
              <label htmlFor="terms" className="text-sm">
                I agree to the{" "}
                <button type="button" onClick={openTerms} className="underline text-yellow-300 hover:text-yellow-200">
                  Terms &amp; Conditions
                </button>
                .
              </label>
            </div>
            {!accepted && (
              <p id="termsHelp" className="md:col-span-2 text-sm text-red-300">
                You must read and accept the Terms first. Click the link above. {checkingTerms ? "Checking…" : ""}
              </p>
            )}

            {/* pay */}
            <div className="md:col-span-2 mt-3">
              <button
                className={`${button} ${buttonPrimary} w-full md:w-auto`}
                disabled={payDisabled}
                onClick={() => alert("Stripe flow would start here")}
              >
                Pay with Stripe
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* ROI modal */}
      {showROI && (
        <Modal onClose={() => setShowROI(false)} title="Savings Calculator">
          <EstimateBanner />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-4">
            <div>
              <label className={label}>Tank size (L)</label>
              <input
                className={input}
                type="number"
                min={0}
                value={tankSizeL}
                onChange={(e) => setTankSizeL(Number(e.target.value))}
              />
            </div>
            <div>
              <label className={label}>Monthly consumption (L)</label>
              <input
                className={input}
                type="number"
                min={0}
                value={monthlyConsumptionL}
                onChange={(e) => setMonthlyConsumptionL(Number(e.target.value))}
              />
            </div>
            <div>
              <label className={label}>Market price (GBP/L)</label>
              <input
                className={input}
                type="number"
                min={0}
                step="0.01"
                value={marketPrice}
                onChange={(e) => setMarketPrice(Number(e.target.value))}
              />
            </div>
            <div>
              <label className={label}>FuelFlow cheaper by (GBP/L)</label>
              <input
                className={input}
                type="number"
                min={0}
                step="0.01"
                value={cheaperBy}
                onChange={(e) => setCheaperBy(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Metric title="FuelFlow price" value={`${GBP(fuelflowPrice)} / L`} />
            <Metric title="Est. monthly savings" value={GBP(estMonthlySavings)} />
            <Metric title="Capex required" value={tankOption === "rent" ? `${GBP(0)} (rental)` : GBP(capexRequired)} />
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button className={`${button} ${buttonGhost}`} onClick={() => setShowROI(false)}>
              Close
            </button>
            <button
              className={`${button} ${buttonPrimary}`}
              onClick={() => {
                setShowROI(false);
                setShowContract(true);
              }}
            >
              Continue to Contract
            </button>
          </div>
        </Modal>
      )}

      {/* Contract modal */}
      {showContract && (
        <Modal
          onClose={() => setShowContract(false)}
          title={`Start ${tankOption === "buy" ? "Buy" : "Rent"} Contract`}
        >
          <EstimateBanner />
          <p className="text-white/80 text-sm mb-4">
            Below figures are estimates and change with market pricing. For <b>rental</b> contracts, supply is{" "}
            <b>subject to verification</b> (credit checks, minimum volume, site survey). Invoices are issued regularly;
            late payment interest may apply.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Metric title="FuelFlow price" value={`${GBP(fuelflowPrice)} / L`} />
            <Metric title="Est. monthly savings" value={GBP(estMonthlySavings)} />
            <Metric title="Capex required" value={capexRequired ? GBP(capexRequired) : "£0 (rental)"} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={label}>Tank size (L)</label>
              <input
                className={input}
                type="number"
                min={0}
                value={tankSizeL}
                onChange={(e) => setTankSizeL(Number(e.target.value))}
              />
            </div>
            <div>
              <label className={label}>Monthly consumption (L)</label>
              <input
                className={input}
                type="number"
                min={0}
                value={monthlyConsumptionL}
                onChange={(e) => setMonthlyConsumptionL(Number(e.target.value))}
              />
            </div>
            <div>
              <label className={label}>Market price (GBP/L)</label>
              <input
                className={input}
                type="number"
                min={0}
                step="0.01"
                value={marketPrice}
                onChange={(e) => setMarketPrice(Number(e.target.value))}
              />
            </div>
            <div>
              <label className={label}>FuelFlow cheaper by (GBP/L)</label>
              <input
                className={input}
                type="number"
                min={0}
                step="0.01"
                value={cheaperBy}
                onChange={(e) => setCheaperBy(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button className={`${button} ${buttonGhost}`} onClick={() => setShowContract(false)}>
              Cancel
            </button>
            <button className={`${button} ${buttonPrimary}`} disabled={savingContract} onClick={saveContract}>
              {savingContract ? "Saving…" : "Save Draft Contract"}
            </button>
          </div>
          {contractSaved && (
            <p className="mt-3 text-green-300 text-sm">
              Draft saved (ID: {contractSaved}). You can proceed to payment once Terms are accepted.
            </p>
          )}
        </Modal>
      )}

      <footer className="mt-12 text-center text-white/40 text-xs">
        © {new Date().getFullYear()} FuelFlow. All rights reserved.
      </footer>
    </main>
  );
}

/* ---------------- UI helpers ---------------- */

function Tile({ title, value, suffix }: { title: string; value: string; suffix?: string }) {
  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
      <div className="text-white/70 text-sm">{title}</div>
      <div className="mt-1 text-2xl font-semibold">
        {value} {suffix && <span className="text-white/50 text-base">{suffix}</span>}
      </div>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0E2E57] p-4">
      <div className="text-white/70 text-sm">{title}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function EstimateBanner() {
  return (
    <div className="relative overflow-hidden mb-3 rounded-xl border border-white/10 bg-gradient-to-r from-yellow-500/10 via-orange-500/10 to-red-500/10 p-3 text-center">
      <span className="font-semibold text-yellow-300 tracking-wide">
        ESTIMATE ONLY — prices fluctuate daily based on market conditions
      </span>
      <div className="pointer-events-none absolute inset-0 opacity-10 [background-image:repeating-linear-gradient(45deg,transparent,transparent_8px,rgba(255,255,255,.4)_8px,rgba(255,255,255,.4)_10px)]" />
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div className="relative w-[95%] max-w-3xl rounded-2xl bg-[#0B274B] border border-white/10 p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            aria-label="Close"
            className="rounded-lg p-2 text-white/70 hover:bg-white/10"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}




