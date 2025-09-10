// src/pages/documents.tsx
// src/pages/documents.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

/* ───────────────────────── Setup ───────────────────────── */

type ContractStatus = "draft" | "signed" | "approved" | "cancelled";
type TankOption = "buy" | "rent";

const TERMS_VERSION = "v1.1";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

/* ───────────────────────── UI tokens ───────────────────────── */

const card =
  "rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-5 py-4 shadow transition";
const pill = "inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full";
const btn =
  "rounded-2xl px-4 py-2 font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed";
const btnPrimary = "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400";
const btnGhost = "bg-white/10 hover:bg-white/15 text-white border border-white/10";
const input =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none focus:ring focus:ring-yellow-500/30";
const label = "block text-sm font-medium text-white/80 mb-1";
const row = "grid grid-cols-1 md:grid-cols-2 gap-4";

/* ───────────────────────── Types ───────────────────────── */

type TermsRow = { id: string; email: string; accepted_at: string; version: string };

type ContractRow = {
  id: string;
  email_lc: string;
  tank_option: TankOption;
  status: ContractStatus;
  signed_at: string | null;
  approved_at: string | null;
  created_at: string;

  company_name: string | null;
  company_number: string | null;
  vat_number: string | null;

  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;

  reg_address_line1: string | null;
  reg_address_line2: string | null;
  reg_city: string | null;
  reg_postcode: string | null;
  reg_country: string | null;

  site_address_line1: string | null;
  site_address_line2: string | null;
  site_city: string | null;
  site_postcode: string | null;
  site_country: string | null;

  tank_size_l: number | null;
  monthly_consumption_l: number | null;

  market_price_gbp_l: number | null;
  cheaper_by_gbp_l: number | null;
  fuelflow_price_gbp_l: number | null;
  est_monthly_savings_gbp: number | null;
  capex_required_gbp: number | null;

  signature_name: string | null;
};

