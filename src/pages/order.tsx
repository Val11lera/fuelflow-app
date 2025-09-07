// src/pages/order.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

/* ---------------- Types ---------------- */

type TankOption = "buy" | "rent";
type Fuel = "diesel" | "petrol";

type ContractRow = {
  id: string;
  email: string | null;
  status: "draft" | "signed" | "approved" | "cancelled";
  tank_option: "buy" | "rent";
  created_at: string;
};

type TermsRow = { id: string; email: string; accepted_at: string; version: string };

/* --------------- Supabase --------------- */

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

const STORAGE_KEY = "order:form:v2";
const termsVersion = "v1.1";

/* =======================================================
   Page
   ======================================================= */

export default function OrderPage() {
  const qp = useSearchParams();

  // price tiles (illustrative; server-side uses live price)
  const unitPricePetrol = 2.27;
  const unitPriceDiesel = 2.44;

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

  // prerequisites
  const [acceptedTerms, setAcceptedTerms] = useState(false);
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

  // “active” contract flags for UI
  const [hasBuySignedOrApproved, setHasBuySignedOrApproved] = useState(false);
  const [hasRentApproved, setHasRentApproved] = useState(false);

  // checkout
  const [startingCheckout, setStartingCheckout] = useState(false);

  /* --------------- Persist form --------------- */

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
    const acceptedParam = qp.get("accepted");
    const emailParam = qp.get("email");
    if (emailParam && !email) setEmail(emailParam);
    if (acceptedParam === "1" && emailParam) {
      localStorage.setItem(`terms:${termsVersion}:${emailParam.toLowerCase()}`, "1");
    }
  }, [qp, email]);

  // Verify acceptance (local then DB)
  useEffect(() => {
    if (!email) return;
    void checkTerms(email);
  }, [email]);

  async function checkTerms(e: string) {
    setCheckingTerms(true);
    try {
      const key = `terms:${termsVersion}:${e.toLowerCase()}`;
      const cached = localStorage.getItem(key);
      if (cached === "1") {
        setAcceptedTerms(true);
        return;
      }
      if (!supabase) return;

      const { data } = await supabase
        .from("terms_acceptances")
        .select("id,email,accepted_at,version")
        .eq("email", e.toLowerCase())
        .eq("version", termsVersion)
        .order("accepted_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        setAcceptedTerms(true);
        localStorage.setItem(key, "1");
      } else {
        setAcceptedTerms(false);
      }
    } finally {
      setCheckingTerms(false);
    }
  }

  function openTerms() {
    const ret = `/terms?return=/order${email ? `&email=${encodeURIComponent(email)}` : ""}`;
    window.location.href = ret;
  }

  /* --------------- Contract status --------------- */

  useEffect(() => {
    if (!supabase || !email) {
      setHasBuySignedOrApproved(false);
      setHasRentApproved(false);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("id,tank_option,status,email,created_at")
        .eq("email", email.toLowerCase())
        .not("status", "eq", "cancelled"); // ignore cancelled

      if (error) {
        console.warn("contracts check error:", error.message);
        setHasBuySignedOrApproved(false);
        setHasRentApproved(false);
        return;
      }

      const rows = (data ?? []) as ContractRow[];
      const buyOK = rows.some(
        (r) => r.tank_option === "buy" && (r.status === "signed" || r.status === "approved")
      );
      const rentOK = rows.some((r) => r.tank_option === "rent" && r.status === "approved");

      setHasBuySignedOrApproved(buyOK);
      setHasRentApproved(rentOK);
    })();
  }, [email, showContract, contractSavedId]);

  const hasEligibleContract = hasBuySignedOrApproved || hasRentApproved;

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
    setShowContract(true);
  }

  async function signAndSaveContract() {
    if (!supabase) return;

    if (!fullName.trim()) {
      alert("Please enter your full name in the form before signing.");
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
          contract_type: tankOption, // if you keep this column
          customer_name: fullName,
          email: email ? email.toLowerCase() : null,
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
          // Key rule: RENT needs APPROVAL first; BUY can order when signed
          status: tankOption === "rent" ? "signed" : "signed",
        })
        .select("id")
        .single();

      if (error) throw error;
      setContractSavedId(data?.id ?? null);
      setShowContract(false);
    } catch (e: any) {
      alert(e?.message || "Failed to save contract.");
    } finally {
      setSavingContract(false);
    }
  }

  /* --------------- Stripe checkout --------------- */

  const canPay =
    acceptedTerms &&
    hasEligibleContract &&
    email &&
    fullName &&
    address1 &&
    postcode &&
    city &&
    deliveryDate &&
    Number.isFinite(litres) &&
    litres > 0;

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

        {/* Prerequisites */}
        <section className={`${card} mb-6`}>
          <h3 className="text-lg font-semibold mb-2">Requirements</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Terms */}
            <div className="rounded-xl bg-white/5 border border-white/10 p-4">
              <div className="flex items-center justify-between">
                <div className="font-medium">Terms &amp; Conditions</div>
                <span
                  className={`${pill} ${
                    acceptedTerms ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"
                  }`}
                >
                  {acceptedTerms ? "accepted" : "missing"}
                </span>
              </div>
              <p className="text-sm text-white/70 mt-2">
                You must read and accept the latest Terms before ordering.
              </p>
              <div className="mt-3">
                <button onClick={openTerms} className={`${button} ${buttonGhost}`}>
                  {acceptedTerms ? "Review Terms" : "Read & accept Terms"}
                </button>
                {checkingTerms && <span className="ml-3 text-white/60 text-sm">Checking…</span>}
              </div>
            </div>

            {/* Contract */}
            <div className="rounded-xl bg-white/5 border border-white/10 p-4">
              <div className="flex items-center justify-between">
                <div className="font-medium">Contract</div>
                <span
                  className={`${pill} ${
                    hasEligibleContract ? "bg-green-500/20 text-green-300" : "bg-yellow-500/20 text-yellow-300"
                  }`}
                >
                  {hasEligibleContract ? "ready" : "required"}
                </span>
              </div>
              <p className="text-sm text-white/70 mt-2">
                Buy: signed contract is enough. Rent: requires admin approval after signing.
              </p>
              <div className="mt-3 flex gap-2">
                <button className={`${button} ${buttonGhost}`} onClick={() => openRoiWith("buy")}>
                  ROI (Buy)
                </button>
                <button className={`${button} ${buttonGhost}`} onClick={() => openRoiWith("rent")}>
                  ROI (Rent)
                </button>
                <button className={`${button} ${buttonPrimary}`} onClick={() => openContractWith("buy")}>
                  Start Buy
                </button>
                <button className={`${button} ${buttonPrimary}`} onClick={() => openContractWith("rent")}>
                  Start Rent
                </button>
              </div>
              {(hasBuySignedOrApproved || hasRentApproved) && (
                <p className="mt-2 text-xs text-white/60">
                  Status: {hasBuySignedOrApproved ? "Buy ✓" : ""} {hasRentApproved ? "Rent ✓ (approved)" : ""}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* price tiles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Tile title="Petrol (95)" value={`${GBP(unitPricePetrol)}`} suffix="/ litre" />
          <Tile title="Diesel" value={`${GBP(unitPriceDiesel)}`} suffix="/ litre" />
          <Tile title="Estimated Total" value={GBP(estTotal)} />
        </div>

        {/* order form (locked until prerequisites are satisfied) */}
        <section className={`${card} relative`}>
          {!acceptedTerms || !hasEligibleContract ? (
            <div className="absolute inset-0 z-10 rounded-2xl bg-black/60 grid place-items-center text-center px-6">
              <div>
                <div className="text-yellow-300 font-semibold mb-1">Complete the requirements first</div>
                <p className="text-white/80 text-sm">
                  {acceptedTerms ? "" : "• Accept the Terms. "}
                  {!hasEligibleContract ? "• Sign (and if renting, get approval for) a contract." : ""}
                </p>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-100">
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

            <div className="md:col-span-2 mt-3">
              <button
                className={`${button} ${buttonPrimary} w-full md:w-auto`}
                disabled={!canPay || startingCheckout}
                onClick={startCheckout}
              >
                {startingCheckout ? "Starting checkout…" : "Pay with Stripe"}
              </button>
              {!canPay && (
                <span className="ml-3 text-white/60 text-sm">
                  Complete requirements and form fields to enable payment.
                </span>
              )}
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
                <b>Rental contracts</b> require admin approval (credit checks, site survey). You’ll be
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

