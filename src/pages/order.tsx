// src/pages/order.tsx
// /src/pages/order.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import HCaptcha from "@hcaptcha/react-hcaptcha";

/* ========= Supabase ========= */
const supabase =
  typeof window !== "undefined"
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || "",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
      )
    : (null as any);

/* ========= UI tokens ========= */
const wrap = "rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-5 py-4 shadow transition";
const btn = "rounded-2xl px-4 py-2 font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed";
const btnPrimary = "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400 active:bg-yellow-300";
const btnGhost = "bg-white/10 hover:bg-white/15 text-white border border-white/10";
const input = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none focus:ring focus:ring-yellow-500/30";
const label = "block text-sm font-medium text-white/80 mb-1";
const row = "grid grid-cols-1 md:grid-cols-2 gap-4";

/* ========= Types ========= */
type Fuel = "diesel" | "petrol";
type TankOption = "buy" | "rent";
type ContractRow = {
  id: string;
  email: string | null;
  tank_option: TankOption;
  status: "draft" | "signed" | "approved" | "cancelled";
};

/* ========= Helpers ========= */
const GBP = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n);

export default function OrderPage() {
  // auth & email
  const [email, setEmail] = useState("");

  // live prices
  const [petrolPrice, setPetrolPrice] = useState<number | null>(null);
  const [dieselPrice, setDieselPrice] = useState<number | null>(null);

  // contracts / requirements
  const [accepted, setAccepted] = useState(false);
  const [hasBuy, setHasBuy] = useState(false);
  const [hasRentApproved, setHasRentApproved] = useState(false);

  // form
  const [fuel, setFuel] = useState<Fuel>("diesel");
  const [litres, setLitres] = useState<number>(1000);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [fullName, setFullName] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [postcode, setPostcode] = useState("");
  const [city, setCity] = useState("");

  // hCaptcha
  const [captchaOk, setCaptchaOk] = useState(false);
  const hSiteKey = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY || "";

  // checkout
  const [startingCheckout, setStartingCheckout] = useState(false);

  /* ---------- auth & email ---------- */
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const em = (data?.user?.email || "").toLowerCase();
      setEmail(em);
    })();
  }, []);

  /* ---------- prices ---------- */
  useEffect(() => {
    (async () => {
      try {
        let { data: lp } = await supabase
          .from("latest_prices")
          .select("fuel,total_price");
        if (!lp?.length) {
          const { data: dp } = await supabase
            .from("latest_daily_prices")
            .select("fuel,total_price");
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

  /* ---------- requirements ---------- */
  useEffect(() => {
    if (!email) return;
    (async () => {
      // T&C
      const { data: t } = await supabase
        .from("terms_acceptances")
        .select("id")
        .eq("email", email)
        .order("accepted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setAccepted(!!t);

      // contracts
      const { data: c } = await supabase
        .from("contracts")
        .select("id,tank_option,status")
        .eq("email", email)
        .order("created_at", { ascending: false });

      const rows = (c ?? []) as ContractRow[];
      setHasBuy(rows.some((r) => r.tank_option === "buy" && (r.status === "signed" || r.status === "approved")));
      setHasRentApproved(rows.some((r) => r.tank_option === "rent" && r.status === "approved"));
    })();
  }, [email]);

  /* ---------- derived ---------- */
  const unitPrice = fuel === "diesel" ? dieselPrice : petrolPrice;
  const estTotal = useMemo(
    () => (unitPrice != null && Number.isFinite(litres) ? litres * unitPrice : 0),
    [litres, unitPrice]
  );

  const requirementsOkay = accepted && (hasBuy || hasRentApproved);

  /* ---------- checkout ---------- */
  async function startCheckout() {
    try {
      if (!requirementsOkay) {
        alert("Complete requirements first (Terms + active contract). Go to Documents.");
        return;
      }
      if (hSiteKey && !captchaOk) {
        alert("Please complete the hCaptcha.");
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
    <main className="min-h-screen bg-[#061B34] text-white pb-20">
      <div className="mx-auto w-full max-w-6xl px-4 pt-10">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <img src="/logo-email.png" alt="FuelFlow" width={116} height={28} className="opacity-90" />
          <h1 className="ml-3 text-3xl md:text-4xl font-bold">Place an Order</h1>
          <div className="ml-auto">
            <Link href="/client-dashboard" className="text-white/70 hover:text-white">
              Back to Dashboard
            </Link>
          </div>
        </div>

        {/* Requirements banner */}
        {!requirementsOkay && (
          <div className="mb-4 rounded-xl border border-yellow-400/30 bg-yellow-400/10 p-3 text-sm text-yellow-100">
            You need to accept the latest Terms and have an active contract (Buy or approved Rent).
            Manage them on the{" "}
            <Link href="/documents" className="underline decoration-yellow-300 underline-offset-2">
              Documents
            </Link>{" "}
            page.
          </div>
        )}

        {/* Prices row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">
          <Tile title="Petrol (95)" value={petrolPrice != null ? GBP(petrolPrice) : "—"} suffix="/ litre" />
          <Tile title="Diesel" value={dieselPrice != null ? GBP(dieselPrice) : "—"} suffix="/ litre" />
          <Tile title="Estimated Total" value={GBP(estTotal)} />
        </div>

        {/* Order form */}
        <section className={`${wrap} px-5 md:px-6 py-6`}>
          <div className={row}>
            <div>
              <label className={label}>Fuel</label>
              <select className={input} value={fuel} onChange={(e) => setFuel(e.target.value as Fuel)}>
                <option value="diesel">Diesel</option>
                <option value="petrol">Petrol</option>
              </select>
            </div>

            <div>
              <label className={label}>Litres</label>
              <input className={input} type="number" min={1} value={litres} onChange={(e) => setLitres(Number(e.target.value))} />
            </div>

            <div>
              <label className={label}>Delivery date</label>
              <input className={input} type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
            </div>

            <div>
              <label className={label}>Your email (receipt)</label>
              <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            <div className="md:col-span-2">
              <label className={label}>Full name</label>
              <input className={input} value={fullName} onChange={(e) => setFullName(e.target.value)} />
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
              <label className={label}>Postcode</label>
              <input className={input} value={postcode} onChange={(e) => setPostcode(e.target.value)} />
            </div>

            <div>
              <label className={label}>City</label>
              <input className={input} value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
          </div>

          {/* T&C + hCaptcha */}
          <div className="mt-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={accepted}
                disabled
                className="h-5 w-5 accent-yellow-400 rounded"
                readOnly
              />
              <div className="text-sm text-white/80">
                <span className="font-semibold">Terms &amp; Conditions</span> — already accepted.
                <Link href="/terms" className="ml-2 underline decoration-yellow-300 underline-offset-2">
                  View
                </Link>
              </div>
            </div>

            {/* hCaptcha appears only if site key exists */}
            {hSiteKey ? (
              <HCaptcha
                sitekey={hSiteKey}
                onVerify={() => setCaptchaOk(true)}
                onExpire={() => setCaptchaOk(false)}
                theme="dark"
              />
            ) : (
              <div className="text-xs text-white/50">
                hCaptcha not configured (set NEXT_PUBLIC_HCAPTCHA_SITE_KEY to enable)
              </div>
            )}
          </div>

          <div className="mt-5">
            <button
              className={`${btn} ${btnPrimary}`}
              onClick={startCheckout}
              disabled={
                !email ||
                !fullName ||
                !address1 ||
                !postcode ||
                !city ||
                !deliveryDate ||
                litres <= 0 ||
                startingCheckout ||
                !requirementsOkay ||
                (hSiteKey ? !captchaOk : false)
              }
            >
              {startingCheckout ? "Starting checkout…" : "Pay with Stripe"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

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

