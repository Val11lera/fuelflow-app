// src/pages/order.tsx
// src/pages/order.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

/* ============================================================
   Types
   ============================================================ */

type TankOption = "buy" | "rent";
type Fuel = "diesel" | "petrol";

type ContractRow = {
  id: string;
  email: string | null;
  status: "draft" | "signed" | "approved" | "cancelled";
  tank_option: "buy" | "rent";
  created_at: string;
};

const TERMS_VERSION = "v1.1";
const STORAGE_KEY_FORM = "order:form:v2";

/* ============================================================
   Supabase (browser-side)
   ============================================================ */
const supabase =
  typeof window !== "undefined"
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || "",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
      )
    : (null as any);

/* ============================================================
   UI tokens
   ============================================================ */
const card =
  "rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-5 py-4 shadow transition";
const cardSelected = "ring-2 ring-yellow-400 border-yellow-400 bg-white/10";
const pill =
  "inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border border-white/10 bg-white/10";
const button =
  "rounded-2xl px-4 py-2 font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed";
const buttonPrimary = "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400 active:bg-yellow-300";
const buttonGhost = "bg-white/8 hover:bg-white/15 text-white border border-white/10";
const input =
  "w-full rounded-lg border border-white/12 bg-white/6 px-3 py-2 text-white placeholder-white/40 outline-none focus:ring focus:ring-yellow-500/30";
const label = "block text-sm font-medium text-white/80 mb-1";

/* ============================================================
   Helpers
   ============================================================ */
const GBP = (n: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);

const monthDay = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

/* ============================================================
   Component
   ============================================================ */
