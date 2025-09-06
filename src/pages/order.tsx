// src/pages/order.tsx
// src/pages/order.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

/* ---------------- Types ---------------- */

type TankOption = "none" | "buy" | "rent";
type Fuel = "diesel" | "petrol";

type ContractRow = {
  id: string;
  email: string | null;
  status: "draft" | "signed" | "approved" | "cancelled";
  tank_option: "buy" | "rent";
  created_at: string;
};

type TermsRow = { id: string; email: string; accepted_at: string; version: string };

/* --------------- Supabase (browser) --------------- */

const supabase =
  typeof window !== "undefined"
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || "",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
      )
    : (null as any);

/* ---------------- UI tokens ---------------- */

const card =
  "rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-5 py-4 shadow transition";
const cardSelected = "ring-2 ring-yellow-400 border-yellow-400 bg-white/10";
const pill = "inline-flex items-center text-xs font-medium px-2 py-1 rounded-full";
const button =
  "rounded-2xl px-4 py-2 font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed";
const buttonPrimary = "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400 active:bg-yellow-300";
const buttonGhost = "bg-white/10 hover:bg-white/15 text-white border border-white/10";
const input =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none focus:ring focus:ring-yellow-500/30";
const label = "block text-sm font-medium text-white/80 mb-1";

/* ---------------- Helpers ---------------- */

