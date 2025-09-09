// src/pages/documents.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

/* =========================
   Types
   ========================= */
type TankOption = "buy" | "rent";
type ContractStatus = "draft" | "signed" | "approved" | "cancelled";

type ContractRow = {
  id: string;
  email: string | null;
  tank_option: TankOption;
  status: ContractStatus;
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
   Supabase
   ========================= */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

/* =========================
   UI tokens
   ========================= */
const uiBtn = "rounded-2xl px-4 py-2 font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed";
const uiBtnPrimary = "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400 active:bg-yellow-300";
const uiBtnGhost = "bg-white/10 hover:bg-white/15 text-white border border-white/10";
const uiLabel = "block text-sm font-medium text-white/80 mb-1";
const uiInput =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none focus:ring focus:ring-yellow-500/30";
const uiRow = "grid grid-cols-1 md:grid-cols-2 gap-4";

/* =========================
   Helpers
   ========================= */
const TERMS_VERSION = "v1.1";
const TERMS_KEY = (email: string) => `terms:${TERMS_VERSION}:${email}`;

function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}
function hasAny(rows: ContractRow[], option: TankOption): boolean {
  return rows?.some((r) => r.tank_option === option) ?? false;
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
  const [authEmail, setAuthEmail] = useState<string>("");

  // statuses
  const [acceptedAt, setAcceptedAt] = useState<string | null>(null);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [activeBuy, setActiveBuy] = useState(false);
  const [activeRent, setActiveRent] = useState(false);
  const [rentAwaitingApproval, setRentAwaitingApproval] = useState<ContractRow | null>(null);

  // PDF URLs for signed contracts
  const [pdfMap, setPdfMap] = useState<Record<string, string>>({}); // id -> url

  // Modals
  const [showTerms, setShowTerms] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardOption, setWizardOption] = useState<TankOption>("buy");
  const [savingContract, setSavingContract] = useState(false);

  // Wizard fields (kept minimal here; same as before)
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyNumber, setCompanyNumber] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [siteAddress1, setSiteAddress1] = useState("");
  const [siteAddress2, setSiteAddress2] = useState("");
  const [siteCity, setSiteCity] = useState("");
  const [sitePostcode, setSitePostcode] = useState("");
  const [signatureName, setSignatureName] = useState("");

  const [tankSizeL, setTankSizeL] = useState<number>(5000);
  const [monthlyConsumptionL, setMonthlyConsumptionL] = useState<number>(10000);
  const [marketPrice, setMarketPrice] = useState<number>(1.35);
  const [cheaperBy, setCheaperBy] = useState<number>(0.09);

  const fuelflowPrice = Math.max(0, (marketPrice || 0) - (cheaperBy || 0));
  const estMonthlySavings = Math.max(0, (monthlyConsumptionL || 0) * (cheaperBy || 0));
  const estPaybackMonths =
    fuelflowPrice > 0 && estMonthlySavings > 0 ? Math.round((12000 / estMonthlySavings) * 10) / 10 : null;

  /* ---------- auth ---------- */
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const em = (data?.user?.email || "").toLowerCase();
      if (!em) {
        window.location.href = "/login";
        return;
      }
      setAuthEmail(em);
      setEmail(em);
    })();
  }, []);

  /* ---------- load statuses ---------- */
  async function refreshAll() {
    if (!authEmail) return;

    // terms
    const cached = localStorage.getItem(TERMS_KEY(authEmail));
    if (cached === "1") {
      setAcceptedAt("cached");
    } else {
      const { data: tr } = await supabase
        .from("terms_acceptances")
        .select("accepted_at,version")
        .eq("email", authEmail)
        .eq("version", TERMS_VERSION)
        .order("accepted_at", { ascending: false })
        .limit(1);
      setAcceptedAt(tr?.[0]?.accepted_at ?? null);
      if (tr?.[0]?.accepted_at) {
        localStorage.setItem(TERMS_KEY(authEmail), "1");
      }
    }

    // contracts
    const { data } = await supabase
      .from("contracts")
      .select(
        "id,email,tank_option,status,customer_name,created_at,approved_at,signed_at,tank_size_l,monthly_consumption_l,fuelflow_price_gbp_l,est_monthly_savings_gbp,est_payback_months"
      )
      .eq("email", authEmail)
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

    // fetch PDFs for any signed/approved contracts
    const idsNeedingPdf = rows
      .filter((r) => r.status === "signed" || r.status === "approved")
      .map((r) => r.id);
    if (idsNeedingPdf.length) {
      const mapUpdate: Record<string, string> = {};
      for (const id of idsNeedingPdf) {
        const url = await getContractPdfUrl(id);
        if (url) mapUpdate[id] = url;
      }
      setPdfMap((prev) => ({ ...prev, ...mapUpdate }));
    }
  }

  useEffect(() => {
    refreshAll();
  }, [authEmail]);

  // Listen for localStorage changes from the Terms iframe
  useEffect(() => {
    function onStorage(ev: StorageEvent) {
      if (ev.key === TERMS_KEY(authEmail) && ev.newValue === "1") {
        refreshAll();
        setShowTerms(false);
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [authEmail]);

  /* ---------- PDF helper ---------- */
  async function getContractPdfUrl(contractId: string): Promise<string | null> {
    try {
      // 1) Try public URL fast-path
      const publicRes = supabase.storage.from("contracts").getPublicUrl(`${contractId}.pdf`);
      if (publicRes?.data?.publicUrl) return publicRes.data.publicUrl;

      // 2) Signed URL (10 min) if bucket is private
      const signedRes = await supabase.storage.from("contracts").createSignedUrl(`${contractId}.pdf`, 600);
      if (signedRes?.data?.signedUrl) return signedRes.data.signedUrl;
    } catch {
      // ignore
    }
    // 3) Fallback route (implement server-side if needed)
    return `/api/contracts/${contractId}/pdf`;
  }

  /* ---------- actions ---------- */
  const hasAccepted = !!acceptedAt;

  function openTermsModal() {
    setShowTerms(true);
  }

  async function signAndSaveContract(option: TankOption) {
    if (!authEmail) {
      alert("Missing authenticated email. Please log in again.");
      return;
    }
    if (!fullName.trim()) {
      alert("Please enter your full name first (in the wizard).");
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
      email: authEmail,
      address_line1: null as any,
      address_line2: null as any,
      city: null as any,
      postcode: null as any,
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
      receiptEmail: email,
    };

    try {
      setSavingContract(true);

      let { error } = await supabase.from("contracts").insert({ ...base, extra: extraPayload } as any);
      if (error && /extra.*does not exist/i.test(error.message || "")) {
        const retry = await supabase.from("contracts").insert(base as any);
        if (retry.error) throw retry.error;
      } else if (error) {
        if (/duplicate|already exists|unique/i.test(error.message)) {
          alert("You already have an active contract of this type.");
        } else {
          throw error;
        }
      }

      await refreshAll();
      setShowWizard(false);

      if (option === "buy") {
        window.location.href = "/order";
      } else {
        alert("Rental contract signed — waiting for admin approval.");
      }
    } catch (e: any) {
      alert(e?.message || "Failed to save contract.");
    } finally {
      setSavingContract(false);
    }
  }

  /* ---------- render ---------- */
  return (
    <main className="min-h-screen bg-[#061B34] text-white pb-28">
      <div className="mx-auto w-full max-w-7xl px-4 pt-8">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <img src="/logo-email.png" alt="FuelFlow" width={116} height={28} className="opacity-90" />
          <h1 className="ml-2 text-2xl md:text-3xl font-bold">Documents</h1>
          <div className="ml-auto">
            <Link href="/client-dashboard" className="inline-flex items-center rounded-2xl bg-white/10 px-4 py-2 hover:bg-white/15">
              ← Back to dashboard
            </Link>
          </div>
        </div>

        {/* Tiles row */}
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 md:p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Terms */}
            <Tile
              icon={<DocIcon />}
              title="Terms & Conditions"
              statusBadge={hasAccepted ? <Badge tone="ok">Accepted</Badge> : <Badge tone="warn">Missing</Badge>}
              subtitle={
                hasAccepted
                  ? `Accepted · ${acceptedAt === "cached" ? new Date().toLocaleDateString() : shortDate(acceptedAt)}`
                  : "You must accept before ordering"
              }
              actionLabel={hasAccepted ? "View" : "Read & accept"}
              onAction={openTermsModal}
              footer={null}
            />

            {/* Buy */}
            <Tile
              icon={<ShieldIcon />}
              title="Buy contract"
              statusBadge={activeBuy ? <Badge tone="ok">Active</Badge> : hasAny(contracts, "buy") ? <Badge tone="warn">Signed</Badge> : <Badge tone="warn">Not signed</Badge>}
              subtitle={activeBuy ? "Active — order anytime" : "Sign once — then order anytime"}
              actionLabel={activeBuy ? "Active" : "Manage"}
              onAction={() => {
                setWizardOption("buy");
                setShowWizard(true);
              }}
              disabled={activeBuy}
              tooltip={activeBuy ? "Buy contract already active" : ""}
              footer={
                (() => {
                  const c = contracts.find((r) => r.tank_option === "buy" && (r.status === "signed" || r.status === "approved"));
                  const href = c ? pdfMap[c.id] : null;
                  return c && href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex text-sm underline decoration-yellow-400 underline-offset-2">
                      Download signed PDF
                    </a>
                  ) : null;
                })()
              }
            />

            {/* Rent */}
            <Tile
              icon={<BuildingIcon />}
              title="Rent contract"
              statusBadge={
                activeRent ? (
                  <Badge tone="ok">Active</Badge>
                ) : rentAwaitingApproval ? (
                  <Badge tone="warn">Signed</Badge>
                ) : (
                  <Badge tone="warn">Not signed</Badge>
                )
              }
              subtitle={activeRent ? "Active — order anytime" : rentAwaitingApproval ? "Signed · awaiting approval" : "Needs admin approval after signing"}
              actionLabel={
                activeRent ? "Active" : rentAwaitingApproval ? "Awaiting approval" : "Start"
              }
              onAction={() => {
                setWizardOption("rent");
                setShowWizard(true);
              }}
              disabled={activeRent || !!rentAwaitingApproval}
              tooltip={
                activeRent
                  ? "Rent contract already active"
                  : rentAwaitingApproval
                  ? "Waiting for admin approval"
                  : ""
              }
              footer={
                (() => {
                  const c = contracts.find((r) => r.tank_option === "rent" && (r.status === "signed" || r.status === "approved"));
                  const href = c ? pdfMap[c.id] : null;
                  return c && href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex text-sm underline decoration-yellow-400 underline-offset-2">
                      Download signed PDF
                    </a>
                  ) : null;
                })()
              }
            />
          </div>

          {/* Nudge to order */}
          {hasAccepted && (activeBuy || activeRent) && (
            <div className="mt-8 flex justify-center">
              <Link href="/order" className={cx(uiBtn, uiBtnPrimary, "px-6 py-3 text-base")}>
                Continue to Order
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Terms modal (iframe) */}
      {showTerms && (
        <Modal title="Terms & Conditions" onClose={() => setShowTerms(false)}>
          <p className="text-sm text-white/60 mb-3">
            Read and accept the latest Terms. Once accepted, this window will close automatically.
          </p>
          <div className="rounded-xl overflow-hidden border border-white/10 bg-[#0B274B]">
            <iframe
              title="Terms"
              src={`/terms?return=/documents&email=${encodeURIComponent(authEmail)}`}
              className="w-full"
              style={{ height: "70vh" }}
            />
          </div>
        </Modal>
      )}

      {/* Contract wizard modal (unchanged behavior) */}
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
              <div className={uiRow}>
                <Field label="Full name">
                  <input className={uiInput} value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </Field>
                <Field label="Phone">
                  <input className={uiInput} value={phone} onChange={(e) => setPhone(e.target.value)} />
                </Field>
                <Field label="Email (receipt)">
                  <input className={uiInput} value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
              </div>
            </Wizard.Step>

            <Wizard.Step title="Business">
              <div className={uiRow}>
                <Field label="Company name">
                  <input className={uiInput} value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                </Field>
                <Field label="Company number">
                  <input className={uiInput} value={companyNumber} onChange={(e) => setCompanyNumber(e.target.value)} />
                </Field>
                <Field label="VAT number">
                  <input className={uiInput} value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} />
                </Field>
              </div>
            </Wizard.Step>

            <Wizard.Step title="Site & Tank">
              <div className={uiRow}>
                <Field label="Site address line 1">
                  <input className={uiInput} value={siteAddress1} onChange={(e) => setSiteAddress1(e.target.value)} />
                </Field>
                <Field label="Site address line 2">
                  <input className={uiInput} value={siteAddress2} onChange={(e) => setSiteAddress2(e.target.value)} />
                </Field>
                <Field label="Site city">
                  <input className={uiInput} value={siteCity} onChange={(e) => setSiteCity(e.target.value)} />
                </Field>
                <Field label="Site postcode">
                  <input className={uiInput} value={sitePostcode} onChange={(e) => setSitePostcode(e.target.value)} />
                </Field>
                <Field label="Tank size (L)">
                  <input className={uiInput} type="number" min={0} value={tankSizeL} onChange={(e) => setTankSizeL(Number(e.target.value))} />
                </Field>
                <Field label="Monthly consumption (L)">
                  <input className={uiInput} type="number" min={0} value={monthlyConsumptionL} onChange={(e) => setMonthlyConsumptionL(Number(e.target.value))} />
                </Field>
                <Field label="Market price (GBP/L)">
                  <input className={uiInput} type="number" min={0} step="0.01" value={marketPrice} onChange={(e) => setMarketPrice(Number(e.target.value))} />
                </Field>
                <Field label="FuelFlow cheaper by (GBP/L)">
                  <input className={uiInput} type="number" min={0} step="0.01" value={cheaperBy} onChange={(e) => setCheaperBy(Number(e.target.value))} />
                </Field>
              </div>
            </Wizard.Step>

            <Wizard.Step title="Signature">
              <div className="mt-4">
                <label className={uiLabel}>Type your full legal name as signature</label>
                <input
                  className={uiInput}
                  placeholder="Jane Smith"
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                />
              </div>

              <div className="mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="text-white/60 text-sm">
                  By signing you agree to the Terms and the figures above are estimates.
                </div>
                <div className="flex gap-3">
                  <button className={cx(uiBtn, uiBtnGhost)} disabled={savingContract} onClick={() => setShowWizard(false)}>
                    Cancel
                  </button>
                  <button className={cx(uiBtn, uiBtnPrimary)} disabled={savingContract} onClick={() => signAndSaveContract(wizardOption)}>
                    {savingContract ? "Saving…" : "Sign & Save"}
                  </button>
                </div>
              </div>
            </Wizard.Step>
          </Wizard>
        </Modal>
      )}

      <SiteFooter />
    </main>
  );
}

