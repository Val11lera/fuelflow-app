// src/pages/documents.tsx
// /src/pages/documents.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

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
   Types
   ========================= */
type TankOption = "buy" | "rent";
type Fuel = "diesel" | "petrol";

type ContractRow = {
  id: string;
  email: string | null;
  tank_option: TankOption;
  status: "draft" | "signed" | "approved" | "cancelled";
  created_at?: string | null;
  signed_at?: string | null;
  approved_at?: string | null;
  signed_pdf_path?: string | null;
  // optional ROI fields if present in your DB:
  tank_size_l?: number | null;
  monthly_consumption_l?: number | null;
  market_price_gbp_l?: number | null;
  fuelflow_price_gbp_l?: number | null;
  est_monthly_savings_gbp?: number | null;
  est_payback_months?: number | null;
};

type TermsRow = { id: string; email: string; accepted_at: string; version: string };

/* =========================
   UI tokens
   ========================= */
const uiPanel =
  "rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-5 py-4 shadow transition";
const uiPill = "inline-flex items-center text-xs font-medium px-2 py-1 rounded-full";
const uiBtn =
  "inline-flex items-center justify-center rounded-xl px-4 py-2 font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed";
const uiBtnPrimary = "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400 active:bg-yellow-300";
const uiBtnGhost = "bg-white/10 hover:bg-white/15 text-white border border-white/10";
const badgeOk = "bg-emerald-500/15 text-emerald-300";
const badgeWarn = "bg-yellow-500/15 text-yellow-300";
const badgeGrey = "bg-white/10 text-white/70";
const subtle = "text-white/70 text-sm";
const input =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none focus:ring focus:ring-yellow-500/30";
const label = "block text-sm font-medium text-white/80 mb-1";
const row = "grid grid-cols-1 md:grid-cols-2 gap-4";

const TERMS_VERSION = "v1.1";

/* =========================
   Helpers
   ========================= */
const shortDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : "—");
const cls = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(" ");
const GBP = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n);

/* =========================
   Page
   ========================= */
