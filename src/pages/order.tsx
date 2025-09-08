// src/pages/order.tsx
// src/pages/order.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

/* =========================
   Types
   ========================= */
type TankOption = "buy" | "rent";
type Fuel = "diesel" | "petrol";

type ContractRow = {
  id: string;
  email: string | null;
  tank_option: "buy" | "rent";
  status: "draft" | "signed" | "approved" | "cancelled";
  customer_name?: string | null;
  created_at?: string | null;
  approved_at?: string | null;
  signed_at?: string | null;
  tank_size_l?: number | null;
  monthly_consumption_l?: number | null;
  fuelflow_price_gbp_l?: number | null;
  est_monthly_savings_gbp?: number | null;
  est_payback_months?: number | null;
};

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
const termsVersion = "v1.1";
const STORAGE_KEY = "order:form:v3";

const GBP = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n);

const StepBadge = ({ state }: { state: "todo" | "done" | "wait" }) => {
  const map = {
    todo: "bg-white/10 text-white/70",
    done: "bg-green-500/20 text-green-300",
    wait: "bg-yellow-500/20 text-yellow-300",
  } as const;
  const text = state === "todo" ? "to do" : state === "done" ? "done" : "wait";
  return <span className={`${pill} ${map[state]}`}>{text}</span>;
};

/* =========================
   Page
   ========================= */
