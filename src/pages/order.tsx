// src/pages/order.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

/* =========================
   Types
   ========================= */
type TankOption = "buy" | "rent";
type Fuel = "diesel" | "petrol";

type ContractRow = {
  id: string;
  email: string | null;
  tank_option: "buy" | "rent";
  status: "draft" | "signed" | "approved" | "cancelled";
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
const card = "rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-5 py-4 shadow transition";
const pill = "inline-flex items-center text-xs font-medium px-2 py-1 rounded-full";
const button = "rounded-2xl px-4 py-2 font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed";
const buttonPrimary = "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400 active:bg-yellow-300";
const buttonGhost = "bg-white/10 hover:bg-white/15 text-white border border-white/10";
const input =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none focus:ring focus:ring-yellow-500/30";
const label = "block text-sm font-medium text-white/80 mb-1";
const row = "grid grid-cols-1 md:grid-cols-2 gap-4";

/* =========================
   Helpers & constants
   ========================= */
const termsVersion = "v1.1";
const TERMS_KEY = (email: string) => `terms:${termsVersion}:${email}`;
const STORAGE_KEY = "order:form:v3";

const GBP = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n);

const StepBadge = ({ state }: { state: "todo" | "done" | "wait" }) => {
  const map = {
    todo: "bg-white/10 text-white/70",
    done: "bg-green-500/20 text-green-300",
    wait: "bg-yellow-500/20 text-yellow-300",
  } as const;
  const text = state === "todo" ? "to do" : state === "done" ? "done" : "wait";
  return <span className={`${pill} ${map[state]}`}>{text}</span>;
};

/* =========================
   Page
   ========================= */
