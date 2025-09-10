// src/pages/order.tsx
// src/pages/order.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseClient";

type Fuel = "diesel" | "petrol";
const TERMS_VERSION = "v1.1";

/* UI */
const uiPage = "min-h-screen bg-[#061B34] text-white pb-20";
const uiWrap = "mx-auto w-full max-w-6xl px-4 pt-10";
const uiHeading = "text-3xl md:text-4xl font-bold";
const uiCard = "rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5 shadow";
const uiTile = "rounded-2xl bg-white/5 border border-white/10 p-4";
const uiLabel = "block text-sm font-medium text-white/80 mb-1";
const uiInput = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none focus:ring focus:ring-yellow-500/30";
const uiBtn = "inline-flex items-center justify-center rounded-2xl px-4 py-2 font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed";
const uiBtnPrimary = "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400 active:bg-yellow-300";

/* Page */
export default function OrderPage() {
  const supabase = supabaseBrowser;

  const [email, setEmail] = useState("");
  const [termsAccepted, setTermsAccepted] = useState<boolean | null>(null);

  // Prices
  const [petrolPrice, setPetrolPrice] = useState<number | null>(null);
  const [dieselPrice, setDieselPrice] = useState<number | null>(null);

  // Form
  const [fuel, setFuel] = useState<Fuel>("diesel");
  const [litres, setLitres] = useState<number>(1000);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [fullName, setFullName] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [postcode, setPostcode] = useState("");
  const [city, setCity] = useState("");

  const [startingCheckout, setStartingCheckout] = useState(false);

  // Prefill user email
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const em = (data?.user?.email || "").toLowerCase();
      if (em) setEmail(em);
    })();
  }, [supabase]);

  // Prices
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
  }, [supabase]);

  // Terms
  useEffect(() => {
    if (!email) return;
    (async () => {
      const { data } = await supabase
        .from("terms_acceptances")
        .select("id,accepted_at")
        .eq("email", email)
        .eq("version", TERMS_VERSION)
        .maybeSingle();
      setTermsAccepted(Boolean(data?.id));
    })();
  }, [email, supabase]);

  // Contracts gate (buy signed/approved OR rent approved)
  const [canOrder, setCanOrder] = useState<boolean>(false);
  useEffect(() => {
    if (!email) return;
    (async () => {
      const { data } = await supabase
        .from("contracts")
        .select("tank_option,status")
        .eq("email", email);
      const rows = (data ?? []) as { tank_option: "buy" | "rent"; status: "draft" | "signed" | "approved" | "cancelled" }[];
      const buyActive = rows.some(r => r.tank_option === "buy" && (r.status === "signed" || r.status === "approved"));
      const rentActive = rows.some(r => r.tank_option === "rent" && r.status === "approved");
      setCanOrder(Boolean(buyActive || rentActive));
    })();
  }, [email, supabase]);

  const unitPriceSelected = fuel === "diesel" ? dieselPrice : petrolPrice;
  const estTotal = useMemo(
    () => (unitPriceSelected != null && Number.isFinite(litres) ? litres * unitPriceSelected : 0),
    [litres, unitPriceSelected]
  );
  const GBP = (n: number | null | undefined) =>
    n == null || !Number.isFinite(n)
      ? "—"
      : new Intl.NumberFormat("en-GB", {
          style: "currency",
          currency: "GBP",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(n || 0);

  const payDisabled =
    !(termsAccepted && canOrder) ||
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
      if (!(termsAccepted && canOrder)) {
        alert("Please accept Terms and ensure your contract is active on the Documents page.");
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

  return (
    <main className={uiPage}>
      <div className={uiWrap}>
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo-email.png" alt="FuelFlow" width={116} height={28} className="opacity-90" />
            <h1 className={uiHeading}>Place an Order</h1>
          </div>
          <Link href="/client-dashboard" className="text-white/70 hover:text-white">
            Back to Dashboard
          </Link>
        </div>

        {/* Banner */}
        <div className={`${uiCard} mb-6`}>
          <div className="text-sm">
            You need to accept the latest Terms and have an active contract (Buy or approved Rent).
            Manage them on the{" "}
            <Link href="/documents" className="underline hover:text-white">
              Documents
            </Link>{" "}
            page.
          </div>
        </div>

        {/* Prices */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className={uiTile}>
            <div className="text-white/70 text-sm">Petrol (95)</div>
            <div className="mt-1 text-2xl font-semibold">
              {GBP(petrolPrice)} <span className="text-white/50 text-base">/ litre</span>
            </div>
          </div>
          <div className={uiTile}>
            <div className="text-white/70 text-sm">Diesel</div>
            <div className="mt-1 text-2xl font-semibold">
              {GBP(dieselPrice)} <span className="text-white/50 text-base">/ litre</span>
            </div>
          </div>
          <div className={uiTile}>
            <div className="text-white/70 text-sm">Estimated Total</div>
            <div className="mt-1 text-2xl font-semibold">{GBP(estTotal)}</div>
          </div>
        </div>

        {/* Form */}
        <section className={uiCard}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={uiLabel}>Fuel</label>
              <select className={uiInput} value={fuel} onChange={(e) => setFuel(e.target.value as Fuel)}>
                <option value="diesel">Diesel</option>
                <option value="petrol">Petrol</option>
              </select>
            </div>
            <div>
              <label className={uiLabel}>Litres</label>
              <input className={uiInput} type="number" min={1} value={litres} onChange={(e) => setLitres(Number(e.target.value))} />
            </div>
            <div>
              <label className={uiLabel}>Delivery date</label>
              <input className={uiInput} type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
            </div>
            <div>
              <label className={uiLabel}>Your email (receipt)</label>
              <input className={uiInput} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className={uiLabel}>Full name</label>
              <input className={uiInput} value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div>
              <label className={uiLabel}>Address line 1</label>
              <input className={uiInput} value={address1} onChange={(e) => setAddress1(e.target.value)} />
            </div>
            <div>
              <label className={uiLabel}>Address line 2</label>
              <input className={uiInput} value={address2} onChange={(e) => setAddress2(e.target.value)} />
            </div>
            <div>
              <label className={uiLabel}>Postcode</label>
              <input className={uiInput} value={postcode} onChange={(e) => setPostcode(e.target.value)} />
            </div>
            <div>
              <label className={uiLabel}>City</label>
              <input className={uiInput} value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
          </div>

          {/* Terms tick, reflects accepted */}
          <div className="mt-4 flex items-center gap-3">
            <input type="checkbox" checked={!!termsAccepted} readOnly className="h-4 w-4 rounded border-white/20 bg-white/5" />
            <span className="text-sm text-white/80">
              <span className="font-medium">Terms & Conditions</span> — already accepted.{" "}
              <Link href="/terms" className="underline">View</Link>
            </span>
          </div>

          <div className="mt-4">
            <button className={`${uiBtn} ${uiBtnPrimary}`} disabled={payDisabled || startingCheckout} onClick={startCheckout}>
              {startingCheckout ? "Starting checkout…" : "Pay with Stripe"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
