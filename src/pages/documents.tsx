// src/pages/documents.tsx
// src/pages/documents.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type TankOption = "buy" | "rent";
type ContractStatus = "draft" | "signed" | "approved" | "cancelled";

type ContractRow = {
  id: string;
  email: string | null;
  tank_option: TankOption;
  status: ContractStatus;
  signed_at: string | null;
  approved_at: string | null;
  customer_name?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  postcode?: string | null;
  tank_size_l?: number | null;
  monthly_consumption_l?: number | null;
  market_price_gbp_l?: number | null;
  fuelflow_price_gbp_l?: number | null;
  est_monthly_savings_gbp?: number | null;
  est_payback_months?: number | null;
  terms_version?: string | null;
  signature_name?: string | null;
};

type TermsRow = {
  id: string;
  email: string;
  version: string;
  accepted_at: string;
};

const TERMS_VERSION = "v1.1";

const supabase =
  typeof window !== "undefined"
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || "",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
      )
    : (null as any);

// ------- UI tokens -------
const card =
  "rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-5 py-5 shadow";
const pill =
  "inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full";
const button =
  "rounded-xl px-4 py-2 font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed";
const buttonPrimary =
  "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400 active:bg-yellow-300";
const buttonGhost = "bg-white/10 hover:bg-white/15 text-white border border-white/10";
const input =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none focus:ring focus:ring-yellow-500/30";
const label = "block text-sm font-medium text-white/80 mb-1";
const row = "grid grid-cols-1 md:grid-cols-2 gap-4";

// ------- Helpers -------
const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