export default function OrderPage() {
  const qp = useSearchParams();

  // live prices
  const [petrolPrice, setPetrolPrice] = useState<number | null>(null);
  const [dieselPrice, setDieselPrice] = useState<number | null>(null);

  // form state
  const [fuel, setFuel] = useState<Fuel>("diesel");
  const [litres, setLitres] = useState<number>(1000);
  const [deliveryDate, setDeliveryDate] = useState("");

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [postcode, setPostcode] = useState("");
  const [city, setCity] = useState("");

  // terms
  const [accepted, setAccepted] = useState(false);
  const [checkingTerms, setCheckingTerms] = useState(false);

  // contracts
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [activeBuy, setActiveBuy] = useState(false);   // signed OR approved
  const [activeRent, setActiveRent] = useState(false); // approved only
  const [rentAwaitingApproval, setRentAwaitingApproval] = useState<ContractRow | null>(null);

  // checkout
  const [startingCheckout, setStartingCheckout] = useState(false);

  // ROI numbers (kept)
  const [tankSizeL, setTankSizeL] = useState<number>(5000);
  const [monthlyConsumptionL, setMonthlyConsumptionL] = useState<number>(10000);
  const [marketPrice, setMarketPrice] = useState<number>(1.35);
  const [cheaperBy, setCheaperBy] = useState<number>(0.09);

  /* ---------- auth (prefill email) ---------- */
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const em = (data?.user?.email || "").toLowerCase();
      if (em && !email) setEmail(em);
    })();
  }, []);

  /* ---------- prices ---------- */
  useEffect(() => {
    (async () => {
      try {
        let { data: lp } = await supabase.from("latest_prices").select("fuel,total_price");
        if (!lp?.length) {
          const { data: dp } = await supabase.from("latest_daily_prices").select("fuel,total_price");
          if (dp?.length) lp = dp as any;
        }
        if (lp?.length) {
          for (const r of lp as { fuel: Fuel; total_price: number }[]) {
            if (r.fuel === "petrol") setPetrolPrice(Number(r.total_price));
            if (r.fuel === "diesel") setDieselPrice(Number(r.total_price));
          }
        }
      } catch {}
    })();
  }, []);

  /* ---------- derived ---------- */
  const unitPriceSelected = fuel === "diesel" ? dieselPrice : petrolPrice;
  const estTotal = useMemo(
    () => (unitPriceSelected != null && Number.isFinite(litres) ? litres * unitPriceSelected : 0),
    [litres, unitPriceSelected]
  );
  const fuelflowPrice = Math.max(0, (marketPrice || 0) - (cheaperBy || 0));
  const estMonthlySavings = Math.max(0, (monthlyConsumptionL || 0) * (cheaperBy || 0));
  const estPaybackMonths =
    fuelflowPrice > 0 && estMonthlySavings > 0 ? Math.round((12000 / estMonthlySavings) * 10) / 10 : null;

  /* ---------- load/save draft ---------- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const v = JSON.parse(raw);
        if (v.fuel) setFuel(v.fuel);
        if (Number.isFinite(v.litres)) setLitres(v.litres);
        if (v.deliveryDate) setDeliveryDate(v.deliveryDate);
        if (v.email) setEmail(v.email);
        if (v.fullName) setFullName(v.fullName);
        if (v.address1) setAddress1(v.address1);
        if (v.address2) setAddress2(v.address2);
        if (v.postcode) setPostcode(v.postcode);
        if (v.city) setCity(v.city);
      }
    } catch {}
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ fuel, litres, deliveryDate, email, fullName, address1, address2, postcode, city })
      );
    } catch {}
  }, [fuel, litres, deliveryDate, email, fullName, address1, address2, postcode, city]);

  /* ---------- Terms acceptance ---------- */
  useEffect(() => {
    const acceptedParam = qp.get("accepted");
    const emailParam = qp.get("email");
    if (emailParam && !email) setEmail(emailParam);
    if (acceptedParam === "1" && emailParam) {
      localStorage.setItem(TERMS_KEY(emailParam), "1");
    }
  }, [qp, email]);

  useEffect(() => {
    if (!email) return;
    (async () => {
      setCheckingTerms(true);
      try {
        const cached = localStorage.getItem(TERMS_KEY(email));
        if (cached === "1") {
          setAccepted(true);
          return;
        }
        const { data } = await supabase
          .from("terms_acceptances")
          .select("id")
          .eq("email", email.toLowerCase())
          .eq("version", termsVersion)
          .limit(1)
          .maybeSingle();
        if (data) {
          setAccepted(true);
          localStorage.setItem(TERMS_KEY(email), "1");
        }
      } finally {
        setCheckingTerms(false);
      }
    })();
  }, [email]);

  /* ---------- load contracts ---------- */
  async function refreshContracts() {
    if (!email) return;
    const { data } = await supabase
      .from("contracts")
      .select(
        "id,email,tank_option,status,customer_name,created_at,approved_at,signed_at,tank_size_l,monthly_consumption_l,fuelflow_price_gbp_l,est_monthly_savings_gbp,est_payback_months"
      )
      .eq("email", email.toLowerCase())
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
  }
  useEffect(() => {
    refreshContracts();
  }, [email]);

  /* ---------- checkout ---------- */
  const requirementsOkay = accepted && (activeBuy || activeRent); // rent only after approval

  const payDisabled =
    !requirementsOkay ||
    !email ||
    !fullName ||
    !address1 ||
    !postcode ||
    !city ||
    !deliveryDate ||
    !Number.isFinite(litres) ||
    litres <= 0;

  async function startCheckout() {
    try {
      if (!requirementsOkay) {
        alert("Complete the requirements first (Terms + active contract).");
        return;
      }
      setStartingCheckout(true);
      const res = await fetch("/api/stripe/checkout/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fuel,
          litres,
          deliveryDate,
          full_name: fullName,
          email,
          address_line1: address1,
          address_line2: address2,
          city,
          postcode,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `Checkout failed (${res.status})`);
      }
      const data = (await res.json()) as { url?: string; error?: string };
      if (!data.url) throw new Error(data.error || "No checkout URL returned");
      window.location.href = data.url;
    } catch (e: any) {
      alert(e?.message || "Failed to create order");
    } finally {
      setStartingCheckout(false);
    }
  }

  /* ---------- render ---------- */
  return (
    <main className="min-h-screen bg-[#061B34] text-white pb-24">
      <div className="mx-auto w-full max-w-6xl px-4 pt-10">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <img src="/logo-email.png" alt="FuelFlow" width={116} height={28} className="opacity-90" />
          <div className="ml-2 text-2xl md:text-3xl font-bold">Place an Order</div>
          <div className="ml-auto">
            <Link href="/client-dashboard" className="text-white/70 hover:text-white">
              Back to Dashboard
            </Link>
          </div>
        </div>

        {/* Contract Panel */}
        <section className={card}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <h3 className="text-lg font-semibold">Contract</h3>
            <div className="text-sm text-white/70">
              Buy: active once signed · Rent: needs admin approval after signing
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Step 1: Terms */}
            <div className="rounded-xl border border-white/10 p-4 bg-white/5">
              <div className="flex items-center justify-between">
                <div className="font-medium">Step 1 — Terms</div>
                <StepBadge state={accepted ? "done" : "todo"} />
              </div>
              <p className="text-sm text-white/70 mt-1">{accepted ? "Accepted the latest Terms." : "You must accept the latest Terms."}</p>
              <Link href="/terms" className={`${button} ${buttonGhost} mt-3`}>
                {accepted ? "View Terms" : "Read & accept Terms"}
              </Link>
              {!accepted && checkingTerms && (
                <div className="text-xs text-white/60 mt-2">Checking acceptance…</div>
              )}
            </div>

            {/* Step 2: Sign */}
            <div className="rounded-xl border border-white/10 p-4 bg-white/5">
              <div className="flex items-center justify-between">
                <div className="font-medium">Step 2 — Sign</div>
                <StepBadge
                  state={
                    activeBuy || rentAwaitingApproval || activeRent
                      ? "done"
                      : accepted
                      ? "todo"
                      : "wait"
                  }
                />
              </div>
              <p className="text-sm text-white/70 mt-1">Choose a contract type. Buy becomes active immediately; Rent requires approval.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className={`${button} ${buttonPrimary}`}
                  disabled={!accepted || activeBuy}
                  title={!accepted ? "Accept Terms first" : activeBuy ? "Buy contract already active" : ""}
                  onClick={() => window.location.assign("/documents")}
                >
                  {activeBuy ? "Buy active" : "Start Buy"}
                </button>
                <button
                  className={`${button} ${buttonGhost}`}
                  disabled={!accepted || !!rentAwaitingApproval || activeRent}
                  title={
                    !accepted
                      ? "Accept Terms first"
                      : rentAwaitingApproval
                      ? "Rent contract awaiting approval"
                      : activeRent
                      ? "Rent contract already active"
                      : ""
                  }
                  onClick={() => window.location.assign("/documents")}
                >
                  {activeRent ? "Rent active" : rentAwaitingApproval ? "Awaiting approval" : "Start Rent"}
                </button>
              </div>

              {/* Current state preview */}
              <div className="mt-3 text-sm">
                <div>
                  Buy:&nbsp;
                  {activeBuy ? <span className="text-green-300">active</span> : "—"}
                </div>
                <div>
                  Rent:&nbsp;
                  {activeRent ? (
                    <span className="text-green-300">active</span>
                  ) : rentAwaitingApproval ? (
                    <span className="text-yellow-300">awaiting approval</span>
                  ) : (
                    "—"
                  )}
                </div>
              </div>
            </div>

            {/* Step 3: Approval */}
            <div className="rounded-xl border border-white/10 p-4 bg-white/5">
              <div className="flex items-center justify-between">
                <div className="font-medium">Step 3 — Approval</div>
                <StepBadge
                  state={
                    activeBuy || activeRent
                      ? "done"
                      : rentAwaitingApproval
                      ? "wait"
                      : accepted
                      ? "todo"
                      : "wait"
                  }
                />
              </div>
              {activeBuy ? (
                <p className="text-sm text-green-300 mt-2">Buy contract active — you can order now.</p>
              ) : activeRent ? (
                <p className="text-sm text-green-300 mt-2">Rent contract approved — you can order now.</p>
              ) : rentAwaitingApproval ? (
                <p className="text-sm text-yellow-300 mt-2">Rent contract signed — waiting for admin approval.</p>
              ) : (
                <p className="text-sm text-white/70 mt-2">No active contract yet.</p>
              )}
            </div>
          </div>
        </section>

        {/* Prices */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">
          <Tile title="Petrol (95)" value={petrolPrice != null ? GBP(petrolPrice) : "—"} suffix="/ litre" />
          <Tile title="Diesel" value={dieselPrice != null ? GBP(dieselPrice) : "—"} suffix="/ litre" />
          <Tile title="Estimated Total" value={GBP(estTotal)} />
        </div>

        {/* Order form */}
        <section className={`${card} px-5 md:px-6 py-6`}>
          {!requirementsOkay && (
            <div className="mb-4 text-center text-yellow-300 text-sm">
              Complete the steps above to enable ordering.
            </div>
          )}

          <div className={`${row} ${!requirementsOkay ? "opacity-60" : ""}`}>
            <div>
              <label className={label}>Fuel</label>
              <select className={input} value={fuel} onChange={(e) => setFuel(e.target.value as Fuel)} disabled={!requirementsOkay}>
                <option value="diesel">Diesel</option>
                <option value="petrol">Petrol</option>
              </select>
            </div>

            <div>
              <label className={label}>Litres</label>
              <input className={input} type="number" min={1} value={litres} onChange={(e) => setLitres(Number(e.target.value))} disabled={!requirementsOkay} />
            </div>

            <div>
              <label className={label}>Delivery date</label>
              <input className={input} type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} disabled={!requirementsOkay} />
            </div>

            <div>
              <label className={label}>Your email (receipt)</label>
              <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!requirementsOkay} />
            </div>

            <div className="md:col-span-2">
              <label className={label}>Full name</label>
              <input className={input} value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={!requirementsOkay} />
            </div>

            <div>
              <label className={label}>Address line 1</label>
              <input className={input} value={address1} onChange={(e) => setAddress1(e.target.value)} disabled={!requirementsOkay} />
            </div>

            <div>
              <label className={label}>Address line 2</label>
              <input className={input} value={address2} onChange={(e) => setAddress2(e.target.value)} disabled={!requirementsOkay} />
            </div>

            <div>
              <label className={label}>Postcode</label>
              <input className={input} value={postcode} onChange={(e) => setPostcode(e.target.value)} disabled={!requirementsOkay} />
            </div>

            <div>
              <label className={label}>City</label>
              <input className={input} value={city} onChange={(e) => setCity(e.target.value)} disabled={!requirementsOkay} />
            </div>

            <div className="md:col-span-2 mt-3">
              <button className={`${button} ${buttonPrimary} w-full md:w-auto`} disabled={payDisabled || startingCheckout} onClick={startCheckout}>
                {startingCheckout ? "Starting checkout…" : "Pay with Stripe"}
              </button>
            </div>
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}

/* =========================
   Small UI helpers
   ========================= */
function Tile({ title, value, suffix }: { title: string; value: string; suffix?: string }) {
  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
      <div className="text-white/70 text-sm">{title}</div>
      <div className="mt-1 text-2xl font-semibold">
        {value} {suffix && <span className="text-white/50 text-base">{suffix}</span>}
      </div>
    </div>
  );
}

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