export default function DocumentsPage() {
  const [email, setEmail] = useState("");
  const [terms, setTerms] = useState<TermsRow | null>(null);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Wizard state
  const [showWizard, setShowWizard] = useState(false);
  const [wizardOption, setWizardOption] = useState<TankOption>("buy");
  const [savingContract, setSavingContract] = useState(false);

  // Wizard form fields (matches your previous flow)
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyNumber, setCompanyNumber] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [siteAddress1, setSiteAddress1] = useState("");
  const [siteAddress2, setSiteAddress2] = useState("");
  const [siteCity, setSiteCity] = useState("");
  const [sitePostcode, setSitePostcode] = useState("");
  const [tankSizeL, setTankSizeL] = useState<number>(5000);
  const [monthlyConsumptionL, setMonthlyConsumptionL] = useState<number>(10000);
  const [marketPrice, setMarketPrice] = useState<number>(1.35);
  const [cheaperBy, setCheaperBy] = useState<number>(0.09);
  const [signatureName, setSignatureName] = useState("");

  // Derived ROI fields (same as you had)
  const fuelflowPrice = Math.max(0, (marketPrice || 0) - (cheaperBy || 0));
  const estMonthlySavings = Math.max(0, (monthlyConsumptionL || 0) * (cheaperBy || 0));
  const estPaybackMonths =
    fuelflowPrice > 0 && estMonthlySavings > 0 ? Math.round((12000 / estMonthlySavings) * 10) / 10 : null;

  // Load all status + prefill auth email
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: auth } = await supabase.auth.getUser();
        const em = (auth?.user?.email || "").toLowerCase();
        setEmail(em);

        const { data: t } = await supabase
          .from("terms_acceptances")
          .select("id,email,accepted_at,version")
          .eq("email", em)
          .eq("version", TERMS_VERSION)
          .order("accepted_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // also honour the original local cache if present
        if (!t && typeof window !== "undefined") {
          const cached = localStorage.getItem(`terms:${TERMS_VERSION}:${em}`);
          if (cached === "1") {
            setTerms({
              id: "local-cache",
              email: em,
              version: TERMS_VERSION,
              accepted_at: new Date().toISOString(),
            });
          } else setTerms(null);
        } else {
          setTerms((t as any) || null);
        }

        const { data: c } = await supabase
          .from("contracts")
          .select(
            "id,email,tank_option,status,created_at,signed_at,approved_at,signed_pdf_path,tank_size_l,monthly_consumption_l,market_price_gbp_l,fuelflow_price_gbp_l,est_monthly_savings_gbp,est_payback_months"
          )
          .eq("email", em)
          .order("created_at", { ascending: false });
        const rows = (c ?? []) as ContractRow[];
        setContracts(rows);

        // prefill name if you stored it in a contract previously
        const lastNamed = (rows.find((r) => !!r) as any) ?? null;
        if (lastNamed?.customer_name) setFullName(lastNamed.customer_name);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Convenience: latest buy/rent
  const latestBuy = useMemo(
    () => contracts.find((r) => r.tank_option === "buy") ?? null,
    [contracts]
  );
  const latestRent = useMemo(
    () => contracts.find((r) => r.tank_option === "rent") ?? null,
    [contracts]
  );

  // Buy active when signed or approved; Rent active only when approved
  const buyActive = latestBuy && (latestBuy.status === "signed" || latestBuy.status === "approved");
  const rentActive = latestRent && latestRent.status === "approved";
  const rentSignedPending = latestRent && latestRent.status === "signed";

  // Storage public URLs for PDFs
  const buyPdf = publicPdfUrl(latestBuy);
  const rentPdf = publicPdfUrl(latestRent);
  function publicPdfUrl(row: ContractRow | null) {
    if (!row?.signed_pdf_path) return null;
    const { data } = supabase.storage.from("contracts").getPublicUrl(row.signed_pdf_path);
    return data?.publicUrl ?? null;
    // Ensure bucket name is EXACTLY "contracts" in Supabase
  }

  async function refreshContracts() {
    const { data: c } = await supabase
      .from("contracts")
      .select(
        "id,email,tank_option,status,created_at,signed_at,approved_at,signed_pdf_path,tank_size_l,monthly_consumption_l,market_price_gbp_l,fuelflow_price_gbp_l,est_monthly_savings_gbp,est_payback_months"
      )
      .eq("email", email)
      .order("created_at", { ascending: false });
    setContracts((c ?? []) as ContractRow[]);
  }

  // Save (sign) contract from the wizard
  async function signAndSaveContract(option: TankOption) {
    if (!supabase) return;

    if (!fullName.trim()) {
      alert("Please enter your full name.");
      return;
    }
    if (!signatureName.trim()) {
      alert("Type your full legal name as signature.");
      return;
    }
    if (!terms) {
      alert("Please accept the latest Terms first.");
      return;
    }

    const base = {
      contract_type: option,
      tank_option: option,
      customer_name: fullName,
      email: email || null,
      tank_size_l: tankSizeL || null,
      monthly_consumption_l: monthlyConsumptionL || null,
      market_price_gbp_l: marketPrice || null,
      fuelflow_price_gbp_l: fuelflowPrice || null,
      est_monthly_savings_gbp: estMonthlySavings || null,
      est_payback_months: estPaybackMonths || null,
      terms_version: TERMS_VERSION,
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

      // Try insert with extra json (matches your previous behavior)
      let { error } = await supabase.from("contracts").insert({ ...base, extra: extraPayload } as any);

      // If 'extra' column doesn't exist in your DB, try without it
      if (error && /extra.*does not exist/i.test(error.message || "")) {
        const retry = await supabase.from("contracts").insert(base as any);
        if (retry.error) throw retry.error;
      } else if (error) {
        if (/duplicate|already exists|unique/i.test(error.message)) {
          alert("You already have an active/signed contract of this type.");
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

  return (
    <main className="min-h-screen bg-[#0A233F] text-white pb-28">
      <div className="mx-auto w-full max-w-6xl px-4 pt-10">
        {/* Header */}
        <div className="mb-6 flex items-center gap-2">
          <img src="/logo-email.png" alt="FuelFlow" width={116} height={28} className="opacity-90" />
          <h1 className="ml-3 text-3xl md:text-4xl font-bold">Documents</h1>
          <div className="ml-auto">
            <Link href="/client-dashboard" className={`${uiBtn} ${uiBtnGhost}`}>
              ← Back to dashboard
            </Link>
          </div>
        </div>

        {/* Cards */}
        <section className={cls(uiPanel, "px-3 py-5 md:px-6")}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Terms & Conditions */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 md:p-5">
              <div className="flex items-center gap-2">
                <DocIcon />
                <div className="text-lg font-semibold">Terms &amp; Conditions</div>
                <span className={`${uiPill} ${terms ? badgeOk : badgeWarn}`}>
                  {terms ? "Accepted" : "Missing"}
                </span>
              </div>
              <div className={`${subtle} mt-1`}>
                {terms ? `Accepted · ${shortDate(terms?.accepted_at)}` : "You must accept before ordering"}
              </div>

              <div className="mt-4">
                <Link href="/terms" className={`${uiBtn} ${uiBtnGhost}`}>
                  View
                </Link>
              </div>
            </div>

            {/* Buy contract */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 md:p-5">
              <div className="flex items-center gap-2">
                <ShieldIcon />
                <div className="text-lg font-semibold">Buy contract</div>
                <span className={`${uiPill} ${buyActive ? badgeOk : latestBuy ? badgeGrey : badgeWarn}`}>
                  {buyActive ? "Active" : latestBuy ? "Not active" : "Not signed"}
                </span>
              </div>

              <div className={`${subtle} mt-1`}>
                {buyActive
                  ? "Active — order anytime"
                  : latestBuy
                  ? `Signed · ${shortDate(latestBuy.signed_at)}`
                  : "Sign once — then order anytime"}
              </div>

              <div className="mt-4 flex items-center gap-3">
                {buyActive ? (
                  <button className={`${uiBtn} ${uiBtnGhost}`} disabled>
                    Active
                  </button>
                ) : (
                  <button
                    className={`${uiBtn} ${uiBtnGhost}`}
                    onClick={() => {
                      setWizardOption("buy");
                      setShowWizard(true);
                    }}
                    disabled={!terms}
                    title={!terms ? "Accept Terms first" : ""}
                  >
                    {latestBuy ? "Manage" : "Start"}
                  </button>
                )}

                <a
                  href={buyPdf || "#"}
                  target={buyPdf ? "_blank" : undefined}
                  className={cls(
                    uiBtn,
                    "px-3 py-2",
                    buyPdf ? uiBtnGhost : "pointer-events-none bg-white/5 text-white/40 border border-white/10"
                  )}
                >
                  Download signed PDF
                </a>
              </div>
            </div>

            {/* Rent contract */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 md:p-5">
              <div className="flex items-center gap-2">
                <BuildingIcon />
                <div className="text-lg font-semibold">Rent contract</div>
                <span className={`${uiPill} ${rentActive ? badgeOk : latestRent ? badgeGrey : badgeWarn}`}>
                  {rentActive ? "Active" : latestRent ? "Not active" : "Not signed"}
                </span>
              </div>

              <div className={`${subtle} mt-1`}>
                {rentActive
                  ? "Active — order anytime"
                  : rentSignedPending
                  ? "Signed · awaiting approval"
                  : "Needs admin approval after signing"}
              </div>

              <div className="mt-4 flex items-center gap-3">
                {rentActive ? (
                  <button className={`${uiBtn} ${uiBtnGhost}`} disabled>
                    Active
                  </button>
                ) : (
                  <button
                    className={`${uiBtn} ${uiBtnGhost}`}
                    onClick={() => {
                      setWizardOption("rent");
                      setShowWizard(true);
                    }}
                    disabled={!terms}
                    title={!terms ? "Accept Terms first" : ""}
                  >
                    {latestRent ? "Manage" : "Start"}
                  </button>
                )}

                <a
                  href={rentPdf || "#"}
                  target={rentPdf ? "_blank" : undefined}
                  className={cls(
                    uiBtn,
                    "px-3 py-2",
                    rentPdf ? uiBtnGhost : "pointer-events-none bg-white/5 text-white/40 border border-white/10"
                  )}
                >
                  Download signed PDF
                </a>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-8 text-center">
            <Link href="/order" className={`${uiBtn} ${uiBtnPrimary} text-base px-5 py-3`}>
              Continue to Order
            </Link>
          </div>
        </section>

        <Footer />
      </div>

      {/* ------------ Contract Wizard (modal) ------------ */}
      {showWizard && (
        <Modal
          title={`Start ${wizardOption === "buy" ? "Purchase" : "Rental"} Contract`}
          onClose={() => !savingContract && setShowWizard(false)}
        >
          <EstimateBanner
            fuelflowPrice={fuelflowPrice}
            estMonthlySavings={estMonthlySavings}
            estPaybackMonths={estPaybackMonths}
          />

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
                  <button className={`${uiBtn} ${uiBtnGhost}`} disabled={savingContract} onClick={() => setShowWizard(false)}>
                    Cancel
                  </button>
                  <button
                    className={`${uiBtn} ${uiBtnPrimary}`}
                    disabled={savingContract}
                    onClick={() => signAndSaveContract(wizardOption)}
                  >
                    {savingContract ? "Saving…" : "Sign & Save"}
                  </button>
                </div>
              </div>
            </Wizard.Step>
          </Wizard>
        </Modal>
      )}
    </main>
  );
}

/* =========================
   Small UI helpers
   ========================= */
function DocIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className="text-white/80">
      <path fill="currentColor" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" opacity=".6" />
      <path fill="currentColor" d="M8 9h5v2H8zm0 4h8v2H8zm0 4h8v2H8z" />
      <path fill="currentColor" d="M14 2v6h6" opacity=".6" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className="text-white/80">
      <path fill="currentColor" d="M12 2l7 4v6c0 5-3.5 9-7 10c-3.5-1-7-5-7-10V6z" opacity=".6" />
      <path fill="currentColor" d="M12 6l4 2v3c0 3.5-2.3 6.3-4 7c-1.7-.7-4-3.5-4-7V8z" />
    </svg>
  );
}
function BuildingIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className="text-white/80">
      <path fill="currentColor" d="M3 21V7l9-4l9 4v14h-7v-5h-4v5z" opacity=".6" />
      <path fill="currentColor" d="M9 11h2v2H9zm4 0h2v2h-2zM9 15h2v2H9zm4 0h2v2h-2z" />
    </svg>
  );
}
function Footer() {
  return (
    <footer className="mt-10 border-t border-white/10 pt-6 pb-2 text-white/70">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-5 text-sm">
          <Link href="/terms" className="hover:text-white">Terms &amp; Conditions</Link>
          <span className="opacity-30">|</span>
          <Link href="/privacy" className="hover:text-white">Privacy policy</Link>
          <span className="opacity-30">|</span>
          <Link href="/cookie-policy" className="hover:text-white">Cookie policy</Link>
          <span className="opacity-30">|</span>
          <Link href="/manage-cookies" className="hover:text-white">Manage cookies</Link>
        </div>
        <div className="text-xs opacity-70">© {new Date().getFullYear()} FuelFlow</div>
      </div>
    </footer>
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
function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0E2E57] p-4">
      <div className="text-white/70 text-sm">{title}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
function EstimateBanner({
  fuelflowPrice,
  estMonthlySavings,
  estPaybackMonths,
}: {
  fuelflowPrice: number;
  estMonthlySavings: number;
  estPaybackMonths: number | null;
}) {
  return (
    <div className="relative overflow-hidden mb-3 rounded-xl border border-white/10 bg-gradient-to-r from-yellow-500/10 via-orange-500/10 to-red-500/10 p-3 text-center">
      <div className="flex flex-wrap items-center justify-center gap-5 text-sm">
        <span className="font-semibold text-yellow-300 tracking-wide">ESTIMATE ONLY</span>
        <span className="text-white/80">FuelFlow price: {GBP(fuelflowPrice)} / L</span>
        <span className="text-white/80">Monthly savings: {GBP(estMonthlySavings)}</span>
        <span className="text-white/80">
          Payback: {estPaybackMonths ? `${estPaybackMonths} mo` : "—"}
        </span>
      </div>
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
        <button
          className={`${uiBtn} ${uiBtnGhost}`}
          onClick={() => setIdx(Math.max(0, idx - 1))}
          disabled={idx === 0}
          type="button"
        >
          Back
        </button>
        <button
          className={`${uiBtn} ${uiBtnPrimary}`}
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

