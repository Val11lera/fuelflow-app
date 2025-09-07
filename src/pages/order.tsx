// src/pages/order.tsx
// src/pages/order.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

/* =========================
   Types (local, pragmatic)
   ========================= */

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

/* =========================
   Supabase (browser)
   ========================= */

const supabase =
  typeof window !== "undefined"
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || "",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
      )
    : (null as any);

/* =========================
   UI tokens
   ========================= */

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
const row = "grid grid-cols-1 md:grid-cols-2 gap-4";

/* =========================
   Helpers & constants
   ========================= */

function GBP(n: number) {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function toDateMaybe(r: any): Date | null {
  const k =
    r?.updated_at ??
    r?.price_date ??
    r?.created_at ??
    r?.ts ??
    r?.at ??
    null;
  return k ? new Date(k) : null;
}

const STORAGE_KEY = "order:form:v2";
const termsVersion = "v1.1";

/* =========================
   Page
   ========================= */

export default function OrderPage() {
  const qp = useSearchParams();

  // live prices
  const [petrolPrice, setPetrolPrice] = useState<number | null>(null);
  const [dieselPrice, setDieselPrice] = useState<number | null>(null);
  const [pricesUpdatedAt, setPricesUpdatedAt] = useState<Date | null>(null);
  const [loadingPrices, setLoadingPrices] = useState<boolean>(true);

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

  // “active contract” flags (signed or approved)
  const [activeBuy, setActiveBuy] = useState<boolean>(false);
  const [activeRent, setActiveRent] = useState<boolean>(false);

  // ROI / Contract modals
  const [showCalc, setShowCalc] = useState(false);
  const [calcOption, setCalcOption] = useState<TankOption>("buy"); // pick inside modal

  // checkout
  const [startingCheckout, setStartingCheckout] = useState(false);

  // ROI fields
  const [tankSizeL, setTankSizeL] = useState<number>(5000);
  const [monthlyConsumptionL, setMonthlyConsumptionL] = useState<number>(10000);
  const [marketPrice, setMarketPrice] = useState<number>(1.35);
  const [cheaperBy, setCheaperBy] = useState<number>(0.09);

  // Contract wizard modal
  const [showWizard, setShowWizard] = useState(false);
  const [wizardOption, setWizardOption] = useState<TankOption>("buy");
  const [savingContract, setSavingContract] = useState(false);

  // “professional” contract extras (kept client-side unless you add an `extra jsonb`)
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyNumber, setCompanyNumber] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [siteAddress1, setSiteAddress1] = useState("");
  const [siteAddress2, setSiteAddress2] = useState("");
  const [siteCity, setSiteCity] = useState("");
  const [sitePostcode, setSitePostcode] = useState("");
  const [signatureName, setSignatureName] = useState("");

  /* ---------- live prices ---------- */

  useEffect(() => {
    (async () => {
      try {
        setLoadingPrices(true);

        // try several sources; take first that returns rows
        const trySelect = async (from: string, select = "*") =>
          supabase?.from(from as any).select(select).limit(10);

        let rows: any[] | null = null;

        // 1) latest_prices (preferred)
        let res = await trySelect("latest_prices", "*");
        if (res && !res.error && res.data?.length) rows = res.data as any[];

        // 2) latest_daily_prices
        if (!rows) {
          res = await trySelect("latest_daily_prices", "*");
          if (res && !res.error && res.data?.length) rows = res.data as any[];
        }

        // 3) latest_fuel_prices_view
        if (!rows) {
          res = await trySelect("latest_fuel_prices_view", "*");
          if (res && !res.error && res.data?.length) rows = res.data as any[];
        }

        // 4) latest_prices_view
        if (!rows) {
          res = await trySelect("latest_prices_view", "*");
          if (res && !res.error && res.data?.length) rows = res.data as any[];
        }

        // 5) daily_prices (max price_date)
        if (!rows) {
          const dp = await supabase
            .from("daily_prices")
            .select("*")
            .order("price_date", { ascending: false })
            .limit(2);
          if (!dp.error && dp.data?.length) rows = dp.data as any[];
        }

        if (rows?.length) {
          let updated: Date | null = null;
          rows.forEach((r) => {
            const f = (r.fuel ?? r.product ?? "").toString().toLowerCase();
            const price = Number(r.total_price ?? r.price ?? r.latest_price ?? r.unit_price);
            const ts = toDateMaybe(r);
            if (ts && (!updated || ts > updated)) updated = ts;
            if (f === "petrol") setPetrolPrice(Number.isFinite(price) ? price : null);
            if (f === "diesel") setDieselPrice(Number.isFinite(price) ? price : null);
          });
          setPricesUpdatedAt(updated);
        }
      } finally {
        setLoadingPrices(false);
      }
    })();
  }, []);

  /* ---------- derived ---------- */

  const unitPricePetrol = petrolPrice ?? 0;
  const unitPriceDiesel = dieselPrice ?? 0;
  const unitPrice = fuel === "diesel" ? unitPriceDiesel : unitPricePetrol;

  const estTotal = useMemo(
    () => (Number.isFinite(litres) ? litres * unitPrice : 0),
    [litres, unitPrice]
  );

  const fuelflowPrice = useMemo(
    () => Math.max(0, (marketPrice || 0) - (cheaperBy || 0)),
    [marketPrice, cheaperBy]
  );
  const estMonthlySavings = useMemo(
    () => Math.max(0, (monthlyConsumptionL || 0) * (cheaperBy || 0)),
    [monthlyConsumptionL, cheaperBy]
  );
  const capexRequired = useMemo(
    () => (calcOption === "buy" || wizardOption === "buy" ? 12000 : 0),
    [calcOption, wizardOption]
  );

  /* ---------- load/save draft ---------- */

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

  /* ---------- Terms acceptance on return ---------- */

  useEffect(() => {
    const acceptedParam = qp.get("accepted");
    const emailParam = qp.get("email");
    if (emailParam && !email) setEmail(emailParam);
    if (acceptedParam === "1") {
      setAccepted(true); // accept immediately on return
      if (emailParam) {
        localStorage.setItem(`terms:${termsVersion}:${emailParam}`, "1");
      } else {
        localStorage.setItem(`terms:${termsVersion}:__last__`, "1");
      }
    }
  }, [qp, email]);

  // Verify acceptance (cache -> email‐scoped cache -> DB)
  useEffect(() => {
    if (!email) {
      const generic = localStorage.getItem(`terms:${termsVersion}:__last__`);
      if (generic === "1") setAccepted(true);
      return;
    }
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
        .from("terms_acceptances")
        .select("id,email,accepted_at,version")
        .eq("email", e.toLowerCase())
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

  /* ---------- check active contracts ---------- */

  useEffect(() => {
    if (!supabase || !email) {
      setActiveBuy(false);
      setActiveRent(false);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("id,tank_option,status,email,created_at")
        .eq("email", email.toLowerCase())
        .in("status", ["signed", "approved"]);
      if (error) {
        setActiveBuy(false);
        setActiveRent(false);
        return;
      }
      const rows = (data ?? []) as ContractRow[];
      setActiveBuy(rows.some((r) => r.tank_option === "buy"));
      setActiveRent(rows.some((r) => r.tank_option === "rent"));
    })();
  }, [email, showWizard]);

  /* ---------- checkout ---------- */

  const payDisabled =
    !email ||
    !fullName ||
    !address1 ||
    !postcode ||
    !city ||
    !deliveryDate ||
    !Number.isFinite(litres) ||
    litres <= 0 ||
    !accepted ||
    !(activeBuy || activeRent);

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

  /* ---------- save contract ---------- */

  async function signAndSaveContract(option: TankOption) {
    if (!supabase) return;

    if (!fullName.trim()) {
      alert("Please enter your full name in the order form before signing.");
      return;
    }
    if (!signatureName.trim()) {
      alert("Type your full legal name as signature.");
      return;
    }

    try {
      setSavingContract(true);

      // insert only safe columns that are already present
      const { error } = await supabase.from("contracts").insert({
        contract_type: option === "buy" ? "buy" : "rent",
        customer_name: fullName,
        email: email || null,
        address_line1: address1 || null,
        address_line2: address2 || null,
        city: city || null,
        postcode: postcode || null,

        tank_option: option,
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
        status: "signed", // rent will later be "approved" by admin
      });

      if (error) throw error;

      if (option === "buy") setActiveBuy(true);
      if (option === "rent") setActiveRent(true);
      setShowWizard(false);
      alert("Contract saved. (If it's a rent contract, admin approval is required.)");
    } catch (e: any) {
      alert(e?.message || "Failed to save contract.");
    } finally {
      setSavingContract(false);
    }
  }

  /* ---------- render ---------- */

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

        {/* Requirements */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Terms */}
          <div className={card}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Terms &amp; Conditions</h3>
              {!accepted ? (
                <span className={`${pill} bg-red-500/20 text-red-300`}>missing</span>
              ) : (
                <span className={`${pill} bg-green-500/20 text-green-300`}>ok</span>
              )}
            </div>
            <p className="mt-2 text-white/70 text-sm">
              You must read and accept the latest Terms before ordering.
            </p>
            <div className="mt-3">
              <button type="button" className={`${button} ${buttonGhost}`} onClick={openTerms}>
                Read &amp; accept Terms
              </button>
            </div>
          </div>

          {/* Contract */}
          <div className={card}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Contract</h3>
              <span className={`${pill} bg-white/10 text-white/80`}>required</span>
            </div>
            <p className="mt-2 text-white/70 text-sm">
              <b>Buy:</b> signed contract is enough. <b>Rent:</b> requires admin approval after signing.
            </p>

            {/* One clean entry point */}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className={`${button} ${buttonGhost}`}
                onClick={() => {
                  setCalcOption("buy");
                  setShowCalc(true);
                }}
              >
                ROI / Calculator
              </button>
              <button
                type="button"
                className={`${button} ${buttonPrimary}`}
                onClick={() => {
                  setWizardOption("buy");
                  setShowWizard(true);
                }}
                disabled={activeBuy}
                title={activeBuy ? "You already have an active Buy contract." : ""}
              >
                Start Contract
              </button>
              <span className="ml-2 text-sm text-white/60">
                {activeBuy ? "Buy: active" : "Buy: not signed"}
                {" · "}
                {activeRent ? "Rent: active" : "Rent: not signed"}
              </span>
            </div>
          </div>
        </section>

        {/* Price tiles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
          <Tile title="Petrol (95)" value={petrolPrice != null ? GBP(petrolPrice) : "—"} suffix="/ litre" />
          <Tile title="Diesel" value={dieselPrice != null ? GBP(dieselPrice) : "—"} suffix="/ litre" />
          <Tile title="Estimated Total" value={GBP(estTotal)} />
        </div>
        <div className="mb-6 text-xs text-white/60">
          {loadingPrices ? "Loading prices…" : pricesUpdatedAt ? `Last update: ${pricesUpdatedAt.toLocaleString()}` : "Prices timestamp unavailable."}
        </div>

        {/* Order form */}
        <section className={`${card} px-5 md:px-6 py-6`}>
          <div className={row}>
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

            {/* requirements banner */}
            {!accepted || !(activeBuy || activeRent) ? (
              <div className="md:col-span-2 mt-2 text-center text-yellow-300 text-sm bg-yellow-500/10 border border-yellow-400/30 rounded-lg p-2">
                Complete the requirements first
                <div className="text-white/70 text-xs">
                  • Accept the Terms. • Sign (and if renting, get approval for) a contract.
                </div>
              </div>
            ) : null}

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

      {/* ROI / Calculator modal */}
      {showCalc && (
        <Modal onClose={() => setShowCalc(false)} title="Savings Calculator">
          <EstimateBanner />
          <div className="mb-3">
            <label className={label}>Contract type</label>
            <div className="flex gap-2">
              <button
                className={`${button} ${calcOption === "buy" ? buttonPrimary : buttonGhost}`}
                onClick={() => setCalcOption("buy")}
              >
                Buy
              </button>
              <button
                className={`${button} ${calcOption === "rent" ? buttonPrimary : buttonGhost}`}
                onClick={() => setCalcOption("rent")}
              >
                Rent
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-4">
            <Metric title="FuelFlow price" value={`${GBP(fuelflowPrice)} / L`} />
            <Metric title="Est. monthly savings" value={GBP(estMonthlySavings)} />
            <Metric
              title="Capex required"
              value={calcOption === "rent" ? "£0 (rental)" : GBP(capexRequired)}
            />
          </div>

          <div className={row}>
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
            <button className={`${button} ${buttonGhost}`} onClick={() => setShowCalc(false)}>
              Close
            </button>
            <button
              className={`${button} ${buttonPrimary}`}
              onClick={() => {
                setShowCalc(false);
                setWizardOption(calcOption);
                setShowWizard(true);
              }}
            >
              Continue to Contract
            </button>
          </div>
        </Modal>
      )}

      {/* Contract Wizard modal */}
      {showWizard && (
        <Modal
          onClose={() => {
            if (!savingContract) setShowWizard(false);
          }}
          title={`Start ${wizardOption === "buy" ? "Purchase" : "Rental"} Contract`}
        >
          <EstimateBanner />

          <Wizard>
            {/* Step 1: Contact */}
            <Wizard.Step title="Contact">
              <div className={row}>
                <Field label="Full name">
                  <input className={input} value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </Field>
                <Field label="Phone">
                  <input className={input} value={phone} onChange={(e) => setPhone(e.target.value)} />
                </Field>
                <Field label="Email">
                  <input className={input} value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
              </div>
            </Wizard.Step>

            {/* Step 2: Business */}
            <Wizard.Step title="Business">
              <div className={row}>
                <Field label="Company name">
                  <input
                    className={input}
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </Field>
                <Field label="Company number">
                  <input
                    className={input}
                    value={companyNumber}
                    onChange={(e) => setCompanyNumber(e.target.value)}
                  />
                </Field>
                <Field label="VAT number">
                  <input className={input} value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} />
                </Field>
              </div>
            </Wizard.Step>

            {/* Step 3: Site & Tank */}
            <Wizard.Step title="Site & Tank">
              <div className={row}>
                <Field label="Site address line 1">
                  <input
                    className={input}
                    value={siteAddress1}
                    onChange={(e) => setSiteAddress1(e.target.value)}
                  />
                </Field>
                <Field label="Site address line 2">
                  <input
                    className={input}
                    value={siteAddress2}
                    onChange={(e) => setSiteAddress2(e.target.value)}
                  />
                </Field>
                <Field label="Site city">
                  <input className={input} value={siteCity} onChange={(e) => setSiteCity(e.target.value)} />
                </Field>
                <Field label="Site postcode">
                  <input
                    className={input}
                    value={sitePostcode}
                    onChange={(e) => setSitePostcode(e.target.value)}
                  />
                </Field>

                <Field label="Tank size (L)">
                  <input
                    className={input}
                    type="number"
                    min={0}
                    value={tankSizeL}
                    onChange={(e) => setTankSizeL(Number(e.target.value))}
                  />
                </Field>
                <Field label="Monthly consumption (L)">
                  <input
                    className={input}
                    type="number"
                    min={0}
                    value={monthlyConsumptionL}
                    onChange={(e) => setMonthlyConsumptionL(Number(e.target.value))}
                  />
                </Field>
                <Field label="Market price (GBP/L)">
                  <input
                    className={input}
                    type="number"
                    min={0}
                    step="0.01"
                    value={marketPrice}
                    onChange={(e) => setMarketPrice(Number(e.target.value))}
                  />
                </Field>
                <Field label="FuelFlow cheaper by (GBP/L)">
                  <input
                    className={input}
                    type="number"
                    min={0}
                    step="0.01"
                    value={cheaperBy}
                    onChange={(e) => setCheaperBy(Number(e.target.value))}
                  />
                </Field>
              </div>
            </Wizard.Step>

            {/* Step 4: Signature */}
            <Wizard.Step title="Signature">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Metric title="FuelFlow price" value={`${GBP(fuelflowPrice)} / L`} />
                <Metric title="Est. monthly savings" value={GBP(estMonthlySavings)} />
                <Metric
                  title="Capex required"
                  value={wizardOption === "rent" ? "£0 (rental)" : GBP(capexRequired)}
                />
              </div>

              <div className="mt-4">
                <label className={label}>Type your full legal name as signature</label>
                <input
                  className={input}
                  placeholder="Jane Smith"
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                />
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button className={`${button} ${buttonGhost}`} disabled={savingContract} onClick={() => setShowWizard(false)}>
                  Cancel
                </button>
                <button
                  className={`${button} ${buttonPrimary}`}
                  disabled={savingContract}
                  onClick={() => signAndSaveContract(wizardOption)}
                >
                  {savingContract ? "Saving…" : "Sign & Save"}
                </button>
              </div>
            </Wizard.Step>
          </Wizard>
        </Modal>
      )}

      <footer className="mt-12 text-center text-white/40 text-xs">
        © {new Date().getFullYear()} FuelFlow. All rights reserved.
      </footer>
    </main>
  );
}

