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
   UI tokens
   ========================= */
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
  signed_pdf_path?: string | null;
};

type TermsRow = {
  id: string;
  email: string;
  accepted_at: string;
  version: string;
};

/* =========================
   Helpers
   ========================= */
const TERMS_VERSION = "v1.1";

const shortDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString() : "—";

function cls(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

export default function DocumentsPage() {
  const [email, setEmail] = useState("");
  const [terms, setTerms] = useState<TermsRow | null>(null);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Load everything safely (and read the original localStorage cache too)
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // 1) auth → email
        const { data: auth } = await supabase.auth.getUser();
        const em = (auth?.user?.email || "").toLowerCase();
        setEmail(em);

        // 2) Terms: check DB first
        const { data: t } = await supabase
          .from("terms_acceptances")
          .select("id,email,accepted_at,version")
          .eq("email", em)
          .eq("version", TERMS_VERSION)
          .order("accepted_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // 3) If DB has nothing, also honour the old localStorage cache
        let accepted = !!t;
        if (!accepted && typeof window !== "undefined") {
          const cached = localStorage.getItem(`terms:${TERMS_VERSION}:${em}`);
          if (cached === "1") {
            // Treat as accepted (no date); UI still shows "Accepted"
            setTerms({
              id: "local-cache",
              email: em,
              version: TERMS_VERSION,
              accepted_at: new Date().toISOString(),
            });
            accepted = true;
          }
        }
        if (t) setTerms(t as any);

        // 4) Contracts
        const { data: c } = await supabase
          .from("contracts")
          .select("id,email,tank_option,status,created_at,signed_at,approved_at,signed_pdf_path")
          .eq("email", em)
          .order("created_at", { ascending: false });
        setContracts((c as any) ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // State derivations that exactly match business rules
  const latestBuy = useMemo(
    () => contracts.find((r) => r.tank_option === "buy") ?? null,
    [contracts]
  );
  const latestRent = useMemo(
    () => contracts.find((r) => r.tank_option === "rent") ?? null,
    [contracts]
  );

  // Buy is active when SIGNED or APPROVED
  const buyActive = latestBuy && (latestBuy.status === "signed" || latestBuy.status === "approved");

  // Rent is only active when APPROVED (signed = pending)
  const rentActive = latestRent && latestRent.status === "approved";
  const rentSignedPending = latestRent && latestRent.status === "signed";

  // Get public Storage URL
  function publicPdfUrl(row: ContractRow | null) {
    if (!row?.signed_pdf_path) return null;
    const { data } = supabase.storage.from("contracts").getPublicUrl(row.signed_pdf_path);
    return data?.publicUrl ?? null;
  }

  const buyPdf = publicPdfUrl(latestBuy);
  const rentPdf = publicPdfUrl(latestRent);

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

        {/* Cards */}
        <section className={cls(panel, "px-3 py-5 md:px-6")}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Terms & Conditions */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 md:p-5">
              <div className="flex items-center gap-2">
                <DocIcon />
                <div className="text-lg font-semibold">Terms &amp; Conditions</div>
                <span className={`${pill} ${terms ? badgeOk : badgeWarn}`}>
                  {terms ? "Accepted" : "Missing"}
                </span>
              </div>
              <div className={`${subtle} mt-1`}>
                {terms ? `Accepted · ${shortDate(terms?.accepted_at)}` : "You must accept before ordering"}
              </div>

              <div className="mt-4">
                <Link href="/terms" className={`${btn} ${btnGhost}`}>
                  View
                </Link>
              </div>
            </div>

            {/* Buy contract */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 md:p-5">
              <div className="flex items-center gap-2">
                <ShieldIcon />
                <div className="text-lg font-semibold">Buy contract</div>
                <span className={`${pill} ${buyActive ? badgeOk : latestBuy ? badgeGrey : badgeWarn}`}>
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
                  <button className={`${btn} ${btnGhost}`} disabled>
                    Active
                  </button>
                ) : (
                  <Link href="/order#contract" className={`${btn} ${btnGhost}`}>
                    Manage
                  </Link>
                )}

                <a
                  href={buyPdf || "#"}
                  target={buyPdf ? "_blank" : undefined}
                  className={cls(
                    btn,
                    "px-3 py-2",
                    buyPdf ? btnGhost : "pointer-events-none bg-white/5 text-white/40 border border-white/10"
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
                <span className={`${pill} ${rentActive ? badgeOk : latestRent ? badgeGrey : badgeWarn}`}>
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
                  className={cls(
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

        <Footer />
      </div>
    </main>
  );
}

/* =========================
   Icons + Footer
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