export default function OrderPage() {
  const qp = useSearchParams();

  // live prices
  const [petrolPrice, setPetrolPrice] = useState<number | null>(null);
  const [dieselPrice, setDieselPrice] = useState<number | null>(null);

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

  // contracts
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [activeBuy, setActiveBuy] = useState(false);   // signed OR approved
  const [activeRent, setActiveRent] = useState(false); // approved only
  const [rentAwaitingApproval, setRentAwaitingApproval] = useState<ContractRow | null>(null);

  // ROI / Contract modals
  const [showCalc, setShowCalc] = useState(false);
  const [calcOption, setCalcOption] = useState<TankOption>("buy");

  // Contract wizard modal
  const [showWizard, setShowWizard] = useState(false);
  const [wizardOption, setWizardOption] = useState<TankOption>("buy");
  const [savingContract, setSavingContract] = useState(false);

  // professional extras (stored in JSON if available)
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyNumber, setCompanyNumber] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [siteAddress1, setSiteAddress1] = useState("");
  const [siteAddress2, setSiteAddress2] = useState("");
  const [siteCity, setSiteCity] = useState("");
  const [sitePostcode, setSitePostcode] = useState("");
  const [signatureName, setSignatureName] = useState("");

  // checkout
  const [startingCheckout, setStartingCheckout] = useState(false);

  // ROI numbers
  const [tankSizeL, setTankSizeL] = useState<number>(5000);
  const [monthlyConsumptionL, setMonthlyConsumptionL] = useState<number>(10000);
  const [marketPrice, setMarketPrice] = useState<number>(1.35);
  const [cheaperBy, setCheaperBy] = useState<number>(0.09);

  /* ---------- auth (prefill email) ---------- */
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const em = (data?.user?.email || "").toLowerCase();
      if (em && !email) setEmail(em);
    })();
  }, []);

  /* ---------- prices (like your dashboard) ---------- */
  useEffect(() => {
    (async () => {
      try {
        let { data: lp } = await supabase.from("latest_prices").select("fuel,total_price");
        if (!lp?.length) {
          const { data: dp } = await supabase.from("latest_daily_prices").select("fuel,total_price");
          if (dp?.length) lp = dp as any;
        }
        if (lp?.length) {
          for (const r of lp as { fuel: Fuel; total_price: number }[]) {
            if (r.fuel === "petrol") setPetrolPrice(Number(r.total_price));
            if (r.fuel === "diesel") setDieselPrice(Number(r.total_price));
          }
        }
      } catch {}
    })();
  }, []);

  /* ---------- derived ---------- */
  const unitPriceSelected = fuel === "diesel" ? dieselPrice : petrolPrice;
  const estTotal = useMemo(
    () => (unitPriceSelected != null && Number.isFinite(litres) ? litres * unitPriceSelected : 0),
    [litres, unitPriceSelected]
  );

  const fuelflowPrice = useMemo(
    () => Math.max(0, (marketPrice || 0) - (cheaperBy || 0)),
    [marketPrice, cheaperBy]
  );
  const estMonthlySavings = useMemo(
    () => Math.max(0, (monthlyConsumptionL || 0) * (cheaperBy || 0)),
    [monthlyConsumptionL, cheaperBy]
  );
  const estPaybackMonths = useMemo(
    () =>
      fuelflowPrice > 0 && estMonthlySavings > 0 ? Math.round((12000 / estMonthlySavings) * 10) / 10 : null,
    [estMonthlySavings, fuelflowPrice]
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
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ fuel, litres, deliveryDate, email, fullName, address1, address2, postcode, city })
      );
    } catch {}
  }, [fuel, litres, deliveryDate, email, fullName, address1, address2, postcode, city]);

  /* ---------- Terms acceptance ---------- */
  useEffect(() => {
    const acceptedParam = qp.get("accepted");
    const emailParam = qp.get("email");
    if (emailParam && !email) setEmail(emailParam);
    if (acceptedParam === "1" && emailParam) {
      localStorage.setItem(`terms:${termsVersion}:${emailParam}`, "1");
    }
  }, [qp, email]);

  useEffect(() => {
    if (!email) return;
    (async () => {
      setCheckingTerms(true);
      try {
        const cached = localStorage.getItem(`terms:${termsVersion}:${email}`);
        if (cached === "1") {
          setAccepted(true);
          return;
        }
        const { data } = await supabase
          .from("terms_acceptances")
          .select("id")
          .eq("email", email.toLowerCase())
          .eq("version", termsVersion)
          .limit(1)
          .maybeSingle();
        if (data) {
          setAccepted(true);
          localStorage.setItem(`terms:${termsVersion}:${email}`, "1");
        }
      } finally {
        setCheckingTerms(false);
      }
    })();
  }, [email]);

  function openTerms() {
    const ret = `/terms?return=/order${email ? `&email=${encodeURIComponent(email)}` : ""}`;
    window.location.href = ret;
  }

  /* ---------- load contracts & compute state ---------- */
  async function refreshContracts() {
    if (!email) return;
    const { data } = await supabase
      .from("contracts")
      .select(
        "id,email,tank_option,status,customer_name,created_at,approved_at,signed_at,tank_size_l,monthly_consumption_l,fuelflow_price_gbp_l,est_monthly_savings_gbp,est_payback_months"
      )
      .eq("email", email.toLowerCase())
      .order("created_at", { ascending: false });
    const rows = (data ?? []) as ContractRow[];
    setContracts(rows);

    const buyActive = rows.some(
      (r) => r.tank_option === "buy" && (r.status === "signed" || r.status === "approved")
    );
    const rentApproved = rows.some((r) => r.tank_option === "rent" && r.status === "approved");
    const rentPending = rows.find((r) => r.tank_option === "rent" && r.status === "signed") || null;

    setActiveBuy(buyActive);
    setActiveRent(rentApproved);
    setRentAwaitingApproval(rentPending);
  }

  useEffect(() => {
    refreshContracts();
  }, [email, showWizard]);

  /* ---------- checkout ---------- */
  const requirementsOkay = accepted && (activeBuy || activeRent); // rent only after approval

  const payDisabled =
    !requirementsOkay ||
    !email ||
    !fullName ||
    !address1 ||
    !postcode ||
    !city ||
    !deliveryDate ||
    !Number.isFinite(litres) ||
    litres <= 0;

  async function startCheckout() {
    try {
      if (!requirementsOkay) {
        alert("Complete the requirements first (Terms + active contract).");
        return;
      }
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

  /* ---------- sign & save contract ---------- */
  async function signAndSaveContract(option: TankOption) {
    if (!supabase) return;

    if (!fullName.trim()) {
      alert("Please enter your full name in the order form first.");
      return;
    }
    if (!signatureName.trim()) {
      alert("Type your full legal name as signature.");
      return;
    }

    const base = {
      contract_type: option,
      tank_option: option,
      customer_name: fullName,
      email: email || null,
      address_line1: address1 || null,
      address_line2: address2 || null,
      city: city || null,
      postcode: postcode || null,
      tank_size_l: tankSizeL || null,
      monthly_consumption_l: monthlyConsumptionL || null,
      market_price_gbp_l: marketPrice || null,
      fuelflow_price_gbp_l: fuelflowPrice || null,
      est_monthly_savings_gbp: estMonthlySavings || null,
      est_payback_months: estPaybackMonths || null,
      terms_version: termsVersion,
      signature_name: signatureName,
      signed_at: new Date().toISOString(),
      status: "signed" as const,
    };

    const extraPayload = {
      phone,
      companyName,
      companyNumber,
      vatNumber,
      siteAddress1,
      siteAddress2,
      siteCity,
      sitePostcode,
      cheaperByGBPPerL: cheaperBy,
    };

    try {
      setSavingContract(true);

      let { error } = await supabase.from("contracts").insert({ ...base, extra: extraPayload } as any);

      // If extra jsonb doesn't exist
      if (error && /extra.*does not exist/i.test(error.message || "")) {
        const retry = await supabase.from("contracts").insert(base as any);
        if (retry.error) throw retry.error;
      } else if (error) {
        // Unique index message -> already active
        if (/duplicate|already exists|unique/i.test(error.message)) {
          alert("You already have an active contract of this type.");
        } else {
          throw error;
        }
      }

      setShowWizard(false);
      await refreshContracts();

      if (option === "buy") {
        alert("Purchase contract signed. You can order immediately.");
      } else {
        alert("Rental contract signed. Waiting for admin approval.");
      }
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

        {/* Contract Panel – simple, step-by-step */}
        <section className={card}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <h3 className="text-lg font-semibold">Contract</h3>
            <div className="text-sm text-white/70">
              Buy: active once signed · Rent: needs admin approval after signing
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Step 1: Terms */}
            <div className="rounded-xl border border-white/10 p-4 bg-white/5">
              <div className="flex items-center justify-between">
                <div className="font-medium">Step 1 — Terms</div>
                <StepBadge state={accepted ? "done" : "todo"} />
              </div>
              <p className="text-sm text-white/70 mt-1">You must accept the latest Terms.</p>
              <button type="button" className={`${button} ${buttonGhost} mt-3`} onClick={openTerms}>
                Read & accept Terms
              </button>
              {!accepted && checkingTerms && (
                <div className="text-xs text-white/60 mt-2">Checking acceptance…</div>
              )}
            </div>

            {/* Step 2: Sign contract */}
            <div className="rounded-xl border border-white/10 p-4 bg-white/5">
              <div className="flex items-center justify-between">
                <div className="font-medium">Step 2 — Sign</div>
                <StepBadge
                  state={
                    activeBuy || rentAwaitingApproval || activeRent
                      ? "done"
                      : accepted
                      ? "todo"
                      : "wait"
                  }
                />
              </div>
              <p className="text-sm text-white/70 mt-1">
                Choose a contract type. Buy becomes active immediately; Rent requires approval.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className={`${button} ${buttonPrimary}`}
                  disabled={!accepted || activeBuy}
                  title={!accepted ? "Accept Terms first" : activeBuy ? "Buy contract already active" : ""}
                  onClick={() => {
                    setWizardOption("buy");
                    setShowWizard(true);
                  }}
                >
                  Start Buy
                </button>
                <button
                  className={`${button} ${buttonGhost}`}
                  disabled={!accepted || !!rentAwaitingApproval || activeRent}
                  title={
                    !accepted
                      ? "Accept Terms first"
                      : rentAwaitingApproval
                      ? "Rent contract awaiting approval"
                      : activeRent
                      ? "Rent contract already active"
                      : ""
                  }
                  onClick={() => {
                    setWizardOption("rent");
                    setShowWizard(true);
                  }}
                >
                  Start Rent
                </button>
              </div>

              {/* Current state preview */}
              <div className="mt-3 text-sm">
                <div>
                  Buy:&nbsp;
                  {activeBuy ? <span className="text-green-300">active</span> : "—"}
                </div>
                <div>
                  Rent:&nbsp;
                  {activeRent ? (
                    <span className="text-green-300">active</span>
                  ) : rentAwaitingApproval ? (
                    <span className="text-yellow-300">awaiting approval</span>
                  ) : (
                    "—"
                  )}
                </div>
              </div>
            </div>

            {/* Step 3: Approval / Active */}
            <div className="rounded-xl border border-white/10 p-4 bg-white/5">
              <div className="flex items-center justify-between">
                <div className="font-medium">Step 3 — Approval</div>
                <StepBadge
                  state={
                    activeBuy || activeRent
                      ? "done"
                      : rentAwaitingApproval
                      ? "wait"
                      : accepted
                      ? "todo"
                      : "wait"
                  }
                />
              </div>

              {activeBuy ? (
                <p className="text-sm text-green-300 mt-2">Buy contract active — you can order now.</p>
              ) : activeRent ? (
                <p className="text-sm text-green-300 mt-2">Rent contract approved — you can order now.</p>
              ) : rentAwaitingApproval ? (
                <p className="text-sm text-yellow-300 mt-2">
                  Rent contract signed — waiting for admin approval.
                </p>
              ) : (
                <p className="text-sm text-white/70 mt-2">No active contract yet.</p>
              )}
            </div>
          </div>
        </section>

        {/* Prices */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">
          <Tile title="Petrol (95)" value={petrolPrice != null ? GBP(petrolPrice) : "—"} suffix="/ litre" />
          <Tile title="Diesel" value={dieselPrice != null ? GBP(dieselPrice) : "—"} suffix="/ litre" />
          <Tile title="Estimated Total" value={GBP(estTotal)} />
        </div>

        {/* Order form */}
        <section className={`${card} px-5 md:px-6 py-6`}>
          {!requirementsOkay && (
            <div className="mb-4 text-center text-yellow-300 text-sm">
              Complete the steps above to enable ordering.
            </div>
          )}

          <div className={`${row} ${!requirementsOkay ? "opacity-60" : ""}`}>
            <div>
              <label className={label}>Fuel</label>
              <select className={input} value={fuel} onChange={(e) => setFuel(e.target.value as Fuel)} disabled={!requirementsOkay}>
                <option value="diesel">Diesel</option>
                <option value="petrol">Petrol</option>
              </select>
            </div>

            <div>
              <label className={label}>Litres</label>
              <input className={input} type="number" min={1} value={litres} onChange={(e) => setLitres(Number(e.target.value))} disabled={!requirementsOkay} />
            </div>

            <div>
              <label className={label}>Delivery date</label>
              <input className={input} type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} disabled={!requirementsOkay} />
            </div>

            <div>
              <label className={label}>Your email (receipt)</label>
              <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!requirementsOkay} />
            </div>

            <div className="md:col-span-2">
              <label className={label}>Full name</label>
              <input className={input} value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={!requirementsOkay} />
            </div>

            <div>
              <label className={label}>Address line 1</label>
              <input className={input} value={address1} onChange={(e) => setAddress1(e.target.value)} disabled={!requirementsOkay} />
            </div>

            <div>
              <label className={label}>Address line 2</label>
              <input className={input} value={address2} onChange={(e) => setAddress2(e.target.value)} disabled={!requirementsOkay} />
            </div>

            <div>
              <label className={label}>Postcode</label>
              <input className={input} value={postcode} onChange={(e) => setPostcode(e.target.value)} disabled={!requirementsOkay} />
            </div>

            <div>
              <label className={label}>City</label>
              <input className={input} value={city} onChange={(e) => setCity(e.target.value)} disabled={!requirementsOkay} />
            </div>

            <div className="md:col-span-2 mt-3">
              <button className={`${button} ${buttonPrimary} w-full md:w-auto`} disabled={payDisabled || startingCheckout} onClick={startCheckout}>
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
              <button className={`${button} ${calcOption === "buy" ? buttonPrimary : buttonGhost}`} onClick={() => setCalcOption("buy")}>
                Buy
              </button>
              <button className={`${button} ${calcOption === "rent" ? buttonPrimary : buttonGhost}`} onClick={() => setCalcOption("rent")}>
                Rent
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-4">
            <Metric title="FuelFlow price" value={`${GBP(fuelflowPrice)} / L`} />
            <Metric title="Est. monthly savings" value={GBP(estMonthlySavings)} />
            <Metric title="Est. payback" value={estPaybackMonths ? `${estPaybackMonths} mo` : "—"} />
          </div>

          <div className={row}>
            <Field label="Tank size (L)">
              <input className={input} type="number" min={0} value={tankSizeL} onChange={(e) => setTankSizeL(Number(e.target.value))} />
            </Field>
            <Field label="Monthly consumption (L)">
              <input className={input} type="number" min={0} value={monthlyConsumptionL} onChange={(e) => setMonthlyConsumptionL(Number(e.target.value))} />
            </Field>
            <Field label="Market price (GBP/L)">
              <input className={input} type="number" min={0} step="0.01" value={marketPrice} onChange={(e) => setMarketPrice(Number(e.target.value))} />
            </Field>
            <Field label="FuelFlow cheaper by (GBP/L)">
              <input className={input} type="number" min={0} step="0.01" value={cheaperBy} onChange={(e) => setCheaperBy(Number(e.target.value))} />
            </Field>
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
            {/* Contact */}
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

            {/* Business */}
            <Wizard.Step title="Business">
              <div className={row}>
                <Field label="Company name">
                  <input className={input} value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                </Field>
                <Field label="Company number">
                  <input className={input} value={companyNumber} onChange={(e) => setCompanyNumber(e.target.value)} />
                </Field>
                <Field label="VAT number">
                  <input className={input} value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} />
                </Field>
              </div>
            </Wizard.Step>

            {/* Site & Tank */}
            <Wizard.Step title="Site & Tank">
              <div className={row}>
                <Field label="Site address line 1">
                  <input className={input} value={siteAddress1} onChange={(e) => setSiteAddress1(e.target.value)} />
                </Field>
                <Field label="Site address line 2">
                  <input className={input} value={siteAddress2} onChange={(e) => setSiteAddress2(e.target.value)} />
                </Field>
                <Field label="Site city">
                  <input className={input} value={siteCity} onChange={(e) => setSiteCity(e.target.value)} />
                </Field>
                <Field label="Site postcode">
                  <input className={input} value={sitePostcode} onChange={(e) => setSitePostcode(e.target.value)} />
                </Field>

                <Field label="Tank size (L)">
                  <input className={input} type="number" min={0} value={tankSizeL} onChange={(e) => setTankSizeL(Number(e.target.value))} />
                </Field>
                <Field label="Monthly consumption (L)">
                  <input className={input} type="number" min={0} value={monthlyConsumptionL} onChange={(e) => setMonthlyConsumptionL(Number(e.target.value))} />
                </Field>
                <Field label="Market price (GBP/L)">
                  <input className={input} type="number" min={0} step="0.01" value={marketPrice} onChange={(e) => setMarketPrice(Number(e.target.value))} />
                </Field>
                <Field label="FuelFlow cheaper by (GBP/L)">
                  <input className={input} type="number" min={0} step="0.01" value={cheaperBy} onChange={(e) => setCheaperBy(Number(e.target.value))} />
                </Field>
              </div>
            </Wizard.Step>

            {/* Signature */}
            <Wizard.Step title="Signature">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Metric title="FuelFlow price" value={`${GBP(fuelflowPrice)} / L`} />
                <Metric title="Est. monthly savings" value={GBP(estMonthlySavings)} />
                <Metric title="Est. payback" value={estPaybackMonths ? `${estPaybackMonths} mo` : "—"} />
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

              <div className="mt-6 flex justify-between gap-3">
                <div className="text-white/60 text-sm">
                  By signing you agree to the Terms and the figures above are estimates.
                </div>
                <div className="flex gap-3">
                  <button className={`${button} ${buttonGhost}`} disabled={savingContract} onClick={() => setShowWizard(false)}>
                    Cancel
                  </button>
                  <button className={`${button} ${buttonPrimary}`} disabled={savingContract} onClick={() => signAndSaveContract(wizardOption)}>
                    {savingContract ? "Saving…" : "Sign & Save"}
                  </button>
                </div>
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
   Wizard
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
        <button className={`${button} ${buttonGhost}`} onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0} type="button">
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