function GBP(n: number) {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

const STORAGE_KEY = "order:form:v1";
const termsVersion = "v1.1";

/* =======================================================
   Page
   ======================================================= */

export default function OrderPage() {
  const qp = useSearchParams();

  // tiles (illustrative; your Stripe/API uses live price)
  const unitPricePetrol = 2.27; // for display tiles only
  const unitPriceDiesel = 2.44; // for display tiles only

  // form state
  const [fuel, setFuel] = useState<Fuel>("diesel");
  const [litres, setLitres] = useState<number>(1000);
  const [deliveryDate, setDeliveryDate] = useState("");

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [postcode, setPostcode] = useState("");
  const [city, setCity] = useState("");

  // terms
  const [accepted, setAccepted] = useState(false);
  const [checkingTerms, setCheckingTerms] = useState(false);

  // contract state
  const [tankOption, setTankOption] = useState<TankOption>("buy");
  const [showROI, setShowROI] = useState(false);
  const [showContract, setShowContract] = useState(false);
  const [signatureName, setSignatureName] = useState("");
  const [savingContract, setSavingContract] = useState(false);
  const [contractSavedId, setContractSavedId] = useState<string | null>(null);

  // ROI inputs
  const [tankSizeL, setTankSizeL] = useState<number>(5000);
  const [monthlyConsumptionL, setMonthlyConsumptionL] = useState<number>(10000);
  const [marketPrice, setMarketPrice] = useState<number>(1.35);
  const [cheaperBy, setCheaperBy] = useState<number>(0.09);

  // “active contract” flags (signed or approved)
  const [activeBuy, setActiveBuy] = useState<boolean>(false);
  const [activeRent, setActiveRent] = useState<boolean>(false);

  // checkout
  const [startingCheckout, setStartingCheckout] = useState(false);

  /* --------------- Persist form (so returning from /terms doesn’t clear) --------------- */

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const v = JSON.parse(raw);
        if (v.fuel) setFuel(v.fuel);
        if (Number.isFinite(v.litres)) setLitres(v.litres);
        if (v.deliveryDate) setDeliveryDate(v.deliveryDate);
        if (v.email) setEmail(v.email);
        if (v.fullName) setFullName(v.fullName);
        if (v.address1) setAddress1(v.address1);
        if (v.address2) setAddress2(v.address2);
        if (v.postcode) setPostcode(v.postcode);
        if (v.city) setCity(v.city);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload = {
      fuel,
      litres,
      deliveryDate,
      email,
      fullName,
      address1,
      address2,
      postcode,
      city,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {}
  }, [fuel, litres, deliveryDate, email, fullName, address1, address2, postcode, city]);

  /* --------------- Accept terms on return from /terms --------------- */

  useEffect(() => {
    // read /terms?return=/order&email=... -> /order?accepted=1&email=...
    const acceptedParam = qp.get("accepted");
    const emailParam = qp.get("email");
    if (emailParam && !email) setEmail(emailParam);
    if (acceptedParam === "1" && emailParam) {
      // set local flag so future loads don’t need network
      localStorage.setItem(`terms:${termsVersion}:${emailParam}`, "1");
    }
  }, [qp, email]);

  // Whenever email changes, verify acceptance (local then DB)
  useEffect(() => {
    if (!email) return;
    void checkTerms(email);
  }, [email]);

  async function checkTerms(e: string) {
    setCheckingTerms(true);
    try {
      const cached = localStorage.getItem(`terms:${termsVersion}:${e}`);
      if (cached === "1") {
        setAccepted(true);
        return;
      }
      if (!supabase) return;

      const { data, error } = await supabase
        .from<TermsRow>("terms_acceptances")
        .select("id,email,accepted_at,version")
        .eq("email", e)
        .eq("version", termsVersion)
        .order("accepted_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        setAccepted(true);
        localStorage.setItem(`terms:${termsVersion}:${e}`, "1");
      }
    } finally {
      setCheckingTerms(false);
    }
  }

  function openTerms() {
    const ret = `/terms?return=/order${email ? `&email=${encodeURIComponent(email)}` : ""}`;
    window.location.href = ret;
  }

  /* --------------- Detect already active contracts --------------- */

  useEffect(() => {
    if (!supabase || !email) {
      setActiveBuy(false);
      setActiveRent(false);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from<ContractRow>("contracts")
        .select("id,tank_option,status,email,created_at")
        .eq("email", email.toLowerCase())
        .in("status", ["signed", "approved"] as ContractRow["status"][]);

      if (error) {
        // If RLS prevents this select, we’ll just not block the UI
        console.warn("contracts check error:", error.message);
        setActiveBuy(false);
        setActiveRent(false);
        return;
      }

      setActiveBuy(Boolean(data?.some((r: ContractRow) => r.tank_option === "buy")));
      setActiveRent(Boolean(data?.some((r: ContractRow) => r.tank_option === "rent")));
    })();
  }, [email, showContract, contractSavedId]);

  /* --------------- ROI metrics --------------- */

  const fuelflowPrice = useMemo(
    () => Math.max(0, (marketPrice || 0) - (cheaperBy || 0)),
    [marketPrice, cheaperBy]
  );
  const estMonthlySavings = useMemo(
    () => Math.max(0, (monthlyConsumptionL || 0) * (cheaperBy || 0)),
    [monthlyConsumptionL, cheaperBy]
  );
  const capexRequired = useMemo(() => (tankOption === "buy" ? 12000 : 0), [tankOption]);

  const unitPrice = fuel === "diesel" ? unitPriceDiesel : unitPricePetrol;
  const estTotal = useMemo(
    () => (Number.isFinite(litres) ? litres * unitPrice : 0),
    [litres, unitPrice]
  );

  /* --------------- Contract modal handlers --------------- */

  function openRoiWith(type: TankOption) {
    setTankOption(type);
    setShowROI(true);
  }

  function openContractWith(type: TankOption) {
    setTankOption(type);
    if ((type === "buy" && activeBuy) || (type === "rent" && activeRent)) {
      alert("You already have an active contract for this option.");
      return;
    }
    setShowContract(true);
  }

  async function signAndSaveContract() {
    if (!supabase) return;

    if (!fullName.trim()) {
      alert("Please enter your full name above the form before signing.");
      return;
    }
    if (!signatureName.trim()) {
      alert("Type your full legal name as signature in the contract dialog.");
      return;
    }

    try {
      setSavingContract(true);
      setContractSavedId(null);

      const { data, error } = await supabase
        .from("contracts")
        .insert({
          contract_type: tankOption === "buy" ? "buy" : "rent",
          customer_name: fullName,
          email: email || null,
          address_line1: address1 || null,
          address_line2: address2 || null,
          city: city || null,
          postcode: postcode || null,

          tank_option: tankOption,
          tank_size_l: tankSizeL || null,
          monthly_consumption_l: monthlyConsumptionL || null,
          market_price_gbp_l: marketPrice || null,
          cheaper_by_gbp_l: cheaperBy || null,
          fuelflow_price_gbp_l: fuelflowPrice || null,
          est_monthly_savings_gbp: estMonthlySavings || null,
          capex_required_gbp: capexRequired || null,
          terms_version: termsVersion,

          signature_name: signatureName,
          signed_at: new Date().toISOString(),
          status: "signed",
        })
        .select("id")
        .single();

      if (error) throw error;
      setContractSavedId(data?.id ?? null);
      setShowContract(false);
      // re-check active flags
    } catch (e: any) {
      alert(e?.message || "Failed to save contract.");
    } finally {
      setSavingContract(false);
    }
  }

  /* --------------- Stripe checkout --------------- */

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

  async function startCheckout() {
    try {
      setStartingCheckout(true);
      const res = await fetch("/api/stripe/checkout/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fuel,
          litres,
          deliveryDate,
          full_name: fullName,
          email,
          address_line1: address1,
          address_line2: address2,
          city,
          postcode,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `Checkout failed (${res.status})`);
      }
      const data = (await res.json()) as { url?: string; error?: string };
      if (!data.url) throw new Error(data.error || "No checkout URL returned");
      window.location.href = data.url;
    } catch (e: any) {
      alert(e?.message || "Failed to create order");
    } finally {
      setStartingCheckout(false);
    }
  }

  /* ---------------- Render ---------------- */

  return (
    <main className="min-h-screen bg-[#061B34] text-white pb-20">
      <div className="mx-auto w-full max-w-6xl px-4 pt-10">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <img src="/logo-email.png" alt="FuelFlow" width={116} height={28} className="opacity-90" />
          <div className="ml-2 text-2xl md:text-3xl font-bold">Place an Order</div>
          <div className="ml-auto">
            <Link href="/client-dashboard" className="text-white/70 hover:text-white">
              Back to Dashboard
            </Link>
          </div>
        </div>

        {/* Buy vs Rent selector */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* BUY */}
          <div className={`${card} ${tankOption === "buy" ? cardSelected : ""} relative`}>
            {activeBuy && (
              <div className="absolute inset-0 rounded-2xl bg-black/50 grid place-items-center z-10">
                <div className="text-sm text-yellow-300">
                  You already have an active <b>Buy</b> contract.
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Buy a Fuel Tank</h3>
              {tankOption === "buy" ? (
                <span className={`${pill} bg-yellow-500/20 text-yellow-300`}>Selected</span>
              ) : (
                <button className={`${pill} ${buttonGhost} border-none`} onClick={() => setTankOption("buy")}>
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
              <button className={`${button} ${buttonGhost}`} onClick={() => openRoiWith("buy")} disabled={activeBuy}>
                Open ROI
              </button>
              <button
                className={`${button} ${buttonPrimary}`}
                onClick={() => openContractWith("buy")}
                disabled={activeBuy}
              >
                Start Contract
              </button>
            </div>
          </div>

          {/* RENT */}
          <div className={`${card} ${tankOption === "rent" ? cardSelected : ""} relative`}>
            {activeRent && (
              <div className="absolute inset-0 rounded-2xl bg-black/50 grid place-items-center z-10">
                <div className="text-sm text-yellow-300">
                  You already have an active <b>Rent</b> contract.
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Rent a Fuel Tank</h3>
              {tankOption === "rent" ? (
                <span className={`${pill} bg-yellow-500/20 text-yellow-300`}>Selected</span>
              ) : (
                <button className={`${pill} ${buttonGhost} border-none`} onClick={() => setTankOption("rent")}>
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
              <button className={`${button} ${buttonGhost}`} onClick={() => openRoiWith("rent")} disabled={activeRent}>
                Open ROI
              </button>
              <button
                className={`${button} ${buttonPrimary}`}
                onClick={() => openContractWith("rent")}
                disabled={activeRent}
              >
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
              <select className={input} value={fuel} onChange={(e) => setFuel(e.target.value as Fuel)}>
                <option value="diesel">Diesel</option>
                <option value="petrol">Petrol</option>
              </select>
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

            {/* terms acceptance */}
            <div className="md:col-span-2 mt-2 flex items-center gap-2">
              <input id="terms" type="checkbox" className="h-4 w-4 accent-yellow-500" checked={accepted} readOnly />
              <label htmlFor="terms" className="text-sm">
                I agree to the{" "}
                <button
                  type="button"
                  onClick={openTerms}
                  className="underline text-yellow-300 hover:text-yellow-200"
                >
                  Terms &amp; Conditions
                </button>
                .
              </label>
            </div>
            {!accepted && (
              <p className="md:col-span-2 text-sm text-red-300">
                You must read and accept the Terms first. {checkingTerms ? "Checking…" : ""}
              </p>
            )}

            {/* pay */}
            <div className="md:col-span-2 mt-3">
              <button
                className={`${button} ${buttonPrimary} w-full md:w-auto`}
                disabled={payDisabled || startingCheckout}
                onClick={startCheckout}
              >
                {startingCheckout ? "Starting checkout…" : "Pay with Stripe"}
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
            <Metric title="Capex required" value={tankOption === "rent" ? "£0 (rental)" : GBP(capexRequired)} />
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
          onClose={() => {
            if (!savingContract) setShowContract(false);
          }}
          title={`Start ${tankOption === "buy" ? "Purchase" : "Rental"} Contract`}
        >
          <EstimateBanner />
          <p className="text-white/80 text-sm mb-4">
            Figures are estimates and change with market pricing.{" "}
            {tankOption === "rent" ? (
              <>
                <b>Rental contracts</b> require admin approval (credit checks, site survey). You will be
                notified once approved.
              </>
            ) : (
              <>Buy contracts don’t require admin approval.</>
            )}
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

            <div className="md:col-span-2">
              <label className={label}>Type your full legal name as signature</label>
              <input
                className={input}
                placeholder="Jane Smith"
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button className={`${button} ${buttonGhost}`} disabled={savingContract} onClick={() => setShowContract(false)}>
              Cancel
            </button>
            <button className={`${button} ${buttonPrimary}`} disabled={savingContract} onClick={signAndSaveContract}>
              {savingContract ? "Saving…" : "Sign & Save"}
            </button>
          </div>
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
          <button aria-label="Close" className="rounded-lg p-2 text-white/70 hover:bg-white/10" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

