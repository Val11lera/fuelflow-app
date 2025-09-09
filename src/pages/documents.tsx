// src/pages/documents.tsx
// src/pages/documents.tsx
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

type ContractRow = {
  id: string;
  email: string | null;
  tank_option: TankOption;
  status: "draft" | "signed" | "approved" | "cancelled";
  created_at?: string | null;
  signed_at?: string | null;
  approved_at?: string | null;

  // Optional fields (may or may not exist in your DB)
  tank_size_l?: number | null;
  monthly_consumption_l?: number | null;
  market_price_gbp_l?: number | null;
  fuelflow_price_gbp_l?: number | null;
  est_monthly_savings_gbp?: number | null;
  est_payback_months?: number | null;

  // The download path is OPTIONAL. If you add this column later,
  // the page will automatically start showing a working link.
  signed_pdf_path?: string | null;
};

type TermsRow = {
  id: string;
  email: string | null;
  accepted_at: string;
  version: string;
};

/* =========================
   Small UI tokens
   ========================= */
const uiCard =
  "rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur px-5 py-4 shadow";
const uiBadge = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";
const uiBtn =
  "inline-flex items-center rounded-xl px-4 py-2 font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed";
const uiBtnGhost = "bg-white/10 hover:bg-white/15 border border-white/10";
const uiBtnPrimary = "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400 active:bg-yellow-300";

/* =========================
   Helpers
   ========================= */
const GBP = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n);

const prettyDate = (iso?: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return "—";
  }
};

function StatusPill({ tone, text }: { tone: "ok" | "warn" | "muted"; text: string }) {
  const map = {
    ok: "bg-emerald-500/15 text-emerald-300",
    warn: "bg-yellow-500/15 text-yellow-300",
    muted: "bg-white/10 text-white/60",
  } as const;
  return <span className={`${uiBadge} ${map[tone]}`}>{text}</span>;
}

function getPublicUrlIfAny(path?: string | null): string | null {
  if (!path) return null;
  const { data } = supabase.storage.from("contracts").getPublicUrl(path);
  return data?.publicUrl ?? null;
}

/* =========================
   Page
   ========================= */
