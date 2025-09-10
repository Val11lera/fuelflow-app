// src/pages/documents.tsx
// src/pages/documents.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser, publicFileUrl, PDF_BUCKET } from "@/lib/supabaseClient";

/* =========================
   Types
   ========================= */
type TankOption = "buy" | "rent";
type Status = "draft" | "signed" | "approved" | "cancelled";

type ContractRow = {
  id: string;
  email: string | null;
  tank_option: TankOption;
  status: Status;
  customer_name?: string | null;
  created_at?: string | null;
  approved_at?: string | null;
  signed_at?: string | null;
  signed_pdf_path?: string | null;
  approved_pdf_path?: string | null;
};

const TERMS_VERSION = "v1.1";

/* =========================
   UI tokens
   ========================= */
const uiPage = "min-h-screen bg-[#061B34] text-white";
const uiWrap = "mx-auto w-full max-w-6xl px-4 py-8";
const uiCard = "rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5 shadow";
const uiBadge = "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold";
const uiBtn =
  "inline-flex items-center justify-center rounded-2xl px-4 py-2 font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed";
const uiBtnPrimary = "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400 active:bg-yellow-300";
const uiBtnGhost = "bg-white/10 hover:bg-white/15 text-white border border-white/10";
const uiBtnSoft = "bg-white/8 border border-white/10 text-white hover:bg-white/12";
const uiHeading = "text-3xl font-bold";
const uiRow = "grid grid-cols-1 md:grid-cols-3 gap-5";
const uiPill = (tone: "ok" | "warn" | "info") =>
  `${uiBadge} ${tone === "ok" ? "bg-green-500/20 text-green-200" : tone === "warn" ? "bg-amber-500/20 text-amber-200" : "bg-white/15 text-white/80"}`;

/* =========================
   Page
   ========================= */
