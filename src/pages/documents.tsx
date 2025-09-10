// src/pages/documents.tsx
// src/pages/documents.tsx// src/pages/documents.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

type ContractStatus = "draft" | "signed" | "approved" | "cancelled";
type TankOption = "buy" | "rent";

type ContractRow = {
  id: string;
  tank_option: TankOption;
  status: ContractStatus;
  signed_at: string | null;
  approved_at: string | null;
  created_at: string;
  email: string | null;
  pdf_url?: string | null;
  pdf_storage_path?: string | null;
};

const TERMS_VERSION = "v1.1";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

const pill =
  "inline-flex items-center text-xs font-medium px-2 py-1 rounded-full";
const button =
  "rounded-2xl px-4 py-2 font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed";
const buttonPrimary = "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400 active:bg-yellow-300";
const buttonGhost = "bg-white/10 hover:bg-white/15 text-white border border-white/10";
const card = "rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-5 py-4 shadow transition";

export default function DocumentsPage() {
  const [userEmail, setUserEmail] = useState<string>("");

  // terms
  const [termsAcceptedAt, setTermsAcceptedAt] = useState<string | null>(null);
  const termsOk = Boolean(termsAcceptedAt);

  // contracts (optional — shown as status)
  const [buyContract, setBuyContract] = useState<ContractRow | null>(null);
  const [rentContract, setRentContract] = useState<ContractRow | null>(null);

  // ---------- bootstrap ----------
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        window.location.href = "/login";
        return;
      }
      const emailLower = (auth.user.email || "").toLowerCase();
      setUserEmail(emailLower);

      await Promise.all([refreshTerms(emailLower), refreshContracts(emailLower)]);
    })();
  }, []);

  // ---------- handle return from /terms (accepted=1) ----------
  useEffect(() => {
    const url = new URL(window.location.href);
    const accepted = url.searchParams.get("accepted");
    const retEmail = (url.searchParams.get("email") || userEmail || "").toLowerCase();

    if (accepted === "1" && retEmail) {
      // show OK immediately, then confirm from DB
      setTermsAcceptedAt(new Date().toISOString());
      refreshTerms(retEmail);

      // clean the URL so this doesn't rerun
      url.searchParams.delete("accepted");
      url.searchParams.delete("email");
      window.history.replaceState({}, "", url.toString());
    }
  }, [userEmail]);

  async function refreshTerms(emailLower: string) {
    const { data } = await supabase
      .from("terms_acceptances")
      .select("id,email,accepted_at,version")
      .eq("email", emailLower)
      .eq("version", TERMS_VERSION)
      .order("accepted_at", { ascending: false })
      .limit(1);
    setTermsAcceptedAt(data?.[0]?.accepted_at ?? null);
  }

  async function refreshContracts(emailLower: string) {
    const { data } = await supabase
      .from("contracts")
      .select("id,tank_option,status,signed_at,approved_at,created_at,email,pdf_url,pdf_storage_path")
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
    // ✅ pass the logged-in email so the API stores the correct row
    const url = `/terms?return=/documents&email=${encodeURIComponent(userEmail)}`;
    window.location.href = url;
  }

  const buyBadge = buyContract
    ? buyContract.status === "approved"
      ? { text: "Active", cls: "bg-green-500/20 text-green-300" }
      : { text: "Signed", cls: "bg-yellow-500/20 text-yellow-300" }
    : { text: "Not signed", cls: "bg-white/10 text-white/70" };

  const rentBadge = rentContract
    ? rentContract.status === "approved"
      ? { text: "Active", cls: "bg-green-500/20 text-green-300" }
      : { text: "Signed", cls: "bg-yellow-500/20 text-yellow-300" }
    : { text: "Not signed", cls: "bg-white/10 text-white/70" };

  return (
    <main className="min-h-screen bg-[#061B34] text-white pb-20">
      <div className="mx-auto w-full max-w-6xl px-4 pt-10">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <img src="/logo-email.png" alt="FuelFlow" width={116} height={28} className="opacity-90" />
          <div className="ml-2 text-2xl md:text-3xl font-bold">Documents</div>
          <div className="ml-auto">
            <Link href="/client-dashboard" className="text-white/70 hover:text-white">
              Back to Dashboard
            </Link>
          </div>
        </div>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Terms */}
          <div className={card}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Terms &amp; Conditions</h3>
              <span className={`${pill} ${termsOk ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"}`}>
                {termsOk ? "ok" : "missing"}
              </span>
            </div>
            <p className="mt-2 text-white/70 text-sm">
              You must accept the latest Terms before ordering.
            </p>
            <div className="mt-3">
              <button type="button" className={`${button} ${buttonGhost}`} onClick={openTerms}>
                Read &amp; accept
              </button>
            </div>
          </div>

          {/* Buy */}
          <div className={card}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Buy Contract</h3>
              <span className={`${pill} ${buyBadge.cls}`}>{buyBadge.text}</span>
            </div>
            <p className="mt-2 text-white/70 text-sm">
              For purchase agreements: a signed contract is enough to order.
            </p>
            <div className="mt-3 flex gap-2">
              <button className={`${button} ${buttonGhost}`} onClick={() => alert("Calculator coming soon")}>
                ROI / Calculator
              </button>
              <button className={`${button} ${buttonPrimary}`} onClick={() => alert("Open buy contract wizard")}>
                Update / Resign
              </button>
            </div>
          </div>

          {/* Rent */}
          <div className={card}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Rent Contract</h3>
              <span className={`${pill} ${rentBadge.cls}`}>{rentBadge.text}</span>
            </div>
            <p className="mt-2 text-white/70 text-sm">
              Rental agreements require <strong>admin approval</strong> after signing.
            </p>
            <div className="mt-3 flex gap-2">
              <button className={`${button} ${buttonGhost}`} onClick={() => alert("Calculator coming soon")}>
                ROI / Calculator
              </button>
              <button className={`${button} ${buttonPrimary}`} onClick={() => alert("Open rent contract wizard")}>
                Update / Resign
              </button>
            </div>
          </div>
        </section>

        <p className="text-center text-white/70 text-sm">
          Ordering unlocks when Terms are accepted and either a <b>Buy</b> contract is signed or a{" "}
          <b>Rent</b> contract is approved.
        </p>
      </div>
    </main>
  );
}