export default function DocumentsPage() {
  const [email, setEmail] = useState<string>("");
  const [terms, setTerms] = useState<TermsRow | null>(null);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal (wizard) state
  const [showWizard, setShowWizard] = useState(false);
  const [wizardOption, setWizardOption] = useState<TankOption>("buy");
  const [saving, setSaving] = useState(false);

  // Wizard fields (simple version; expand as needed)
  const [fullName, setFullName] = useState("");
  const [signatureName, setSignatureName] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        // who am I?
        const { data: auth } = await supabase.auth.getUser();
        const em = (auth?.user?.email || "").toLowerCase();
        setEmail(em);

        // terms (latest for this version)
        const TERMS_VERSION = "v1.1";
        const { data: t } = await supabase
          .from("terms_acceptances")
          .select("id,email,accepted_at,version")
          .eq("email", em)
          .eq("version", TERMS_VERSION)
          .order("accepted_at", { ascending: false })
          .limit(1);
        setTerms((t?.[0] as TermsRow) || null);

        // contracts (select * so we don't error if columns are missing)
        const { data: rows, error } = await supabase
          .from("contracts")
          .select("*")
          .eq("email", em)
          .order("created_at", { ascending: false });

        if (error) {
          alert(`Failed to load contracts:\n${error.message}`);
        }
        setContracts((rows || []) as ContractRow[]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const buy = useMemo(
    () =>
      contracts.find((r) => r.tank_option === "buy") ||
      (null as ContractRow | null),
    [contracts]
  );
  const rent = useMemo(
    () =>
      contracts.find((r) => r.tank_option === "rent") ||
      (null as ContractRow | null),
    [contracts]
  );

  const buyActive = !!buy && (buy.status === "approved" || buy.status === "signed");
  const rentActive = !!rent && rent.status === "approved";
  const rentWaiting = !!rent && rent.status === "signed" && !rent.approved_at;

  const canContinue = !!terms && (buyActive || rentActive);

  async function openWizard(opt: TankOption) {
    setWizardOption(opt);
    setShowWizard(true);
  }

  async function saveContract() {
    if (!email) return alert("Not authenticated.");
    if (!fullName.trim()) return alert("Please enter full name.");
    if (!signatureName.trim()) return alert("Please type your legal signature.");

    const now = new Date().toISOString();

    // Minimal payload
    const base = {
      email,
      customer_name: fullName,
      phone: phone || null,
      company_name: companyName || null,
      tank_option: wizardOption,
      status: wizardOption === "buy" ? ("signed" as const) : ("signed" as const), // buy active when signed; rent needs approval
      signed_at: now,
    };

    try {
      setSaving(true);

      const { error } = await supabase.from("contracts").insert(base as any);
      if (error) throw error;

      // refresh
      const { data: rows } = await supabase
        .from("contracts")
        .select("*")
        .eq("email", email)
        .order("created_at", { ascending: false });
      setContracts((rows || []) as ContractRow[]);
      setShowWizard(false);

      if (wizardOption === "buy") {
        alert("Purchase contract signed. You can order immediately.");
      } else {
        alert("Rental contract signed. Waiting for admin approval.");
      }
    } catch (e: any) {
      alert(e?.message || "Failed to save contract.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0A223F] text-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <img src="/logo-email.png" alt="FuelFlow" width={116} height={28} className="opacity-90" />
          <h1 className="text-3xl font-bold ml-2">Documents</h1>
          <div className="ml-auto">
            <Link href="/client-dashboard" className={`${uiBtn} ${uiBtnGhost}`}>
              ← Back to dashboard
            </Link>
          </div>
        </div>

        {/* Cards */}
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 md:p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Terms */}
            <div className={uiCard}>
              <div className="flex items-center gap-3">
                <DocIcon />
                <div className="text-lg font-semibold">Terms &amp; Conditions</div>
                <div className="ml-auto">
                  {terms ? <StatusPill tone="ok" text="Accepted" /> : <StatusPill tone="warn" text="Missing" />}
                </div>
              </div>
              <div className="mt-2 text-white/70 text-sm">
                {terms ? `Accepted · ${prettyDate(terms.accepted_at)}` : "You must accept before ordering"}
              </div>
              <div className="mt-4">
                <Link href="/terms" className={`${uiBtn} ${uiBtnGhost}`}>
                  View
                </Link>
              </div>
            </div>

            {/* Buy */}
            <div className={uiCard}>
              <div className="flex items-center gap-3">
                <ShieldIcon />
                <div className="text-lg font-semibold">Buy contract</div>
                <div className="ml-auto">
                  {buyActive ? (
                    <StatusPill tone="ok" text="Active" />
                  ) : buy?.status === "signed" ? (
                    <StatusPill tone="warn" text="Signed" />
                  ) : (
                    <StatusPill tone="muted" text="Not signed" />
                  )}
                </div>
              </div>
              <div className="mt-2 text-white/70 text-sm">
                {buyActive
                  ? "Active — order anytime"
                  : buy?.status === "signed"
                  ? "Signed — order anytime"
                  : "Sign once — then order anytime"}
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  className={`${uiBtn} ${uiBtnGhost}`}
                  onClick={() => openWizard("buy")}
                  disabled={!terms || buyActive}
                  title={!terms ? "Accept Terms first" : buyActive ? "Already active" : ""}
                >
                  {buy ? "Manage" : "Start"}
                </button>

                {/* Download button (enabled only if we have a path) */}
                <DownloadButton contract={buy} />
              </div>
            </div>

            {/* Rent */}
            <div className={uiCard}>
              <div className="flex items-center gap-3">
                <BuildingIcon />
                <div className="text-lg font-semibold">Rent contract</div>
                <div className="ml-auto">
                  {rentActive ? (
                    <StatusPill tone="ok" text="Active" />
                  ) : rentWaiting ? (
                    <StatusPill tone="warn" text="Signed" />
                  ) : (
                    <StatusPill tone="muted" text="Not signed" />
                  )}
                </div>
              </div>
              <div className="mt-2 text-white/70 text-sm">
                {rentActive
                  ? "Active — order anytime"
                  : rentWaiting
                  ? "Signed · awaiting approval"
                  : "Needs admin approval after signing"}
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  className={`${uiBtn} ${uiBtnGhost}`}
                  onClick={() => openWizard("rent")}
                  disabled={!terms || rentActive || rentWaiting}
                  title={
                    !terms
                      ? "Accept Terms first"
                      : rentActive
                      ? "Already active"
                      : rentWaiting
                      ? "Awaiting approval"
                      : ""
                  }
                >
                  {rent ? "Manage" : "Start"}
                </button>

                {/* Download button (enabled only if we have a path) */}
                <DownloadButton contract={rent} />
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-8 text-center">
            <Link
              className={`${uiBtn} ${uiBtnPrimary}`}
              href="/order"
              aria-disabled={!canContinue}
              onClick={(e) => {
                if (!canContinue) e.preventDefault();
              }}
            >
              Continue to Order
            </Link>
            {!canContinue && (
              <div className="mt-2 text-sm text-white/60">
                Accept Terms and have an active contract to continue.
              </div>
            )}
          </div>
        </div>

        {/* Footer mini-links */}
        <footer className="mt-10 text-sm text-white/70">
          <div className="border-t border-white/10 pt-4 flex flex-wrap items-center gap-4">
            <Link href="/terms" className="hover:underline">
              Terms &amp; Conditions
            </Link>
            <span className="opacity-30">|</span>
            <Link href="/privacy" className="hover:underline">
              Privacy policy
            </Link>
            <span className="opacity-30">|</span>
            <Link href="/cookies" className="hover:underline">
              Cookie policy
            </Link>
            <span className="opacity-30">|</span>
            <Link href="/cookies/manage" className="hover:underline">
              Manage cookies
            </Link>
            <div className="ml-auto opacity-60">© {new Date().getFullYear()} FuelFlow</div>
          </div>
        </footer>
      </div>

      {/* Simple contract wizard modal */}
      {showWizard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => !saving && setShowWizard(false)} />
          <div className="relative w-[95%] max-w-2xl rounded-2xl bg-[#0B274B] border border-white/10 p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                Start {wizardOption === "buy" ? "Purchase" : "Rental"} Contract
              </h3>
              <button
                aria-label="Close"
                className="rounded-lg p-2 text-white/70 hover:bg-white/10"
                onClick={() => !saving && setShowWizard(false)}
              >
                ✕
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Full name">
                <input
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none focus:ring focus:ring-yellow-500/30"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </Field>
              <Field label="Phone">
                <input
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none focus:ring focus:ring-yellow-500/30"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </Field>
              <Field label="Company name">
                <input
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none focus:ring focus:ring-yellow-500/30"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </Field>
              <Field label="Type your full legal name as signature">
                <input
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none focus:ring focus:ring-yellow-500/30"
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                  placeholder="Jane Smith"
                />
              </Field>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button className={`${uiBtn} ${uiBtnGhost}`} disabled={saving} onClick={() => setShowWizard(false)}>
                Cancel
              </button>
              <button className={`${uiBtn} ${uiBtnPrimary}`} disabled={saving} onClick={saveContract}>
                {saving ? "Saving…" : "Sign & Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* =========================
   Small helpers/components
   ========================= */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block mb-1 text-sm text-white/80">{label}</span>
      {children}
    </label>
  );
}

function DownloadButton({ contract }: { contract: ContractRow | null }) {
  const url = getPublicUrlIfAny(contract?.signed_pdf_path || null);
  const disabled = !url;
  return (
    <a
      href={url || "#"}
      target={url ? "_blank" : undefined}
      rel={url ? "noopener noreferrer" : undefined}
      onClick={(e) => {
        if (!url) e.preventDefault();
      }}
      className={`${uiBtn} ${uiBtnGhost}`}
      aria-disabled={disabled}
      title={disabled ? "No signed PDF available yet" : "Download signed PDF"}
      style={{ pointerEvents: disabled ? "none" : "auto" }}
    >
      Download signed PDF
    </a>
  );
}

function DocIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className="text-white/80">
      <path
        fill="currentColor"
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm0 0v6h6"
        opacity=".6"
      />
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