export default function DocumentsPage() {
  const supabase = supabaseBrowser;
  const [email, setEmail] = useState("");
  const [termsAccepted, setTermsAccepted] = useState<boolean | null>(null);
  const [termsAcceptedAt, setTermsAcceptedAt] = useState<string | null>(null);

  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Wizard
  const [showWizard, setShowWizard] = useState(false);
  const [wizardOption, setWizardOption] = useState<TankOption>("buy");
  const [saving, setSaving] = useState(false);

  // Wizard fields (kept minimal—you can add all previous fields here)
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [signatureName, setSignatureName] = useState("");

  // Prefill auth email
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const em = (data?.user?.email || "").toLowerCase();
      if (em) setEmail(em);
    })();
  }, [supabase]);

  // Load Terms + Contracts
  useEffect(() => {
    if (!email) return;
    setLoading(true);
    (async () => {
      try {
        // TERMS
        const { data: t } = await supabase
          .from("terms_acceptances")
          .select("accepted_at")
          .eq("version", TERMS_VERSION)
          .eq("email", email)
          .order("accepted_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (t?.accepted_at) {
          setTermsAccepted(true);
          setTermsAcceptedAt(t.accepted_at);
        } else {
          setTermsAccepted(false);
          setTermsAcceptedAt(null);
        }

        // CONTRACTS
        const { data: rows, error } = await supabase
          .from("contracts")
          .select(
            "id,email,tank_option,status,customer_name,created_at,approved_at,signed_at,signed_pdf_path,approved_pdf_path"
          )
          .eq("email", email)
          .order("created_at", { ascending: false });

        if (error) throw error;
        setContracts((rows ?? []) as ContractRow[]);
      } catch (e: any) {
        alert(`Failed to load contracts:\n${e?.message || e}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [email, supabase]);

  const buy = useMemo(
    () => contracts.find((c) => c.tank_option === "buy"),
    [contracts]
  );
  const rent = useMemo(
    () => contracts.find((c) => c.tank_option === "rent"),
    [contracts]
  );

  const isBuyActive = buy && (buy.status === "signed" || buy.status === "approved");
  const isRentActive = rent && rent.status === "approved";

  const canContinue = Boolean(termsAccepted && (isBuyActive || isRentActive));

  function pdfUrl(c?: ContractRow | null) {
    if (!c) return null;
    // prefer approved PDF for RENT; otherwise signed
    const path = c.approved_pdf_path || c.signed_pdf_path;
    return publicFileUrl(path);
  }

  async function openTerms() {
    // Your existing terms page; preserve the return to documents
    const ret = `/terms?return=/documents${email ? `&email=${encodeURIComponent(email)}` : ""}`;
    window.location.href = ret;
  }

  async function saveContract(option: TankOption) {
    if (!fullName.trim()) {
      alert("Please enter your full name.");
      return;
    }
    if (!signatureName.trim()) {
      alert("Please type your full legal name as signature.");
      return;
    }
    try {
      setSaving(true);
      const { error } = await supabase.from("contracts").insert({
        tank_option: option,
        contract_type: option,
        email,
        customer_name: fullName,
        extra: { phone, companyName },
        terms_version: TERMS_VERSION,
        signature_name: signatureName,
        status: "signed",
        signed_at: new Date().toISOString(),
      } as any);
      if (error) {
        if (/duplicate|unique/i.test(error.message)) {
          alert("You already have an active contract of this type.");
        } else {
          throw error;
        }
      }
      setShowWizard(false);
      // refresh
      const { data: rows } = await supabase
        .from("contracts")
        .select(
          "id,email,tank_option,status,customer_name,created_at,approved_at,signed_at,signed_pdf_path,approved_pdf_path"
        )
        .eq("email", email)
        .order("created_at", { ascending: false });
      setContracts((rows ?? []) as ContractRow[]);
      alert(option === "buy" ? "Purchase contract signed." : "Rental contract signed. Waiting approval.");
    } catch (e: any) {
      alert(e?.message || "Failed to save contract.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className={uiPage}>
      <div className={uiWrap}>
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo-email.png" alt="FuelFlow" width={116} height={28} className="opacity-90" />
            <h1 className={uiHeading}>Documents</h1>
          </div>
          <Link className={`${uiBtn} ${uiBtnSoft}`} href="/client-dashboard">
            ← Back to dashboard
          </Link>
        </div>

        {/* Cards */}
        <section className={`${uiCard} p-6`}>
          <div className={uiRow}>
            {/* Terms */}
            <Card
              title="Terms & Conditions"
              statusBadge={
                termsAccepted ? <Badge tone="ok">Accepted</Badge> : <Badge tone="warn">Missing</Badge>
              }
              subtitle={termsAccepted ? `Accepted · ${new Date(termsAcceptedAt || "").toLocaleDateString()}` : "You must accept before ordering"}
              action={
                <button className={`${uiBtn} ${uiBtnGhost}`} onClick={openTerms}>View</button>
              }
            />

            {/* Buy */}
            <Card
              title="Buy contract"
              statusBadge={
                isBuyActive ? <Badge tone="ok">Active</Badge> : <Badge tone="warn">Not signed</Badge>
              }
              subtitle={isBuyActive ? "Active — order anytime" : "Sign once — then order anytime"}
              action={
                isBuyActive ? (
                  <div className="flex items-center gap-3">
                    <span className={`${uiBtn} bg-white/10 border border-white/10 text-white cursor-default`}>Active</span>
                    <DownloadButton url={pdfUrl(buy)} />
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <button
                      className={`${uiBtn} ${uiBtnGhost}`}
                      onClick={() => { setWizardOption("buy"); setShowWizard(true); }}
                    >
                      Start
                    </button>
                    <DownloadButton url={null} />
                  </div>
                )
              }
            />

            {/* Rent */}
            <Card
              title="Rent contract"
              statusBadge={
                isRentActive ? <Badge tone="ok">Active</Badge> : <Badge tone="warn">Not signed</Badge>
              }
              subtitle={isRentActive ? "Active — order anytime" : "Needs admin approval after signing"}
              action={
                isRentActive ? (
                  <div className="flex items-center gap-3">
                    <span className={`${uiBtn} bg-white/10 border border-white/10 text-white cursor-default`}>Active</span>
                    <DownloadButton url={pdfUrl(rent)} />
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <button
                      className={`${uiBtn} ${uiBtnGhost}`}
                      onClick={() => { setWizardOption("rent"); setShowWizard(true); }}
                    >
                      Start
                    </button>
                    <DownloadButton url={null} />
                  </div>
                )
              }
            />
          </div>

          {/* Continue */}
          <div className="mt-8 flex items-center justify-center">
            <Link
              href="/order"
              className={`${uiBtn} ${uiBtnPrimary} text-base px-6 py-3`}
              aria-disabled={!canContinue}
              onClick={(e) => { if (!canContinue) { e.preventDefault(); } }}
            >
              Continue to Order
            </Link>
          </div>

          {!canContinue && (
            <p className="mt-3 text-center text-white/70">
              Accept Terms and have an active contract to continue.
            </p>
          )}
        </section>
      </div>

      {/* Wizard Modal */}
      {showWizard && (
        <Modal
          title={`Start ${wizardOption === "buy" ? "Purchase" : "Rental"} Contract`}
          onClose={() => !saving && setShowWizard(false)}
        >
          <div className="space-y-4">
            <Field label="Full name">
              <input className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                     value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </Field>
            <Field label="Phone">
              <input className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                     value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Company (optional)">
              <input className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                     value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </Field>

            <div className="rounded-xl border border-white/10 bg-gradient-to-r from-yellow-500/10 to-red-500/10 p-3 text-center">
              <span className="font-semibold text-yellow-300 tracking-wide">
                ESTIMATE ONLY — prices fluctuate daily based on market conditions
              </span>
            </div>

            <Field label="Type your full legal name as signature">
              <input className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                     placeholder="Jane Smith"
                     value={signatureName}
                     onChange={(e) => setSignatureName(e.target.value)} />
            </Field>

            <div className="flex justify-end gap-3 pt-2">
              <button className={`${uiBtn} ${uiBtnGhost}`} disabled={saving} onClick={() => setShowWizard(false)}>Cancel</button>
              <button className={`${uiBtn} ${uiBtnPrimary}`} disabled={saving} onClick={() => saveContract(wizardOption)}>
                {saving ? "Saving…" : "Sign & Save"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Footer */}
      <Footer />
    </main>
  );
}

/* =========================
   Small components
   ========================= */

function Card({
  title,
  statusBadge,
  subtitle,
  action,
}: {
  title: string;
  statusBadge?: React.ReactNode;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/3 p-5">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold flex items-center gap-3">
          {title}
          {statusBadge}
        </div>
      </div>
      {subtitle && <div className="text-white/70 text-sm mt-1">{subtitle}</div>}
      <div className="mt-4">{action}</div>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "ok" | "warn" | "info" }) {
  return <span className={uiPill(tone)}>{children}</span>;
}

function DownloadButton({ url }: { url: string | null }) {
  const enabled = Boolean(url);
  return (
    <a
      className={`${uiBtn} ${enabled ? uiBtnSoft : "bg-white/5 text-white/50 border border-white/10 cursor-not-allowed"}`}
      href={enabled ? url! : undefined}
      target={enabled ? "_blank" : undefined}
      rel="noreferrer"
      onClick={(e) => { if (!enabled) e.preventDefault(); }}
    >
      Download signed PDF
    </a>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-sm text-white/80 mb-1">{label}</div>
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

function Footer() {
  return (
    <footer className="mt-10 border-t border-white/10">
      <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-white/70 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/terms" className="hover:text-white">Terms & Conditions</Link>
          <Link href="/privacy" className="hover:text-white">Privacy policy</Link>
          <Link href="/cookies" className="hover:text-white">Cookie policy</Link>
          <Link href="/cookies/manage" className="hover:text-white">Manage cookies</Link>
        </div>
        <div>© {new Date().getFullYear()} FuelFlow</div>
      </div>
    </footer>
  );
}