export default function OrderPage() {
  const qp = useSearchParams();

  // simple tiles (use your live price for server-side billing)
  const unitPricePetrol = 2.27;
  const unitPriceDiesel = 2.44;

  // authed email
  const [authedEmail, setAuthedEmail] = useState<string>("");

  // persisted order form
  const [fuel, setFuel] = useState<Fuel>("diesel");
  const [litres, setLitres] = useState<number>(1000);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [postcode, setPostcode] = useState("");
  const [city, setCity] = useState("");

  // requirements
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [checkingTerms, setCheckingTerms] = useState(false);

  // contract status
  const [buyStatus, setBuyStatus] = useState<"missing" | "signed" | "approved">("missing");
  const [rentStatus, setRentStatus] = useState<"missing" | "signed" | "approved">("missing");

  // UI
  const [showSavings, setShowSavings] = useState(false);
  const [savingsOption, setSavingsOption] = useState<TankOption>("buy");
  const [showContractWizard, setShowContractWizard] = useState(false);
  const [contractOption, setContractOption] = useState<TankOption>("buy");
  const [savingContract, setSavingContract] = useState(false);

  // savings inputs
  const [tankSizeL, setTankSizeL] = useState<number>(5000);
  const [monthlyConsumptionL, setMonthlyConsumptionL] = useState<number>(10000);
  const [marketPrice, setMarketPrice] = useState<number>(1.35);
  const [cheaperBy, setCheaperBy] = useState<number>(0.09);

  // wizard fields (richer contract)
  const [companyName, setCompanyName] = useState("");
  const [companyNumber, setCompanyNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [siteContact, setSiteContact] = useState("");

  // checkout
  const [startingCheckout, setStartingCheckout] = useState(false);

  // derived
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
  const capexRequired = useMemo(() => (savingsOption === "buy" ? 12000 : 0), [savingsOption]);

  /* ---------------- Load auth + persist form ---------------- */
  useEffect(() => {
    (async () => {
      // auth
      const { data: auth } = await supabase.auth.getUser();
      const em = (auth?.user?.email || "").toLowerCase();
      setAuthedEmail(em);
      if (!email) setEmail(em); // prefill if empty

      // load persisted
      try {
        const raw = localStorage.getItem(STORAGE_KEY_FORM);
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
          if (v.companyName) setCompanyName(v.companyName);
          if (v.companyNumber) setCompanyNumber(v.companyNumber);
          if (v.phone) setPhone(v.phone);
          if (v.siteContact) setSiteContact(v.siteContact);
        }
      } catch {}
    })();
  }, []); // eslint-disable-line

  useEffect(() => {
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
      companyName,
      companyNumber,
      phone,
      siteContact,
    };
    try {
      localStorage.setItem(STORAGE_KEY_FORM, JSON.stringify(payload));
    } catch {}
  }, [
    fuel,
    litres,
    deliveryDate,
    email,
    fullName,
    address1,
    address2,
    postcode,
    city,
    companyName,
    companyNumber,
    phone,
    siteContact,
  ]);

  /* ---------------- Terms detection (robust) ---------------- */
  useEffect(() => {
    const acceptedParam = qp.get("accepted");
    const emailParam = qp.get("email");

    // if we just came back from /terms, mark accepted immediately
    if (acceptedParam === "1") {
      const key =
        (emailParam || authedEmail)
          ? `terms:${TERMS_VERSION}:${(emailParam || authedEmail).toLowerCase()}`
          : `terms:${TERMS_VERSION}:GLOBAL`;

      localStorage.setItem(key, "1");
      setTermsAccepted(true);
    }
  }, [qp, authedEmail]);

  useEffect(() => {
    // verify from cache and DB
    (async () => {
      setCheckingTerms(true);
      try {
        const emailKey = email?.toLowerCase();
        const localKeys = [
          `terms:${TERMS_VERSION}:${emailKey || ""}`,
          `terms:${TERMS_VERSION}:${authedEmail || ""}`,
          `terms:${TERMS_VERSION}:GLOBAL`,
        ];
        if (localKeys.some((k) => localStorage.getItem(k) === "1")) {
          setTermsAccepted(true);
          return;
        }

        if (!supabase) return;
        const theEmail = (emailKey || authedEmail).toLowerCase();

        if (theEmail) {
          const { data, error } = await supabase
            .from("terms_acceptances")
            .select("id,accepted_at,version")
            .eq("email", theEmail)
            .eq("version", TERMS_VERSION)
            .order("accepted_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!error && data) {
            setTermsAccepted(true);
            localStorage.setItem(`terms:${TERMS_VERSION}:${theEmail}`, "1");
          }
        }
      } finally {
        setCheckingTerms(false);
      }
    })();
  }, [email, authedEmail]);

  function goReadTerms() {
    const em = encodeURIComponent(email || authedEmail || "");
    const ret = `/terms?return=/order${em ? `&email=${em}` : ""}`;
    window.location.href = ret;
  }

  /* ---------------- Contract status ---------------- */
  async function refreshContractStatus() {
    if (!supabase) return;
    const em = (email || authedEmail).toLowerCase();
    if (!em) {
      setBuyStatus("missing");
      setRentStatus("missing");
      return;
    }

    const { data, error } = await supabase
      .from("contracts")
      .select("id,tank_option,status,email,created_at")
      .eq("email", em)
      .in("status", ["signed", "approved"]);

    if (error) {
      setBuyStatus("missing");
      setRentStatus("missing");
      return;
    }
    const rows = (data ?? []) as ContractRow[];

    const mk = (opt: TankOption): "missing" | "signed" | "approved" => {
      const match = rows.find((r) => r.tank_option === opt);
      if (!match) return "missing";
      return match.status === "approved" ? "approved" : "signed";
    };
    setBuyStatus(mk("buy"));
    setRentStatus(mk("rent"));
  }

  useEffect(() => {
    void refreshContractStatus();
  }, [email, authedEmail, showContractWizard]);

  /* ---------------- Savings (one button) ---------------- */

  /* ---------------- Contract wizard save ---------------- */
  async function saveContract() {
    if (!supabase) return;
    if (!fullName.trim()) return alert("Enter the contact full name.");
    if (!email.trim()) return alert("Enter your email.");
    if (!address1.trim() || !city.trim() || !postcode.trim())
      return alert("Enter the site address.");

    try {
      setSavingContract(true);

      const payload = {
        tank_option: contractOption,
        status: "signed",
        email: (email || authedEmail).toLowerCase(),
        customer_name: fullName,
        business_name: companyName || null,
        company_number: companyNumber || null,
        phone: phone || null,
        site_contact: siteContact || null,
        address_line1: address1 || null,
        address_line2: address2 || null,
        city: city || null,
        postcode: postcode || null,
        tank_size_l: tankSizeL || null,
        monthly_consumption_l: monthlyConsumptionL || null,
        market_price_gbp_l: marketPrice || null,
        cheaper_by_gbp_l: cheaperBy || null,
        fuelflow_price_gbp_l: fuelflowPrice || null,
        est_monthly_savings_gbp: estMonthlySavings || null,
        capex_required_gbp: contractOption === "buy" ? 12000 : 0,
        terms_version: TERMS_VERSION,
        signed_at: new Date().toISOString(),
        signature_name: fullName, // typed name equals signature
      };

      const { error } = await supabase.from("contracts").insert(payload);
      if (error) throw error;

      setShowContractWizard(false);
      await refreshContractStatus();
    } catch (e: any) {
      alert(e?.message || "Failed to save contract.");
    } finally {
      setSavingContract(false);
    }
  }

  /* ---------------- Checkout ---------------- */
  const requirementsOk =
    termsAccepted &&
    (buyStatus === "signed" || buyStatus === "approved" || rentStatus === "approved");

  // Disable ordering if rent is only signed but not approved
  const rentSignedButNotApproved = rentStatus === "signed" && buyStatus === "missing";

  const payDisabled =
    !requirementsOk ||
    rentSignedButNotApproved ||
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
          address_line_2: address2,
          city,
          postcode,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { url?: string; error?: string };
      if (!data.url) throw new Error(data.error || "No checkout URL returned");
      window.location.href = data.url;
    } catch (e: any) {
      alert(e?.message || "Failed to create order");
    } finally {
      setStartingCheckout(false);
    }
  }

  /* ============================================================
     Render
     ============================================================ */
  return (
    <main className="min-h-screen bg-[#061B34] text-white pb-20">
      <div className="mx-auto w-full max-w-6xl px-4 pt-10">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <img src="/logo-email.png" alt="FuelFlow" width={116} height={28} className="opacity-90" />
          <div className="ml-2 text-2xl md:text-3xl font-bold">Place an Order</div>
          <div className="ml-auto flex items-center gap-4">
            <Link href="/client-dashboard" className="text-white/70 hover:text-white">
              Back to Dashboard
            </Link>
          </div>
        </div>

        {/* Requirements */}
        <section className={`${card} mb-6`}>
          <h3 className="text-lg font-semibold mb-3">Requirements</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Terms */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between">
                <div className="font-medium">Terms &amp; Conditions</div>
                <span
                  className={`${pill} ${
                    termsAccepted ? "text-emerald-300 border-emerald-400/30" : "text-rose-300"
                  }`}
                >
                  {termsAccepted ? "accepted" : "missing"}
                </span>
              </div>
              <p className="text-sm text-white/70 mt-1">
                You must read and accept the latest Terms before ordering.
              </p>
              <button
                className={`${button} ${buttonGhost} mt-3`}
                onClick={goReadTerms}
                disabled={checkingTerms}
              >
                {termsAccepted ? "View Terms" : "Read & accept Terms"}
              </button>
            </div>

            {/* Contract */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between">
                <div className="font-medium">Contract</div>
                <div className="flex items-center gap-2">
                  <span className={`${pill} ${statusTone(buyStatus)}`}>Buy: {buyStatus}</span>
                  <span className={`${pill} ${statusTone(rentStatus)}`}>Rent: {rentStatus}</span>
                </div>
              </div>
              <p className="text-sm text-white/70 mt-1">
                Buy: a signed contract is enough. Rent: you must be approved after signing.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className={`${button} ${buttonGhost}`}
                  onClick={() => {
                    setSavingsOption("buy");
                    setShowSavings(true);
                  }}
                >
                  Savings calculator
                </button>
                <button
                  className={`${button} ${buttonPrimary}`}
                  onClick={() => {
                    setContractOption("buy");
                    setShowContractWizard(true);
                  }}
                >
                  Start Buy
                </button>
                <button
                  className={`${button} ${buttonPrimary}`}
                  onClick={() => {
                    setContractOption("rent");
                    setShowContractWizard(true);
                  }}
                >
                  Start Rent
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* price tiles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Tile title="Petrol (95)" value={`${GBP(unitPricePetrol)}`} suffix="/ litre" />
          <Tile title="Diesel" value={`${GBP(unitPriceDiesel)}`} suffix="/ litre" />
          <Tile title="Estimated Total" value={GBP(estTotal)} />
        </div>

        {/* order form */}
        <section className={`${card} px-5 md:px-6 py-6`}>
          {!requirementsOk && (
            <div className="mb-4 text-center text-yellow-300 text-sm">
              <b>Complete the requirements first</b>
              <div className="text-white/70">
                • Accept the Terms • Sign (and for Rent, get approval for) a contract.
              </div>
            </div>
          )}

          {rentSignedButNotApproved && (
            <div className="mb-4 text-center text-orange-300 text-sm">
              Your Rent contract is signed and pending approval. Ordering is disabled until approved.
            </div>
          )}

          <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${!requirementsOk ? "opacity-60 pointer-events-none" : ""}`}>
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
              <p className="text-[11px] text-white/50 mt-1">
                Requested date — we’ll confirm by email.
              </p>
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

            <div className="md:col-span-2 mt-1">
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

      {/* Savings modal (single button; buy/rent toggle inside) */}
      {showSavings && (
        <Modal onClose={() => setShowSavings(false)} title="Savings calculator">
          <Segmented
            value={savingsOption}
            onChange={(v) => setSavingsOption(v as TankOption)}
            options={[
              { value: "buy", label: "Buy" },
              { value: "rent", label: "Rent" },
            ]}
          />

          <EstimateBanner />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-4">
            <Metric title="FuelFlow price" value={`${GBP(fuelflowPrice)} / L`} />
            <Metric title="Est. monthly savings" value={GBP(estMonthlySavings)} />
            <Metric title="Capex required" value={savingsOption === "buy" ? GBP(capexRequired) : "£0 (rental)"} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Tank size (L)">
              <input className={input} type="number" min={0} value={tankSizeL} onChange={(e) => setTankSizeL(+e.target.value)} />
            </Field>
            <Field label="Monthly consumption (L)">
              <input className={input} type="number" min={0} value={monthlyConsumptionL} onChange={(e) => setMonthlyConsumptionL(+e.target.value)} />
            </Field>
            <Field label="Market price (GBP/L)">
              <input className={input} type="number" step="0.01" min={0} value={marketPrice} onChange={(e) => setMarketPrice(+e.target.value)} />
            </Field>
            <Field label="FuelFlow cheaper by (GBP/L)">
              <input className={input} type="number" step="0.01" min={0} value={cheaperBy} onChange={(e) => setCheaperBy(+e.target.value)} />
            </Field>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button className={`${button} ${buttonGhost}`} onClick={() => setShowSavings(false)}>
              Close
            </button>
            <button
              className={`${button} ${buttonPrimary}`}
              onClick={() => {
                setShowSavings(false);
                setContractOption(savingsOption);
                setShowContractWizard(true);
              }}
            >
              Continue to Contract
            </button>
          </div>
        </Modal>
      )}

      {/* Contract wizard */}
      {showContractWizard && (
        <Modal onClose={() => !savingContract && setShowContractWizard(false)} title={`Start ${contractOption === "buy" ? "Purchase" : "Rental"} Contract`}>
          <div className="mb-3">
            <Segmented
              value={contractOption}
              onChange={(v) => setContractOption(v as TankOption)}
              options={[
                { value: "buy", label: "Buy" },
                { value: "rent", label: "Rent" },
              ]}
            />
          </div>

          <Wizard>
            {/* Step 1: Contact */}
            <Wizard.Step title="Contact">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Full name">
                  <input className={input} value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </Field>
                <Field label="Email">
                  <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Field label="Phone">
                  <input className={input} value={phone} onChange={(e) => setPhone(e.target.value)} />
                </Field>
                <Field label="Site contact (optional)">
                  <input className={input} value={siteContact} onChange={(e) => setSiteContact(e.target.value)} />
                </Field>
              </div>
            </Wizard.Step>

            {/* Step 2: Business */}
            <Wizard.Step title="Business">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Business / Trading name">
                  <input className={input} value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                </Field>
                <Field label="Company number (optional)">
                  <input className={input} value={companyNumber} onChange={(e) => setCompanyNumber(e.target.value)} />
                </Field>
              </div>
              <p className="mt-2 text-xs text-white/60">If you’re not a company, leave Company number blank.</p>
            </Wizard.Step>

            {/* Step 3: Site */}
            <Wizard.Step title="Site / Delivery">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Address line 1">
                  <input className={input} value={address1} onChange={(e) => setAddress1(e.target.value)} />
                </Field>
                <Field label="Address line 2">
                  <input className={input} value={address2} onChange={(e) => setAddress2(e.target.value)} />
                </Field>
                <Field label="City">
                  <input className={input} value={city} onChange={(e) => setCity(e.target.value)} />
                </Field>
                <Field label="Postcode">
                  <input className={input} value={postcode} onChange={(e) => setPostcode(e.target.value)} />
                </Field>
              </div>
            </Wizard.Step>

            {/* Step 4: Usage */}
            <Wizard.Step title="Usage & Pricing">
              <EstimateBanner />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-4">
                <Metric title="FuelFlow price" value={`${GBP(fuelflowPrice)} / L`} />
                <Metric title="Est. monthly savings" value={GBP(estMonthlySavings)} />
                <Metric title="Capex required" value={contractOption === "buy" ? GBP(12000) : "£0 (rental)"} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Tank size (L)">
                  <input className={input} type="number" min={0} value={tankSizeL} onChange={(e) => setTankSizeL(+e.target.value)} />
                </Field>
                <Field label="Monthly consumption (L)">
                  <input className={input} type="number" min={0} value={monthlyConsumptionL} onChange={(e) => setMonthlyConsumptionL(+e.target.value)} />
                </Field>
                <Field label="Market price (GBP/L)">
                  <input className={input} type="number" step="0.01" min={0} value={marketPrice} onChange={(e) => setMarketPrice(+e.target.value)} />
                </Field>
                <Field label="FuelFlow cheaper by (GBP/L)">
                  <input className={input} type="number" step="0.01" min={0} value={cheaperBy} onChange={(e) => setCheaperBy(+e.target.value)} />
                </Field>
              </div>
            </Wizard.Step>

            {/* Step 5: Review & Sign */}
            <Wizard.Step title="Review & Sign">
              <div className="rounded-xl border border-white/10 bg-[#0E2E57] p-4 text-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <b>Contact</b>
                    <div>{fullName}</div>
                    <div>{email}</div>
                    <div>{phone || "—"}</div>
                  </div>
                  <div>
                    <b>Business</b>
                    <div>{companyName || "—"}</div>
                    <div>{companyNumber || "—"}</div>
                  </div>
                  <div>
                    <b>Site</b>
                    <div>{address1}</div>
                    <div>{address2 || "—"}</div>
                    <div>
                      {city || "—"} {postcode || ""}
                    </div>
                  </div>
                  <div>
                    <b>Usage</b>
                    <div>Tank: {tankSizeL} L</div>
                    <div>Monthly: {monthlyConsumptionL} L</div>
                    <div>FuelFlow price: {GBP(fuelflowPrice)} / L</div>
                  </div>
                </div>
                <p className="mt-3 text-white/70">
                  By clicking <b>Sign &amp; Save</b>, you agree the information above is correct and you
                  accept FuelFlow’s Terms (version {TERMS_VERSION}).{" "}
                  {contractOption === "rent"
                    ? "Your rental application will be reviewed and you’ll be notified once approved."
                    : "Buy contracts do not require admin approval."}
                </p>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  className={`${button} ${buttonGhost}`}
                  onClick={() => setShowContractWizard(false)}
                  disabled={savingContract}
                >
                  Cancel
                </button>
                <button
                  className={`${button} ${buttonPrimary}`}
                  onClick={saveContract}
                  disabled={savingContract}
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

/* ============================================================
   Small UI helpers
   ============================================================ */

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
      <div className="relative w-[95%] max-w-4xl rounded-2xl bg-[#0B274B] border border-white/10 p-5 shadow-xl">
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

function Field({ label: lbl, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={label}>{lbl}</span>
      {children}
    </label>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-xl border border-white/10 bg-white/6 p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            className={`px-3 py-1 rounded-lg text-sm ${
              active ? "bg-yellow-500 text-[#041F3E]" : "text-white/80 hover:bg-white/10"
            }`}
            onClick={() => onChange(o.value)}
            type="button"
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function statusTone(s: "missing" | "signed" | "approved") {
  if (s === "approved") return "text-emerald-300 border-emerald-400/30";
  if (s === "signed") return "text-yellow-300 border-yellow-300/30";
  return "text-rose-300";
}

/* -------- Tiny multi-step wizard scaffold -------- */
function Wizard({ children }: { children: any }) {
  const steps = Array.isArray(children) ? children : [children];
  const [idx, setIdx] = useState(0);
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {steps.map((s: any, i: number) => (
          <div
            key={i}
            className={`px-3 py-1 rounded-lg text-sm border ${
              i === idx ? "bg-white/15 border-white/20" : "bg-white/8 border-white/12"
            }`}
          >
            {(s.props?.title as string) || `Step ${i + 1}`}
          </div>
        ))}
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
}
Wizard.Step = function Step({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
};