function cx(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

// ===================================================
// Page
// ===================================================
export default function DocumentsPage() {
  const [userEmail, setUserEmail] = useState<string>("");

  const [termsAcceptedAt, setTermsAcceptedAt] = useState<string | null>(null);

  // Buy & Rent — keep only the most recent per option
  const [buy, setBuy] = useState<ContractRow | null>(null);
  const [rent, setRent] = useState<ContractRow | null>(null);

  // modals
  const [showCalc, setShowCalc] = useState<null | TankOption>(null);
  const [showWizard, setShowWizard] = useState<null | TankOption>(null);

  // wizard fields (shared)
  const [customerName, setCustomerName] = useState("");
  const [email, setEmail] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [city, setCity] = useState("");
  const [postcode, setPostcode] = useState("");

  // ROI inputs
  const [tankSizeL, setTankSizeL] = useState<number>(5000);
  const [monthlyConsumptionL, setMonthlyConsumptionL] = useState<number>(10000);
  const [marketPrice, setMarketPrice] = useState<number>(1.35);
  const [cheaperBy, setCheaperBy] = useState<number>(0.09);

  // signature
  const [signatureName, setSignatureName] = useState("");
  const [saving, setSaving] = useState(false);

  // derived
  const fuelflowPrice = useMemo(
    () => Math.max(0, (marketPrice || 0) - (cheaperBy || 0)),
    [marketPrice, cheaperBy]
  );
  const estMonthlySavings = useMemo(
    () => Math.max(0, (monthlyConsumptionL || 0) * (cheaperBy || 0)),
    [monthlyConsumptionL, cheaperBy]
  );
  const capex = useMemo(() => (showCalc === "buy" || showWizard === "buy" ? 12000 : 0), [showCalc, showWizard]);
  const estPaybackMonths = useMemo(
    () => (estMonthlySavings > 0 ? +(capex / estMonthlySavings).toFixed(1) : null),
    [capex, estMonthlySavings]
  );

  // ---------------------------------------------------
  // Load auth + documents
  // ---------------------------------------------------
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        window.location.href = "/login";
        return;
      }
      const em = (auth.user.email || "").toLowerCase();
      setUserEmail(em);
      setEmail(em);

      await Promise.all([loadTerms(em), loadContracts(em)]);
    })();
  }, []);

  async function loadTerms(emailLower: string) {
    // also honour the return flag (when coming back from /terms)
    const params = new URLSearchParams(window.location.search);
    if (params.get("accepted") === "1") {
      setTermsAcceptedAt(new Date().toISOString());
    }

    const { data } = await supabase
      .from("terms_acceptances")
      .select("id,email,version,accepted_at")
      .eq("email", emailLower)
      .eq("version", TERMS_VERSION)
      .order("accepted_at", { ascending: false })
      .limit(1);

    setTermsAcceptedAt(data?.[0]?.accepted_at ?? null);
  }

  async function loadContracts(emailLower: string) {
    const { data, error } = await supabase
      .from("contracts")
      .select(
        "id,email,tank_option,status,signed_at,approved_at,customer_name,address_line1,address_line2,city,postcode,tank_size_l,monthly_consumption_l,market_price_gbp_l,fuelflow_price_gbp_l,est_monthly_savings_gbp,est_payback_months,terms_version,signature_name"
      )
      .eq("email", emailLower)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }
    const rows = (data || []) as ContractRow[];

    const latest = (opt: TankOption) =>
      rows.find((r) => r.tank_option === opt && (r.status === "approved" || r.status === "signed")) ??
      rows.find((r) => r.tank_option === opt) ??
      null;

    setBuy(latest("buy"));
    setRent(latest("rent"));
  }

  // ---------------------------------------------------
  // Actions
  // ---------------------------------------------------
  function goTerms() {
    const ret = `/terms?return=/documents&email=${encodeURIComponent(
      email || userEmail
    )}`;
    window.location.href = ret;
  }

  function openCalculator(opt: TankOption) {
    setShowCalc(opt);
  }

  function openWizard(opt: TankOption) {
    // prefill from existing contract for convenience
    const src = opt === "buy" ? buy : rent;
    if (src) {
      setCustomerName(src.customer_name || customerName);
      setAddress1(src.address_line1 || address1);
      setAddress2(src.address_line2 || address2);
      setCity(src.city || city);
      setPostcode(src.postcode || postcode);
      setTankSizeL(src.tank_size_l ?? tankSizeL);
      setMonthlyConsumptionL(src.monthly_consumption_l ?? monthlyConsumptionL);
      setMarketPrice(src.market_price_gbp_l ?? marketPrice);
      setSignatureName(src.signature_name || signatureName);
      if (src.fuelflow_price_gbp_l != null && src.market_price_gbp_l != null) {
        const diff = (src.market_price_gbp_l || 0) - (src.fuelflow_price_gbp_l || 0);
        if (diff > 0) setCheaperBy(diff);
      }
    }
    setShowWizard(opt);
  }

  async function signContract(opt: TankOption) {
    if (!email) {
      alert("Please make sure your email is present.");
      return;
    }
    if (!customerName.trim()) {
      alert("Please enter your name.");
      return;
    }
    if (!signatureName.trim()) {
      alert("Please type your full legal name as signature.");
      return;
    }

    try {
      setSaving(true);
      const payload = {
        // identity & address
        email: (email || "").toLowerCase(),
        customer_name: customerName || null,
        address_line1: address1 || null,
        address_line2: address2 || null,
        city: city || null,
        postcode: postcode || null,

        // contract choice + ROI numbers
        tank_option: opt,
        tank_size_l: tankSizeL || null,
        monthly_consumption_l: monthlyConsumptionL || null,
        market_price_gbp_l: marketPrice || null,
        fuelflow_price_gbp_l: fuelflowPrice || null,
        est_monthly_savings_gbp: estMonthlySavings || null,
        est_payback_months: estPaybackMonths || null,

        // terms + signature
        terms_version: TERMS_VERSION,
        signature_name: signatureName,
        signed_at: new Date().toISOString(),
        status: "signed" as ContractStatus,
      };

      // Insert only known columns — this shape matches your SQL
      const { error } = await supabase.from("contracts").insert(payload as any);
      if (error) throw error;

      setShowWizard(null);
      await loadContracts((email || userEmail).toLowerCase());
      alert(
        opt === "buy"
          ? "Buy contract signed. You can order now."
          : "Rent contract signed. We will approve it shortly."
      );
    } catch (e: any) {
      alert(e?.message || "Failed to save contract.");
    } finally {
      setSaving(false);
    }
  }

  const canOrder =
    !!termsAcceptedAt &&
    ((buy && (buy.status === "signed" || buy.status === "approved")) ||
      (rent && rent.status === "approved"));

  return (
    <main className="min-h-screen bg-[#061B34] text-white pb-20">
      <div className="mx-auto w-full max-w-6xl px-4 pt-10">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <img
            src="/logo-email.png"
            alt="FuelFlow"
            width={116}
            height={28}
            className="opacity-90"
          />
          <div className="ml-2 text-2xl md:text-3xl font-bold">Documents</div>
          <div className="ml-auto">
            <a href="/client-dashboard" className="text-white/70 hover:text-white">
              Back to Dashboard
            </a>
          </div>
        </div>

        {/* Info hint */}
        <p className="mb-4 text-sm text-white/70">
          Ordering unlocks when Terms are accepted and either a{" "}
          <b>Buy</b> contract is signed or a <b>Rent</b> contract is approved.
        </p>

        {/* Cards */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Terms */}
          <div className={card}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Terms &amp; Conditions</h3>
              {termsAcceptedAt ? (
                <span className={`${pill} bg-green-500/20 text-green-300`}>
                  ok
                </span>
              ) : (
                <span className={`${pill} bg-red-500/20 text-red-300`}>
                  missing
                </span>
              )}
            </div>
            <p className="mt-2 text-white/70 text-sm">
              You must accept the latest Terms before ordering.
            </p>
            <div className="mt-4">
              <button className={`${button} ${buttonGhost}`} onClick={goTerms}>
                Read &amp; accept
              </button>
            </div>
          </div>

          {/* Buy */}
          <div className={card}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Buy Contract</h3>
              <StatusPill row={buy} forOption="buy" />
            </div>
            <p className="mt-2 text-white/70 text-sm">
              For purchase agreements: a signed contract is enough to order.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className={`${button} ${buttonGhost}`}
                onClick={() => openCalculator("buy")}
              >
                ROI / Calculator
              </button>
              <button
                className={`${button} ${buttonPrimary}`}
                onClick={() => openWizard("buy")}
              >
                {buy ? "Update / Resign" : "Start & Sign"}
              </button>
            </div>
          </div>

          {/* Rent */}
          <div className={card}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Rent Contract</h3>
              <StatusPill row={rent} forOption="rent" />
            </div>
            <p className="mt-2 text-white/70 text-sm">
              Rental agreements require <b>admin approval</b> after signing.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className={`${button} ${buttonGhost}`}
                onClick={() => openCalculator("rent")}
              >
                ROI / Calculator
              </button>
              <button
                className={`${button} ${buttonPrimary}`}
                onClick={() => openWizard("rent")}
              >
                {rent ? "Update / Resign" : "Start & Sign"}
              </button>
            </div>
          </div>
        </section>

        {/* Callout */}
        <div className="mt-6">
          {canOrder ? (
            <div className="rounded-lg border border-green-400/30 bg-green-500/10 px-4 py-3 text-sm text-green-200">
              ✅ Documents complete — you can{" "}
              <a className="underline" href="/order">
                place an order
              </a>
              .
            </div>
          ) : (
            <div className="rounded-lg border border-yellow-400/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
              Complete the steps above to unlock ordering.
            </div>
          )}
        </div>
      </div>

      {/* ROI modal */}
      {showCalc && (
        <Modal title={`Savings Calculator — ${showCalc === "buy" ? "Buy" : "Rent"}`} onClose={() => setShowCalc(null)}>
          <EstimateBanner />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-4">
            <Metric title="FuelFlow price" value={`${GBP.format(fuelflowPrice)} / L`} />
            <Metric title="Est. monthly savings" value={GBP.format(estMonthlySavings)} />
            <Metric
              title="Capex required"
              value={showCalc === "rent" ? "£0 (rental)" : GBP.format(12000)}
            />
          </div>

          <div className={row}>
            <div>
              <label className={label}>Tank size (L)</label>
              <input
                className={input}
                type="number"
                min={0}
                value={tankSizeL}
                onChange={(e) => setTankSizeL(Number(e.target.value))}
              />
            </div>
            <div>
              <label className={label}>Monthly consumption (L)</label>
              <input
                className={input}
                type="number"
                min={0}
                value={monthlyConsumptionL}
                onChange={(e) => setMonthlyConsumptionL(Number(e.target.value))}
              />
            </div>
            <div>
              <label className={label}>Market price (GBP/L)</label>
              <input
                className={input}
                type="number"
                step="0.01"
                min={0}
                value={marketPrice}
                onChange={(e) => setMarketPrice(Number(e.target.value))}
              />
            </div>
            <div>
              <label className={label}>FuelFlow cheaper by (GBP/L)</label>
              <input
                className={input}
                type="number"
                step="0.01"
                min={0}
                value={cheaperBy}
                onChange={(e) => setCheaperBy(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button className={`${button} ${buttonGhost}`} onClick={() => setShowCalc(null)}>
              Close
            </button>
            <button
              className={`${button} ${buttonPrimary}`}
              onClick={() => {
                setShowCalc(null);
                setShowWizard(showCalc);
              }}
            >
              Continue to Sign
            </button>
          </div>
        </Modal>
      )}

      {/* Wizard modal */}
      {showWizard && (
        <Modal
          title={`${
            showWizard === "buy" ? "Start Purchase Contract" : "Start Rental Contract"
          }`}
          onClose={() => (saving ? null : setShowWizard(null))}
        >
          <EstimateBanner />

          {/* quick KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-4">
            <Metric title="FuelFlow price" value={`${GBP.format(fuelflowPrice)} / L`} />
            <Metric title="Est. monthly savings" value={GBP.format(estMonthlySavings)} />
            <Metric
              title="Capex required"
              value={showWizard === "rent" ? "£0 (rental)" : GBP.format(12000)}
            />
          </div>

          <div className={row}>
            <div>
              <label className={label}>Your name</label>
              <input className={input} value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div>
              <label className={label}>Email</label>
              <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
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
              <label className={label}>City</label>
              <input className={input} value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div>
              <label className={label}>Postcode</label>
              <input className={input} value={postcode} onChange={(e) => setPostcode(e.target.value)} />
            </div>

            <div>
              <label className={label}>Tank size (L)</label>
              <input
                className={input}
                type="number"
                min={0}
                value={tankSizeL}
                onChange={(e) => setTankSizeL(Number(e.target.value))}
              />
            </div>
            <div>
              <label className={label}>Monthly consumption (L)</label>
              <input
                className={input}
                type="number"
                min={0}
                value={monthlyConsumptionL}
                onChange={(e) => setMonthlyConsumptionL(Number(e.target.value))}
              />
            </div>
            <div>
              <label className={label}>Market price (GBP/L)</label>
              <input
                className={input}
                type="number"
                step="0.01"
                min={0}
                value={marketPrice}
                onChange={(e) => setMarketPrice(Number(e.target.value))}
              />
            </div>
            <div>
              <label className={label}>FuelFlow cheaper by (GBP/L)</label>
              <input
                className={input}
                type="number"
                step="0.01"
                min={0}
                value={cheaperBy}
                onChange={(e) => setCheaperBy(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="mt-5">
            <label className={label}>Type your full legal name as signature</label>
            <input
              className={input}
              placeholder="Jane Smith"
              value={signatureName}
              onChange={(e) => setSignatureName(e.target.value)}
            />
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button className={`${button} ${buttonGhost}`} disabled={saving} onClick={() => setShowWizard(null)}>
              Cancel
            </button>
            <button
              className={`${button} ${buttonPrimary}`}
              disabled={saving}
              onClick={() => signContract(showWizard)}
            >
              {saving ? "Saving…" : "Sign & Save"}
            </button>
          </div>
        </Modal>
      )}

      <footer className="mt-12 text-center text-white/40 text-xs">
        © {new Date().getFullYear()} FuelFlow. All rights reserved.
      </footer>
    </main>
  );
}

// ===================================================
// Small components
// ===================================================
function StatusPill({ row, forOption }: { row: ContractRow | null; forOption: TankOption }) {
  if (!row) {
    return (
      <span className={`${pill} bg-white/10 text-white/80`}>
        Not signed
      </span>
    );
  }
  if (row.status === "approved") {
    return <span className={`${pill} bg-green-500/20 text-green-300`}>Active</span>;
  }
  if (row.status === "signed") {
    return (
      <span className={`${pill} bg-yellow-500/20 text-yellow-300`}>
        {forOption === "buy" ? "Signed" : "Awaiting approval"}
      </span>
    );
  }
  if (row.status === "cancelled") {
    return <span className={`${pill} bg-red-500/20 text-red-300`}>Cancelled</span>;
  }
  return <span className={`${pill} bg-white/10 text-white/80`}>{row.status}</span>;
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
          <button
            aria-label="Close"
            className="rounded-lg p-2 text-white/70 hover:bg-white/10"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
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

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0E2E57] p-4">
      <div className="text-white/70 text-sm">{title}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