/* =========================
   Components
   ========================= */
function Tile(props: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  statusBadge: React.ReactNode;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
  tooltip?: string;
  footer?: React.ReactNode;
}) {
  const { icon, title, subtitle, statusBadge, actionLabel, onAction, disabled, tooltip, footer } = props;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 opacity-90">{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-lg">{title}</h3>
            {statusBadge}
          </div>
          <div className="text-sm text-white/70 mt-1">{subtitle}</div>
          <button className={cx(uiBtn, uiBtnGhost, "mt-3")} onClick={onAction} disabled={disabled} title={tooltip}>
            {actionLabel}
          </button>
          {footer}
        </div>
      </div>
    </div>
  );
}

function Badge({ tone, children }: { tone: "ok" | "warn"; children: React.ReactNode }) {
  const cls = tone === "ok" ? "bg-emerald-500/15 text-emerald-300" : "bg-yellow-500/15 text-yellow-300";
  return <span className={cx("text-xs rounded-full px-2 py-0.5", cls)}>{children}</span>;
}

function Field({ label: l, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={uiLabel}>{l}</label>
      {children}
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
              className={`px-3 py-1 rounded-lg text-sm border ${i === idx ? "bg-white/15 border-white/20" : "bg-white/8 border-white/12"}`}
            >
              {title}
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/4 p-4">{steps[idx]}</div>

      <div className="mt-3 flex justify-between">
        <button className={cx(uiBtn, uiBtnGhost)} onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0} type="button">
          Back
        </button>
        <button
          className={cx(uiBtn, uiBtnPrimary)}
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

/* Footer */
function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-white/10 bg-[#121212]">
      <div className="mx-auto max-w-7xl px-4 py-6 flex flex-wrap items-center gap-6 text-sm text-white/80">
        <Link href="/legal/terms" className="hover:underline">
          Terms of use
        </Link>
        <span className="opacity-40">|</span>
        <Link href="/legal/privacy" className="hover:underline">
          Privacy policy
        </Link>
        <span className="opacity-40">|</span>
        <Link href="/legal/cookies" className="hover:underline">
          Cookie policy
        </Link>
        <span className="opacity-40">|</span>
        <Link href="/legal/cookies/manage" className="hover:underline">
          Manage cookies
        </Link>
        <div className="ml-auto opacity-60">© {new Date().getFullYear()} FuelFlow</div>
      </div>
    </footer>
  );
}

/* Tiny icons */
function DocIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className="text-white/80">
      <path fill="currentColor" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm0 0v6h6" opacity=".6" />
      <path fill="currentColor" d="M8 13h8v2H8zm0-4h5v2H8zm0 8h8v2H8z" />
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