/* =========================
   Small UI helpers
   ========================= */

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

function Field({ label: l, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={label}>{l}</label>
      {children}
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

/* =========================
   Wizard (typed, React as value)
   ========================= */

interface WizardStepProps {
  title?: string;
  children: React.ReactNode;
}

interface WizardProps {
  children: React.ReactElement<WizardStepProps> | React.ReactElement<WizardStepProps>[];
}

type WizardComponent = React.FC<WizardProps> & {
  Step: React.FC<WizardStepProps>;
};

const Wizard: WizardComponent = ({ children }) => {
  const steps = React.Children.toArray(children) as React.ReactElement<WizardStepProps>[];
  const [idx, setIdx] = useState(0);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {steps.map((el, i) => {
          const title = el.props.title ?? `Step ${i + 1}`;
          return (
            <div
              key={i}
              className={`px-3 py-1 rounded-lg text-sm border ${
                i === idx ? "bg-white/15 border-white/20" : "bg-white/8 border-white/12"
              }`}
            >
              {title}
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/4 p-4">{steps[idx]}</div>

      <div className="mt-3 flex justify-between">
        <button
          className={`${button} ${buttonGhost}`}
          onClick={() => setIdx(Math.max(0, idx - 1))}
          disabled={idx === 0}
          type="button"
        >
          Back
        </button>
        <button
          className={`${button} ${buttonPrimary}`}
          onClick={() => setIdx(Math.min(steps.length - 1, idx + 1))}
          disabled={idx === steps.length - 1}
          type="button"
        >
          Next
        </button>
      </div>
    </div>
  );
};

Wizard.Step = function Step({ children }: WizardStepProps) {
  return <>{children}</>;
};
