// src/pages/documents.tsx
// src/pages/documents.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

/* =========================
   Setup / types
   ========================= */

type TankOption = "buy" | "rent";
type ContractStatus = "draft" | "signed" | "approved" | "cancelled";

const TERMS_VERSION = "v1.1";

type ContractRow = {
  id: string;
  tank_option: TankOption;
  status: ContractStatus;
  signed_at: string | null;
  approved_at: string | null;
  created_at: string;
  email: string | null;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

/* =========================
   UI tokens
   ========================= */

const card =
  "rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-5 py-4 shadow transition";
const button =
  "rounded-2xl px-4 py-2 font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed";
const buttonPrimary = "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400 active:bg-yellow-300";
const buttonGhost = "bg-white/10 hover:bg-white/15 text-white border border-white/10";
const input =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none focus:ring focus:ring-yellow-500/30";
const label = "block text-sm font-medium text-white/80 mb-1";
const row = "grid grid-cols-1 md:grid-cols-2 gap-4";

/* =========================
   Helpers
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

function shortDate(d?: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return "—";
  }
}

/* =========================
   Page
   ========================= */

export default function DocumentsPage() {
  // auth email
  const [userEmail, setUserEmail] = useState<string>("");

  // terms
  const [termsAcceptedAt, setTermsAcceptedAt] = useState<string | null>(null);
  const termsOk = !!termsAcceptedAt;

  // contracts
  const [buyContract, setBuyContract] = useState<ContractRow | null>(null);
  const [rentContract, setRentContract] = useState<ContractRow | null>(null);

  // ROI / wizard
  const [showCalc, setShowCalc] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardOption, setWizardOption] = useState<TankOption>("buy");
  const [savingContract, setSavingContract] = useState(false);

  // calculator fields
  const [tankSizeL, setTankSizeL] = useState<number>(5000);
  const [monthlyConsumptionL, setMonthlyConsumptionL] = useState<number>(10000);
  const [marketPrice, setMarketPrice] = useState<number>(1.35);
  const [cheaperBy, setCheaperBy] = useState<number>(0.09);

  // signature + minimal contact
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [signatureName, setSignatureName] = useState("");
  // business / site (optional)
  const [companyName, setCompanyName] = useState("");
  const [companyNumber, setCompanyNumber] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [siteAddress1, setSiteAddress1] = useState("");
  const [siteAddress2, setSiteAddress2] = useState("");
  const [siteCity, setSiteCity] = useState("");
  const [sitePostcode, setSitePostcode] = useState("");

  // computed
  const fuelflowPrice = useMemo(
    () => Math.max(0, (marketPrice || 0) - (cheaperBy || 0)),
    [marketPrice, cheaperBy]
  );
  const estMonthlySavings = useMemo(
    () => Math.max(0, (monthlyConsumptionL || 0) * (cheaperBy || 0)),
    [monthlyConsumptionL, cheaperBy]
  );
  const capexRequired = useMemo(
    () => (wizardOption === "buy" ? 12000 : 0),
    [wizardOption]
  );

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const emailLower = (auth?.user?.email || "").toLowerCase();
      if (!emailLower) {
        window.location.href = "/login";
        return;
      }
      setUserEmail(emailLower);
      await refreshTerms(emailLower);
      await refreshContracts(emailLower);
    })();
  }, []);

  async function refreshTerms(emailLower: string) {
    const { data } = await supabase
      .from("terms_acceptances")
      .select("accepted_at")
      .eq("email", emailLower)
      .eq("version", TERMS_VERSION)
      .order("accepted_at", { ascending: false })
      .limit(1);
    setTermsAcceptedAt(data?.[0]?.accepted_at ?? null);
  }

  async function refreshContracts(emailLower: string) {
    const { data } = await supabase
      .from("contracts")
      .select("id,tank_option,status,signed_at,approved_at,created_at,email")
      .eq("email", emailLower)
      .order("created_at", { ascending: false });

    const rows = (data || []) as ContractRow[];
    const latestBuy =
      rows.find((r) => r.tank_option === "buy" && (r.status === "approved" || r.status === "signed")) ??
      rows.find((r) => r.tank_option === "buy") ??
      null;

    const latestRent =
      rows.find((r) => r.tank_option === "rent" && (r.status === "approved" || r.status === "signed")) ??
      rows.find((r) => r.tank_option === "rent") ??
      null;

    setBuyContract(latestBuy);
    setRentContract(latestRent);
  }

  function openTerms() {
    const ret = `/terms?return=/documents`;
    window.location.href = ret;
  }

  async function signAndSaveContract(option: TankOption) {
    if (!fullName.trim()) {
      alert("Please enter your full name before signing.");
      return;
    }
    if (!signatureName.trim()) {
      alert("Type your full legal name as signature.");
      return;
    }
    setSavingContract(true);
    try {
      // minimal, schema-safe payload
      const payload: Record<string, any> = {
        tank_option: option,
        customer_name: fullName,
        email: userEmail,
        address_line1: siteAddress1 || null,
        address_line2: siteAddress2 || null,
        city: siteCity || null,
        postcode: sitePostcode || null,
        tank_size_l: tankSizeL || null,
        monthly_consumption_l: monthlyConsumptionL || null,
        market_price_gbp_l: marketPrice || null,
        fuelflow_price_gbp_l: fuelflowPrice || null,
        est_monthly_savings_gbp: estMonthlySavings || null,
        terms_version: TERMS_VERSION,
        signature_name: signatureName,
        signed_at: new Date().toISOString(),
        status: "signed",
      };

      const { error } = await supabase.from("contracts").insert(payload);
      if (error) throw error;

      await refreshContracts(userEmail);
      setShowWizard(false);
      alert(
        option === "rent"
          ? "Rental contract signed. An admin will approve it shortly."
          : "Purchase contract signed. You're good to order."
      );
    } catch (e: any) {
      alert(e?.message || "Failed to save contract.");
    } finally {
      setSavingContract(false);
    }
  }

  const buyStatus = !buyContract
    ? "Not signed"
    : buyContract.status === "approved"
    ? "Active"
    : "Signed";

  const rentStatus = !rentContract
    ? "Not signed"
    : rentContract.status === "approved"
    ? "Active"
    : "Signed (awaiting approval)";

  return (
    <main className="min-h-screen bg-[#061B34] text-white pb-24">
      <div className="mx-auto w-full max-w-5xl px-4 pt-8">
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

        {/* Requirements overview */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className={card}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Terms &amp; Conditions</h3>
              <span
                className={`inline-flex items-center text-xs font-medium px-2 py-1 rounded-full ${
                  termsOk ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"
                }`}
              >
                {termsOk ? "accepted" : "missing"}
              </span>
            </div>
            <p className="mt-2 text-white/70 text-sm">
              You must accept the latest Terms before ordering.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button className={`${button} ${buttonGhost}`} onClick={openTerms}>
                {termsOk ? "View Terms" : "Read & accept"}
              </button>
              {termsAcceptedAt && (
                <span className="text-xs text-white/60">Accepted: {shortDate(termsAcceptedAt)}</span>
              )}
            </div>
          </div>

          <div className={card}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Buy Contract</h3>
              <span
                className={`inline-flex items-center text-xs font-medium px-2 py-1 rounded-full ${
                  buyStatus.startsWith("Active")
                    ? "bg-green-500/20 text-green-300"
                    : buyStatus.startsWith("Signed")
                    ? "bg-yellow-500/20 text-yellow-300"
                    : "bg-white/10 text-white/80"
                }`}
              >
                {buyStatus}
              </span>
            </div>
            <p className="mt-2 text-white/70 text-sm">
              For purchase agreements: a signed contract is enough to order.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className={`${button} ${buttonGhost}`}
                onClick={() => {
                  setWizardOption("buy");
                  setShowCalc(true);
                }}
              >
                ROI / Calculator
              </button>
              <button
                className={`${button} ${buttonPrimary}`}
                onClick={() => {
                  setWizardOption("buy");
                  setShowWizard(true);
                }}
              >
                {buyContract ? "Update / Resign" : "Start Buy Contract"}
              </button>
            </div>
          </div>

          <div className={card}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Rent Contract</h3>
              <span
                className={`inline-flex items-center text-xs font-medium px-2 py-1 rounded-full ${
                  rentStatus.startsWith("Active")
                    ? "bg-green-500/20 text-green-300"
                    : rentStatus.startsWith("Signed")
                    ? "bg-yellow-500/20 text-yellow-300"
                    : "bg-white/10 text-white/80"
                }`}
              >
                {rentStatus}
              </span>
            </div>
            <p className="mt-2 text-white/70 text-sm">
              Rental agreements require **admin approval** after signing.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className={`${button} ${buttonGhost}`}
                onClick={() => {
                  setWizardOption("rent");
                  setShowCalc(true);
                }}
              >
                ROI / Calculator
              </button>
              <button
                className={`${button} ${buttonPrimary}`}
                onClick={() => {
                  setWizardOption("rent");
                  setShowWizard(true);
                }}
              >
                {rentContract ? "Update / Resign" : "Start Rent Contract"}
              </button>
            </div>
          </div>
        </section>

        {/* Info */}
        <div className="text-sm text-white/60 mb-8">
          <b>Ordering unlocks</b> when Terms are accepted and either a <b>Buy</b> contract is
          signed or a <b>Rent</b> contract is approved.
        </div>
      </div>

      {/* ROI modal */}
      {showCalc && (
        <Modal onClose={() => setShowCalc(false)} title="Savings Calculator">
          <EstimateBanner />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-4">
            <Metric title="FuelFlow price" value={`${GBP(fuelflowPrice)} / L`} />
            <Metric title="Est. monthly savings" value={GBP(estMonthlySavings)} />
            <Metric
              title="Capex required"
              value={wizardOption === "rent" ? "£0 (rental)" : GBP(capexRequired)}
            />
          </div>
          <div className={row}>
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
          <div className="mt-6 flex justify-end gap-3">
            <button className={`${button} ${buttonGhost}`} onClick={() => setShowCalc(false)}>
              Close
            </button>
            <button
              className={`${button} ${buttonPrimary}`}
              onClick={() => {
                setShowCalc(false);
                setShowWizard(true);
              }}
            >
              Continue to Contract
            </button>
          </div>
        </Modal>
      )}

      {/* Wizard modal */}
      {showWizard && (
        <Modal
          onClose={() => {
            if (!savingContract) setShowWizard(false);
          }}
          title={`Start ${wizardOption === "buy" ? "Purchase" : "Rental"} Contract`}
        >
          <EstimateBanner />
          <Wizard>
            <Wizard.Step title="Contact">
              <div className={row}>
                <Field label="Full name">
                  <input className={input} value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </Field>
                <Field label="Phone">
                  <input className={input} value={phone} onChange={(e) => setPhone(e.target.value)} />
                </Field>
                <Field label="Email (from login)" >
                  <input className={input} value={userEmail} readOnly />
                </Field>
              </div>
            </Wizard.Step>

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
    </main>
  );
}

/* =========================
   Reusable small components
   ========================= */

function Field({ label: l, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={label}>{l}</label>
      {children}
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

interface WizardStepProps { title?: string; children: React.ReactNode; }
interface WizardProps {
  children: React.ReactElement<WizardStepProps> | React.ReactElement<WizardStepProps>[];
}
type WizardComponent = React.FC<WizardProps> & { Step: React.FC<WizardStepProps>; };

const Wizard: WizardComponent = ({ children }) => {
  const steps = React.Children.toArray(children) as React.ReactElement<WizardStepProps>[];
  const [idx, setIdx] = useState(0);
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {steps.map((el, i) => (
          <div
            key={i}
            className={`px-3 py-1 rounded-lg text-sm border ${
              i === idx ? "bg-white/15 border-white/20" : "bg-white/8 border-white/12"
            }`}
          >
            {el.props.title ?? `Step ${i + 1}`}
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-white/10 bg-white/4 p-4">{steps[idx]}</div>
      <div className="mt-3 flex justify-between">
        <button className={`${button} ${buttonGhost}`} onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0}>
          Back
        </button>
        <button
          className={`${button} ${buttonPrimary}`}
          onClick={() => setIdx(Math.min(steps.length - 1, idx + 1))}
          disabled={idx === steps.length - 1}
        >
          Next
        </button>
      </div>
    </div>
  );
};
Wizard.Step = function Step({ children }: WizardStepProps) { return <>{children}</>; };