function cx(...c: (string | null | false | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/* ───────────────────────── Page ───────────────────────── */

export default function DocumentsPage() {
  const [userEmail, setUserEmail] = useState<string>("");

  // Terms & contracts state
  const [termsAccepted, setTermsAccepted] = useState<boolean>(false);
  const [buy, setBuy] = useState<ContractRow | null>(null);
  const [rent, setRent] = useState<ContractRow | null>(null);

  // Wizard state
  const [showWizard, setShowWizard] = useState(false);
  const [option, setOption] = useState<TankOption>("buy");
  const [saving, setSaving] = useState(false);

  // Company / legal
  const [companyName, setCompanyName] = useState("");
  const [companyNumber, setCompanyNumber] = useState("");
  const [vatNumber, setVatNumber] = useState("");

  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  // Registered/business address
  const [reg1, setReg1] = useState("");
  const [reg2, setReg2] = useState("");
  const [regCity, setRegCity] = useState("");
  const [regPostcode, setRegPostcode] = useState("");
  const [regCountry, setRegCountry] = useState("UK");

  // Site/delivery address
  const [site1, setSite1] = useState("");
  const [site2, setSite2] = useState("");
  const [siteCity, setSiteCity] = useState("");
  const [sitePostcode, setSitePostcode] = useState("");
  const [siteCountry, setSiteCountry] = useState("UK");

  // Tank & ROI
  const [tankSizeL, setTankSizeL] = useState<number>(5000);
  const [monthlyL, setMonthlyL] = useState<number>(10000);
  const [marketPrice, setMarketPrice] = useState<number>(1.35);
  const [cheaperBy, setCheaperBy] = useState<number>(0.09);
  const [capex, setCapex] = useState<number>(12000);

  // Signature
  const [signatureName, setSignatureName] = useState("");

  const fuelflowPrice = useMemo(
    () => Math.max(0, (marketPrice || 0) - (cheaperBy || 0)),
    [marketPrice, cheaperBy]
  );
  const monthlySavings = useMemo(
    () => Math.max(0, (monthlyL || 0) * (cheaperBy || 0)),
    [monthlyL, cheaperBy]
  );

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        window.location.href = "/login";
        return;
      }
      const emailLower = (auth.user.email || "").toLowerCase();
      setUserEmail(emailLower);

      await refreshTermsAndContracts(emailLower);
    })();
  }, []);

  async function refreshTermsAndContracts(emailLower: string) {
    // Terms
    const { data: t } = await supabase
      .from("terms_acceptances")
      .select("id,email,accepted_at,version")
      .eq("email", emailLower)
      .eq("version", TERMS_VERSION)
      .order("accepted_at", { ascending: false })
      .limit(1);
    setTermsAccepted(Boolean(t?.[0]));

    // Contracts (use the VIEW for LC email matching)
    const { data: c } = await supabase
      .from("v_user_contracts")
      .select(
        "id,email_lc,tank_option,status,signed_at,approved_at,created_at,company_name,company_number,vat_number,contact_name,contact_email,contact_phone,reg_address_line1,reg_address_line2,reg_city,reg_postcode,reg_country,site_address_line1,site_address_line2,site_city,site_postcode,site_country,tank_size_l,monthly_consumption_l,market_price_gbp_l,cheaper_by_gbp_l,fuelflow_price_gbp_l,est_monthly_savings_gbp,capex_required_gbp,signature_name"
      )
      .eq("email_lc", emailLower)
      .order("created_at", { ascending: false });

    const rows = (c || []) as ContractRow[];
    const latestBuy =
      rows.find((r) => r.tank_option === "buy" && (r.status === "approved" || r.status === "signed")) ??
      rows.find((r) => r.tank_option === "buy") ??
      null;
    const latestRent =
      rows.find((r) => r.tank_option === "rent" && (r.status === "approved" || r.status === "signed")) ??
      rows.find((r) => r.tank_option === "rent") ??
      null;

    setBuy(latestBuy);
    setRent(latestRent);
  }

  const documentsComplete =
    termsAccepted && (buy?.status === "signed" || rent?.status === "approved");

  function openTerms() {
    const ret = `/terms?return=/documents${userEmail ? `&email=${encodeURIComponent(userEmail)}` : ""}`;
    window.location.href = ret;
  }

  /* ───────────────────────── Save contract ───────────────────────── */

  async function saveContract(which: TankOption) {
    if (!userEmail) return;

    if (!signatureName.trim()) {
      alert("Type your full legal name as signature.");
      return;
    }
    if (!companyName.trim()) {
      alert("Company name is required.");
      return;
    }
    if (!reg1.trim() || !regCity.trim() || !regPostcode.trim()) {
      alert("Registered address must be complete.");
      return;
    }
    if (!site1.trim() || !siteCity.trim() || !sitePostcode.trim()) {
      alert("Site/delivery address must be complete.");
      return;
    }

    try {
      setSaving(true);

      const payload = {
        tank_option: which,
        status: "signed" as ContractStatus, // rent requires admin approval later
        email: userEmail,

        customer_name: contactName || null,

        company_name: companyName || null,
        company_number: companyNumber || null,
        vat_number: vatNumber || null,

        contact_name: contactName || null,
        contact_email: contactEmail || userEmail,
        contact_phone: contactPhone || null,

        reg_address_line1: reg1 || null,
        reg_address_line2: reg2 || null,
        reg_city: regCity || null,
        reg_postcode: regPostcode || null,
        reg_country: regCountry || null,

        site_address_line1: site1 || null,
        site_address_line2: site2 || null,
        site_city: siteCity || null,
        site_postcode: sitePostcode || null,
        site_country: siteCountry || null,

        tank_size_l: tankSizeL || null,
        monthly_consumption_l: monthlyL || null,

        market_price_gbp_l: marketPrice || null,
        cheaper_by_gbp_l: cheaperBy || null,
        fuelflow_price_gbp_l: fuelflowPrice || null,
        est_monthly_savings_gbp: monthlySavings || null,
        capex_required_gbp: (which === "buy" ? capex : 0) || null,

        signature_name: signatureName,
        signed_at: new Date().toISOString(),
        approved_at: null,
      };

      const { error } = await supabase.from("contracts").insert(payload);
      if (error) throw error;

      setShowWizard(false);
      await refreshTermsAndContracts(userEmail);
      alert("Contract saved. For rentals, admin approval is still required.");
    } catch (e: any) {
      alert(e?.message || "Failed to save contract.");
    } finally {
      setSaving(false);
    }
  }

  /* ───────────────────────── Render ───────────────────────── */

  return (
    <main className="min-h-screen bg-[#061B34] text-white pb-24">
      <div className="mx-auto w-full max-w-6xl px-4 pt-8">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <img src="/logo-email.png" alt="FuelFlow" width={116} height={28} className="opacity-90" />
          <h1 className="ml-2 text-2xl md:text-3xl font-bold">Documents</h1>
          <div className="ml-auto">
            <Link href="/client-dashboard" className="text-white/70 hover:text-white">
              Back to Dashboard
            </Link>
          </div>
        </div>

        <p className="mb-5 text-white/70">
          Ordering unlocks when <b>Terms</b> are accepted and either a <b>Buy</b> contract is
          signed or a <b>Rent</b> contract is approved.
        </p>

        {/* Tiles */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Terms */}
          <div className={card}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Terms &amp; Conditions</h3>
              {termsAccepted ? (
                <span className={`${pill} bg-green-500/20 text-green-300`}>ok</span>
              ) : (
                <span className={`${pill} bg-red-500/20 text-red-300`}>missing</span>
              )}
            </div>
            <p className="mt-2 text-white/70 text-sm">
              You must accept the latest Terms before ordering.
            </p>
            <div className="mt-3">
              <button type="button" className={`${btn} ${btnGhost}`} onClick={openTerms}>
                Read &amp; accept
              </button>
            </div>
          </div>

          {/* Buy */}
          <div className={card}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Buy Contract</h3>
              <span
                className={cx(
                  pill,
                  buy?.status === "approved" || buy?.status === "signed"
                    ? "bg-green-500/20 text-green-300"
                    : "bg-white/10 text-white/80"
                )}
              >
                {buy ? (buy.status === "approved" ? "Active" : "Signed") : "Not signed"}
              </span>
            </div>
            <p className="mt-2 text-white/70 text-sm">
              For purchase agreements: a signed contract is enough to order.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                className={`${btn} ${btnGhost}`}
                onClick={() => alert("Calculator coming soon")}
              >
                ROI / Calculator
              </button>
              <button
                className={`${btn} ${btnPrimary}`}
                onClick={() => {
                  setOption("buy");
                  setShowWizard(true);
                }}
              >
                {buy ? "Update / Resign" : "Start"}
              </button>
            </div>
          </div>

          {/* Rent */}
          <div className={card}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Rent Contract</h3>
              <span
                className={cx(
                  pill,
                  rent?.status === "approved"
                    ? "bg-green-500/20 text-green-300"
                    : rent?.status === "signed"
                    ? "bg-yellow-500/20 text-yellow-300"
                    : "bg-white/10 text-white/80"
                )}
              >
                {rent
                  ? rent.status === "approved"
                    ? "Active"
                    : "Awaiting approval"
                  : "Not signed"}
              </span>
            </div>
            <p className="mt-2 text-white/70 text-sm">
              Rental agreements require <b>admin approval</b> after signing.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                className={`${btn} ${btnGhost}`}
                onClick={() => alert("Calculator coming soon")}
              >
                ROI / Calculator
              </button>
              <button
                className={`${btn} ${btnPrimary}`}
                onClick={() => {
                  setOption("rent");
                  setShowWizard(true);
                }}
              >
                {rent ? "Update / Resign" : "Start"}
              </button>
            </div>
          </div>
        </section>

        {/* Completion banner */}
        <div
          className={cx(
            "mt-6 rounded-xl border px-4 py-3 text-sm",
            documentsComplete
              ? "border-green-400/40 bg-green-500/10 text-green-200"
              : "border-white/15 bg-white/5 text-white/80"
          )}
        >
          {documentsComplete ? (
            <>
              <span className="font-semibold">Documents complete</span> — you can{" "}
              <Link href="/order" className="underline underline-offset-2 decoration-yellow-400">
                place an order
              </Link>
              .
            </>
          ) : (
            <>
              Complete the steps above. Ordering unlocks when Terms are accepted and either Buy is
              signed or Rent is approved.
            </>
          )}
        </div>
      </div>

      {/* Wizard */}
      {showWizard && (
        <WizardModal
          option={option}
          onClose={() => setShowWizard(false)}
          saving={saving}
          fuelflowPrice={fuelflowPrice}
          monthlySavings={monthlySavings}
          capex={capex}
          setCapex={setCapex}
          // company
          companyName={companyName}
          setCompanyName={setCompanyName}
          companyNumber={companyNumber}
          setCompanyNumber={setCompanyNumber}
          vatNumber={vatNumber}
          setVatNumber={setVatNumber}
          // contact
          contactName={contactName}
          setContactName={setContactName}
          contactEmail={contactEmail}
          setContactEmail={setContactEmail}
          contactPhone={contactPhone}
          setContactPhone={setContactPhone}
          // registered
          reg1={reg1}
          setReg1={setReg1}
          reg2={reg2}
          setReg2={setReg2}
          regCity={regCity}
          setRegCity={setRegCity}
          regPostcode={regPostcode}
          setRegPostcode={setRegPostcode}
          regCountry={regCountry}
          setRegCountry={setRegCountry}
          // site
          site1={site1}
          setSite1={setSite1}
          site2={site2}
          setSite2={setSite2}
          siteCity={siteCity}
          setSiteCity={setSiteCity}
          sitePostcode={sitePostcode}
          setSitePostcode={setSitePostcode}
          siteCountry={siteCountry}
          setSiteCountry={setSiteCountry}
          // tank & roi
          tankSizeL={tankSizeL}
          setTankSizeL={setTankSizeL}
          monthlyL={monthlyL}
          setMonthlyL={setMonthlyL}
          marketPrice={marketPrice}
          setMarketPrice={setMarketPrice}
          cheaperBy={cheaperBy}
          setCheaperBy={setCheaperBy}
          // signature
          signatureName={signatureName}
          setSignatureName={setSignatureName}
          // save
          onSave={() => saveContract(option)}
        />
      )}
    </main>
  );
}

