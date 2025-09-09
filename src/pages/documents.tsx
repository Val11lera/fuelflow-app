// src/pages/documents.tsx
// /src/pages/documents.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

/* ========= Supabase ========= */
const supabase =
  typeof window !== "undefined"
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || "",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
      )
    : (null as any);

/* ========= UI tokens ========= */
const panel =
  "rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-5 py-4 shadow transition";
const pill = "inline-flex items-center text-xs font-medium px-2 py-1 rounded-full";
const btn =
  "inline-flex items-center justify-center rounded-xl px-4 py-2 font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed";
const btnPrimary = "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400 active:bg-yellow-300";
const btnGhost = "bg-white/10 hover:bg-white/15 text-white border border-white/10";
const badgeOk = "bg-emerald-500/15 text-emerald-300";
const badgeWarn = "bg-yellow-500/15 text-yellow-300";
const badgeGrey = "bg-white/10 text-white/70";
const subtle = "text-white/70 text-sm";

/* ========= Types ========= */
type TankOption = "buy" | "rent";
type ContractRow = {
  id: string;
  email: string | null;
  tank_option: TankOption;
  status: "draft" | "signed" | "approved" | "cancelled";
  signed_at?: string | null;
  approved_at?: string | null;
  created_at?: string | null;
  signed_pdf_path?: string | null; // <— NEW
};

type TermsRow = {
  id: string;
  email: string;
  accepted_at: string;
  version: string;
};

/* ========= Helpers ========= */
const shortDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString() : "—";

const GBP = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n);

function classNames(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

export default function DocumentsPage() {
  const [email, setEmail] = useState("");
  const [terms, setTerms] = useState<TermsRow | null>(null);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data: auth } = await supabase.auth.getUser();
        const em = (auth?.user?.email || "").toLowerCase();
        setEmail(em);

        // latest T&C acceptance
        const { data: t } = await supabase
          .from("terms_acceptances")
          .select("id,email,accepted_at,version")
          .eq("email", em)
          .order("accepted_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        setTerms((t as any) ?? null);

        // all contracts (latest first)
        const { data: c } = await supabase
          .from("contracts")
          .select("id,email,tank_option,status,signed_at,approved_at,created_at,signed_pdf_path")
          .eq("email", em)
          .order("created_at", { ascending: false });
        setContracts((c as any) ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const activeBuy = useMemo(
    () =>
      contracts.some(
        (r) => r.tank_option === "buy" && (r.status === "signed" || r.status === "approved")
      ),
    [contracts]
  );

  const activeRent = useMemo(
    () =>
      contracts.some(
        (r) => r.tank_option === "rent" && r.status === "approved"
      ),
    [contracts]
  );

  function getLatest(contractType: TankOption): ContractRow | null {
    const rows = contracts.filter((r) => r.tank_option === contractType);
    return rows.length ? rows[0] : null;
  }

  function signedPdfUrl(row: ContractRow | null) {
    if (!row?.signed_pdf_path) return null;
    const { data } = supabase.storage
      .from("contracts")
      .getPublicUrl(row.signed_pdf_path);
    return data?.publicUrl ?? null;
  }

  const buyRow = getLatest("buy");
  const rentRow = getLatest("rent");
  const buyPdf = signedPdfUrl(buyRow);
  const rentPdf = signedPdfUrl(rentRow);

  return (
    <main className="min-h-screen bg-[#0A233F] text-white pb-28">
      <div className="mx-auto w-full max-w-6xl px-4 pt-10">
        {/* Header */}
        <div className="mb-6 flex items-center gap-2">
          <img src="/logo-email.png" alt="FuelFlow" width={116} height={28} className="opacity-90" />
          <h1 className="ml-3 text-3xl md:text-4xl font-bold">Documents</h1>
          <div className="ml-auto">
            <Link href="/client-dashboard" className={`${btn} ${btnGhost}`}>
              ← Back to dashboard
            </Link>
          </div>
        </div>

        {/* Tiles */}
        <section className={classNames(panel, "px-3 py-5 md:px-6")}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Terms */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 md:p-5">
              <div className="flex items-center gap-2">
                <DocIcon />
                <div className="text-lg font-semibold">Terms &amp; Conditions</div>
                <span className={`${pill} ${terms ? badgeOk : badgeWarn}`}>
                  {terms ? "Accepted" : "Missing"}
                </span>
              </div>
              <div className={`${subtle} mt-1`}>
                {terms ? `Accepted · ${shortDate(terms.accepted_at)}` : "You must accept before ordering"}
              </div>

              <div className="mt-4">
                <Link href="/terms" className={`${btn} ${btnGhost}`}>
                  View
                </Link>
              </div>
            </div>

            {/* Buy */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 md:p-5">
              <div className="flex items-center gap-2">
                <ShieldIcon />
                <div className="text-lg font-semibold">Buy contract</div>
                <span className={`${pill} ${activeBuy ? badgeOk : badgeGrey}`}>
                  {activeBuy ? "Active" : buyRow?.status === "signed" ? "Signed" : "Not signed"}
                </span>
              </div>
              <div className={`${subtle} mt-1`}>
                {activeBuy
                  ? "Active — order anytime"
                  : buyRow?.status === "signed"
                  ? `Signed · ${shortDate(buyRow?.signed_at)}`
                  : "Sign once — then order anytime"}
              </div>

              <div className="mt-4 flex items-center gap-3">
                {activeBuy ? (
                  <button className={`${btn} ${btnGhost}`} disabled>
                    Active
                  </button>
                ) : (
                  <Link href="/order#contract" className={`${btn} ${btnGhost}`}>
                    Manage
                  </Link>
                )}

                {/* Download PDF */}
                <a
                  href={buyPdf || "#"}
                  target={buyPdf ? "_blank" : undefined}
                  className={classNames(
                    btn,
                    "px-3 py-2",
                    buyPdf ? btnGhost : "pointer-events-none bg-white/5 text-white/40 border border-white/10"
                  )}
                >
                  Download signed PDF
                </a>
              </div>
            </div>

            {/* Rent */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 md:p-5">
              <div className="flex items-center gap-2">
                <BuildingIcon />
                <div className="text-lg font-semibold">Rent contract</div>
                <span className={`${pill} ${activeRent ? badgeOk : badgeGrey}`}>
                  {activeRent ? "Active" : rentRow?.status === "signed" ? "Signed" : "Not signed"}
                </span>
              </div>
              <div className={`${subtle} mt-1`}>
                {activeRent
                  ? "Active — order anytime"
                  : rentRow?.status === "signed"
                  ? "Signed · awaiting approval"
                  : "Needs admin approval after signing"}
              </div>

              <div className="mt-4 flex items-center gap-3">
                {activeRent ? (
                  <button className={`${btn} ${btnGhost}`} disabled>
                    Active
                  </button>
                ) : (
                  <Link href="/order#contract" className={`${btn} ${btnGhost}`}>
                    Start
                  </Link>
                )}

                <a
                  href={rentPdf || "#"}
                  target={rentPdf ? "_blank" : undefined}
                  className={classNames(
                    btn,
                    "px-3 py-2",
                    rentPdf ? btnGhost : "pointer-events-none bg-white/5 text-white/40 border border-white/10"
                  )}
                >
                  Download signed PDF
                </a>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-8 text-center">
            <Link href="/order" className={`${btn} ${btnPrimary} text-base px-5 py-3`}>
              Continue to Order
            </Link>
          </div>
        </section>

        {/* Footer */}
        <SiteFooter />
      </div>
    </main>
  );
}

/* ========= Tiny icons ========= */
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

/* ========= Footer ========= */
function SiteFooter() {
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