/* ───────────────────────── Wizard modal ───────────────────────── */

function WizardModal(props: {
  option: TankOption;
  onClose: () => void;
  saving: boolean;

  fuelflowPrice: number;
  monthlySavings: number;
  capex: number;
  setCapex: (n: number) => void;

  companyName: string;
  setCompanyName: (s: string) => void;
  companyNumber: string;
  setCompanyNumber: (s: string) => void;
  vatNumber: string;
  setVatNumber: (s: string) => void;

  contactName: string;
  setContactName: (s: string) => void;
  contactEmail: string;
  setContactEmail: (s: string) => void;
  contactPhone: string;
  setContactPhone: (s: string) => void;

  reg1: string;
  setReg1: (s: string) => void;
  reg2: string;
  setReg2: (s: string) => void;
  regCity: string;
  setRegCity: (s: string) => void;
  regPostcode: string;
  setRegPostcode: (s: string) => void;
  regCountry: string;
  setRegCountry: (s: string) => void;

  site1: string;
  setSite1: (s: string) => void;
  site2: string;
  setSite2: (s: string) => void;
  siteCity: string;
  setSiteCity: (s: string) => void;
  sitePostcode: string;
  setSitePostcode: (s: string) => void;
  siteCountry: string;
  setSiteCountry: (s: string) => void;

  tankSizeL: number;
  setTankSizeL: (n: number) => void;
  monthlyL: number;
  setMonthlyL: (n: number) => void;
  marketPrice: number;
  setMarketPrice: (n: number) => void;
  cheaperBy: number;
  setCheaperBy: (n: number) => void;

  signatureName: string;
  setSignatureName: (s: string) => void;

  onSave: () => void;
}) {
  const {
    option,
    onClose,
    saving,
    fuelflowPrice,
    monthlySavings,
    capex,
    setCapex,
    companyName,
    setCompanyName,
    companyNumber,
    setCompanyNumber,
    vatNumber,
    setVatNumber,
    contactName,
    setContactName,
    contactEmail,
    setContactEmail,
    contactPhone,
    setContactPhone,
    reg1,
    setReg1,
    reg2,
    setReg2,
    regCity,
    setRegCity,
    regPostcode,
    setRegPostcode,
    regCountry,
    setRegCountry,
    site1,
    setSite1,
    site2,
    setSite2,
    siteCity,
    setSiteCity,
    sitePostcode,
    setSitePostcode,
    siteCountry,
    setSiteCountry,
    tankSizeL,
    setTankSizeL,
    monthlyL,
    setMonthlyL,
    marketPrice,
    setMarketPrice,
    cheaperBy,
    setCheaperBy,
    signatureName,
    setSignatureName,
    onSave,
  } = props;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div className="relative w-[95%] max-w-4xl rounded-2xl bg-[#0B274B] border border-white/10 p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {option === "buy" ? "Buy Contract" : "Rent Contract"}
          </h3>
          <button aria-label="Close" className="rounded-lg p-2 text-white/70 hover:bg-white/10" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="mt-3 space-y-5">
          {/* Company */}
          <section className="rounded-xl border border-white/10 p-4">
            <h4 className="font-semibold mb-3">Company details</h4>
            <div className={row}>
              <div>
                <label className={label}>Company name</label>
                <input className={input} value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </div>
              <div>
                <label className={label}>Company number</label>
                <input className={input} value={companyNumber} onChange={(e) => setCompanyNumber(e.target.value)} />
              </div>
              <div>
                <label className={label}>VAT number</label>
                <input className={input} value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} />
              </div>
            </div>
          </section>

          {/* Contact */}
          <section className="rounded-xl border border-white/10 p-4">
            <h4 className="font-semibold mb-3">Primary contact</h4>
            <div className={row}>
              <div>
                <label className={label}>Name</label>
                <input className={input} value={contactName} onChange={(e) => setContactName(e.target.value)} />
              </div>
              <div>
                <label className={label}>Email</label>
                <input className={input} value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
              </div>
              <div>
                <label className={label}>Phone</label>
                <input className={input} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
              </div>
            </div>
          </section>

          {/* Registered address */}
          <section className="rounded-xl border border-white/10 p-4">
            <h4 className="font-semibold mb-3">Registered / billing address</h4>
            <div className={row}>
              <div>
                <label className={label}>Address line 1</label>
                <input className={input} value={reg1} onChange={(e) => setReg1(e.target.value)} />
              </div>
              <div>
                <label className={label}>Address line 2</label>
                <input className={input} value={reg2} onChange={(e) => setReg2(e.target.value)} />
              </div>
              <div>
                <label className={label}>City</label>
                <input className={input} value={regCity} onChange={(e) => setRegCity(e.target.value)} />
              </div>
              <div>
                <label className={label}>Postcode</label>
                <input className={input} value={regPostcode} onChange={(e) => setRegPostcode(e.target.value)} />
              </div>
              <div>
                <label className={label}>Country</label>
                <input className={input} value={regCountry} onChange={(e) => setRegCountry(e.target.value)} />
              </div>
            </div>
          </section>

          {/* Site address */}
          <section className="rounded-xl border border-white/10 p-4">
            <h4 className="font-semibold mb-3">Site / delivery address</h4>
            <div className={row}>
              <div>
                <label className={label}>Address line 1</label>
                <input className={input} value={site1} onChange={(e) => setSite1(e.target.value)} />
              </div>
              <div>
                <label className={label}>Address line 2</label>
                <input className={input} value={site2} onChange={(e) => setSite2(e.target.value)} />
              </div>
              <div>
                <label className={label}>City</label>
                <input className={input} value={siteCity} onChange={(e) => setSiteCity(e.target.value)} />
              </div>
              <div>
                <label className={label}>Postcode</label>
                <input className={input} value={sitePostcode} onChange={(e) => setSitePostcode(e.target.value)} />
              </div>
              <div>
                <label className={label}>Country</label>
                <input className={input} value={siteCountry} onChange={(e) => setSiteCountry(e.target.value)} />
              </div>
            </div>
          </section>

          {/* Tank & ROI */}
          <section className="rounded-xl border border-white/10 p-4">
            <h4 className="font-semibold mb-3">Tank & ROI</h4>
            <div className={row}>
              <div>
                <label className={label}>Tank size (L)</label>
                <input className={input} type="number" min={0} value={tankSizeL} onChange={(e) => props.setTankSizeL(Number(e.target.value))} />
              </div>
              <div>
                <label className={label}>Monthly consumption (L)</label>
                <input className={input} type="number" min={0} value={monthlyL} onChange={(e) => props.setMonthlyL(Number(e.target.value))} />
              </div>
              <div>
                <label className={label}>Market price (GBP/L)</label>
                <input className={input} type="number" min={0} step="0.01" value={marketPrice} onChange={(e) => props.setMarketPrice(Number(e.target.value))} />
              </div>
              <div>
                <label className={label}>FuelFlow cheaper by (GBP/L)</label>
                <input className={input} type="number" min={0} step="0.01" value={cheaperBy} onChange={(e) => props.setCheaperBy(Number(e.target.value))} />
              </div>
              {option === "buy" && (
                <div>
                  <label className={label}>Capex (GBP)</label>
                  <input className={input} type="number" min={0} step="1" value={capex} onChange={(e) => setCapex(Number(e.target.value))} />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <Metric title="FuelFlow price" value={gbp(fuelflowPrice) + " / L"} />
              <Metric title="Est. monthly savings" value={gbp(monthlySavings)} />
              <Metric title="Capex required" value={option === "rent" ? "£0 (rental)" : gbp(capex)} />
            </div>
          </section>

          {/* Signature */}
          <section className="rounded-xl border border-white/10 p-4">
            <h4 className="font-semibold mb-3">Signature</h4>
            <label className={label}>Type your full legal name as signature</label>
            <input className={input} value={signatureName} onChange={(e) => setSignatureName(e.target.value)} placeholder="Jane Smith" />
          </section>
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button className={`${btn} ${btnGhost}`} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className={`${btn} ${btnPrimary}`} onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Sign & Save"}
          </button>
        </div>
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

function gbp(n: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

