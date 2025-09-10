// src/pages/order.tsx
// src/pages/order.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

/* =========================
   Setup & types
   ========================= */

type Fuel = "diesel" | "petrol";
type TankOption = "buy" | "rent";
type ContractStatus = "draft" | "signed" | "approved" | "cancelled";

const TERMS_VERSION = "v1.1";

type ContractRow = {
  id: string;
  tank_option: TankOption;
  status: ContractStatus;
  signed_at: string | null;
  approved_at: string | null;
  email: string | null;
};

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

const card =
  "rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-5 py-4 shadow transition";
const button =
  "rounded-xl px-4 py-2 font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed";
const buttonPrimary =
  "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400 active:bg-yellow-300";
const buttonGhost =
  "border border-white/15 bg-white/5 hover:bg-white/10 text-white";
const input =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none focus:ring focus:ring-yellow-500/30";
const label = "block text-sm font-medium text-white/80 mb-1";
const row = "grid grid-cols-1 md:grid-cols-2 gap-4";

/* =========================
   Helpers
   ========================= */

function GBP(n: number) {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function toDateMaybe(r: any): Date | null {
  const k =
    r?.updated_at ?? r?.price_date ?? r?.created_at ?? r?.ts ?? r?.at ?? null;
  return k ? new Date(k) : null;
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* =========================
   Page
   ========================= */

export default function OrderPage() {
  // auth identity (used for gating)
  const [userEmail, setUserEmail] = useState<string>("");

  // live prices
  const [petrolPrice, setPetrolPrice] = useState<number | null>(null);
  const [dieselPrice, setDieselPrice] = useState<number | null>(null);
  const [pricesUpdatedAt, setPricesUpdatedAt] = useState<Date | null>(null);
  const [loadingPrices, setLoadingPrices] = useState<boolean>(true);

  // form state
  const [fuel, setFuel] = useState<Fuel>("diesel");
  const [litres, setLitres] = useState<number>(1000);
  const [deliveryDate, setDeliveryDate] = useState("");

  const [receiptEmail, setReceiptEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [postcode, setPostcode] = useState("");
  const [city, setCity] = useState("");

  // validation state
  const [dateError, setDateError] = useState<string | null>(null);

  // requirements
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [buyContract, setBuyContract] = useState<ContractRow | null>(null);
  const [rentContract, setRentContract] = useState<ContractRow | null>(null);

  const [startingCheckout, setStartingCheckout] = useState(false);

  // Earliest date = today + 14 days
  const minDeliveryDateStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return ymd(d);
  }, []);

  /* ---------- load auth + requirements ---------- */
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const emailLower = (auth?.user?.email || "").toLowerCase();
      if (!emailLower) {
        window.location.href = "/login";
        return;
      }
      setUserEmail(emailLower);
      if (!receiptEmail) setReceiptEmail(emailLower);

      // TERMS
      const { data: t } = await supabase
        .from("terms_acceptances")
        .select("id")
        .eq("email", emailLower)
        .eq("version", TERMS_VERSION)
        .limit(1);
      setTermsAccepted(!!t?.length);

      // CONTRACTS
      const { data: c } = await supabase
        .from("contracts")
        .select("id,tank_option,status,signed_at,approved_at,email")
        .eq("email", emailLower)
        .order("created_at", { ascending: false });

      const rows = (c || []) as ContractRow[];
      setBuyContract(
        rows.find(
          (r) =>
            r.tank_option === "buy" &&
            (r.status === "approved" || r.status === "signed")
        ) ?? null
      );
      setRentContract(
        rows.find((r) => r.tank_option === "rent" && r.status === "approved") ??
          null
      ); // for ordering, Rent must be approved
    })();
  }, [receiptEmail]);

  /* ---------- live prices ---------- */
  useEffect(() => {
    (async () => {
      try {
        setLoadingPrices(true);
        const trySelect = async (from: string, select = "*") =>
          supabase?.from(from as any).select(select).limit(10);

        let rows: any[] | null = null;

        let res = await trySelect("latest_prices", "*");
        if (res && !res.error && res.data?.length) rows = res.data as any[];

        if (!rows) {
          res = await trySelect("latest_daily_prices", "*");
          if (res && !res.error && res.data?.length) rows = res.data as any[];
        }
        if (!rows) {
          res = await trySelect("latest_fuel_prices_view", "*");
          if (res && !res.error && res.data?.length) rows = res.data as any[];
        }
        if (!rows) {
          res = await trySelect("latest_prices_view", "*");
          if (res && !res.error && res.data?.length) rows = res.data as any[];
        }
        if (!rows) {
          const dp = await supabase
            .from("daily_prices")
            .select("*")
            .order("price_date", { ascending: false })
            .limit(2);
          if (!dp.error && dp.data?.length) rows = dp.data as any[];
        }

        if (rows?.length) {
          let updated: Date | null = null;
          rows.forEach((r) => {
            const f = (r.fuel ?? r.product ?? "")
              .toString()
              .toLowerCase();
            const price = Number(
              r.total_price ?? r.price ?? r.latest_price ?? r.unit_price
            );
            const ts = toDateMaybe(r);
            if (ts && (!updated || ts > updated)) updated = ts;
            if (f === "petrol") setPetrolPrice(Number.isFinite(price) ? price : null);
            if (f === "diesel") setDieselPrice(Number.isFinite(price) ? price : null);
          });
          setPricesUpdatedAt(updated);
        }
      } finally {
        setLoadingPrices(false);
      }
    })();
  }, []);

  /* ---------- derived ---------- */

  const unitPrice = fuel === "diesel" ? dieselPrice ?? 0 : petrolPrice ?? 0;
  const estTotal = useMemo(
    () => (Number.isFinite(litres) ? litres * unitPrice : 0),
    [litres, unitPrice]
  );

  // gating:
  // - Terms must be accepted
  // - Either Buy is signed/approved OR Rent is approved
  const hasBuy = !!buyContract;
  const hasRentApproved = !!rentContract;
  const requirementsMet = termsAccepted && (hasBuy || hasRentApproved);

  // date validation
  useEffect(() => {
    if (!deliveryDate) {
      setDateError(null);
      return;
    }
    const chosen = new Date(deliveryDate);
    const min = new Date(minDeliveryDateStr);
    if (isNaN(chosen.getTime())) {
      setDateError("Please choose a valid date.");
    } else if (chosen < min) {
      setDateError(
        `Earliest delivery is ${new Date(minDeliveryDateStr).toLocaleDateString()} (two weeks from today).`
      );
    } else {
      setDateError(null);
    }
  }, [deliveryDate, minDeliveryDateStr]);

  const payDisabled =
    !requirementsMet ||
    !!dateError ||
    !fullName ||
    !address1 ||
    !postcode ||
    !city ||
    !deliveryDate ||
    !Number.isFinite(litres) ||
    litres <= 0 ||
    unitPrice <= 0 ||
    !receiptEmail;

  async function startCheckout() {
    try {
      setStartingCheckout(true);

      // final guard on date rule
      const min = new Date(minDeliveryDateStr);
      const chosen = new Date(deliveryDate);
      if (!deliveryDate || isNaN(chosen.getTime()) || chosen < min) {
        throw new Error(
          `Earliest delivery is ${min.toLocaleDateString()}. Please pick a date two weeks from today or later.`
        );
      }

      const res = await fetch("/api/stripe/checkout/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fuel,
          litres,
          deliveryDate,
          full_name: fullName,
          email: receiptEmail,
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
    <main className="relative min-h-[100svh] md:min-h-screen bg-[#061B34] text-white pb-24 md:pb-12 pt-[env(safe-area-inset-top)]">
      {/* Layered premium background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0b2344] via-[#061B34] to-[#041F3E]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.08),transparent_55%)]" />
        <div className="absolute -top-24 -right-24 w-[520px] h-[520px] rounded-full blur-3xl opacity-20 bg-yellow-500/20" />
      </div>

      {/* Header */}
      <div className="relative mx-auto w-full max-w-6xl px-4 pt-6 md:pt-10">
        <div className="mb-6 flex items-center gap-3">
          <img
            src="/logo-email.png"
            alt="FuelFlow"
            width={116}
            height={28}
            className="opacity-90 hidden sm:block"
          />
          <div className="text-2xl md:text-3xl font-bold">Place an Order</div>

          <div className="ml-auto flex gap-2">
            <Link
              href="/client-dashboard"
              className={`${button} ${buttonGhost}`}
            >
              Back to Dashboard
            </Link>
            <Link href="/documents" className={`${button} ${buttonGhost}`}>
              Documents
            </Link>
          </div>
        </div>

        {/* Price tiles + timestamp */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
          <Tile title="Petrol (95)" value={petrolPrice != null ? GBP(petrolPrice) : "—"} suffix="/ litre" />
          <Tile title="Diesel" value={dieselPrice != null ? GBP(dieselPrice) : "—"} suffix="/ litre" />
          <Tile title="Estimated Total" value={GBP(estTotal)} />
        </div>
        <div className="mb-6 text-xs text-white/70">
          {loadingPrices
            ? "Loading prices…"
            : pricesUpdatedAt
            ? `Last update: ${pricesUpdatedAt.toLocaleString()}`
            : "Prices timestamp unavailable."}
        </div>

        {/* Requirements hint */}
        {!requirementsMet && (
          <div className="mb-6 rounded-2xl border border-yellow-400/40 bg-yellow-500/10 p-4 text-sm text-yellow-200">
            <div className="font-semibold mb-1">Complete your documents to order</div>
            <div>
              You must accept the Terms and have either a <b>Buy</b> contract signed or a{" "}
              <b>Rent</b> contract approved. Open{" "}
              <Link
                href="/documents"
                className="underline decoration-yellow-400 underline-offset-2"
              >
                Documents
              </Link>{" "}
              to complete this.
            </div>
          </div>
        )}

        {/* Main content: Form left, Summary right (stack on mobile) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start relative">
          {/* Form */}
          <section className={`lg:col-span-2 ${card} px-5 md:px-6 py-6 ring-1 ring-white/5`}>
            {/* Order details */}
            <h2 className="mb-3 text-lg font-semibold">Order details</h2>
            <div className={row}>
              <div>
                <label className={label}>Fuel</label>
                <select
                  className={input}
                  value={fuel}
                  onChange={(e) => setFuel(e.target.value as Fuel)}
                >
                  <option value="diesel">Diesel</option>
                  <option value="petrol">Petrol</option>
                </select>
              </div>

              <div>
                <label className={label}>Litres</label>
                <input
                  className={input}
                  type="number"
                  min={1}
                  value={litres}
                  onChange={(e) => setLitres(Number(e.target.value))}
                />
              </div>

              <div>
                <label className={label}>
                  Delivery date{" "}
                  <span className="text-white/50">
                    (earliest {new Date(minDeliveryDateStr).toLocaleDateString()})
                  </span>
                </label>
                <input
                  className={input}
                  type="date"
                  value={deliveryDate}
                  min={minDeliveryDateStr}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                />
                {dateError && (
                  <div className="mt-1 text-xs text-rose-300">{dateError}</div>
                )}
              </div>

              <div>
                <label className={label}>Your email (receipt)</label>
                <input
                  className={input}
                  type="email"
                  placeholder="name@company.com"
                  value={receiptEmail}
                  onChange={(e) => setReceiptEmail(e.target.value)}
                />
              </div>
            </div>

            {/* Delivery address */}
            <h2 className="mt-6 mb-2 text-lg font-semibold flex items-center gap-2">
              <TruckIcon className="h-5 w-5 text-white/70" />
              Delivery address
            </h2>
            <p className="mb-3 text-xs text-white/70">
              <strong>This is the address where the fuel will be delivered.</strong> Please ensure
              access is safe and clearly signposted on the day.
            </p>

            <div className={row}>
              <div className="md:col-span-2">
                <label className={label}>Full name / Site contact</label>
                <input
                  className={input}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div>
                <label className={label}>Address line 1</label>
                <input
                  className={input}
                  value={address1}
                  onChange={(e) => setAddress1(e.target.value)}
                />
              </div>

              <div>
                <label className={label}>Address line 2 (optional)</label>
                <input
                  className={input}
                  value={address2}
                  onChange={(e) => setAddress2(e.target.value)}
                />
              </div>

              <div>
                <label className={label}>Postcode</label>
                <input
                  className={input}
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value)}
                />
              </div>

              <div>
                <label className={label}>City / Town</label>
                <input
                  className={input}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
            </div>

            {/* (Removed the form-area Pay with Stripe button as requested) */}
          </section>

          {/* Summary (with the only desktop Pay button) */}
          <aside className={`${card} p-5 ring-1 ring-white/5`}>
            <h3 className="text-lg font-semibold mb-3">Summary</h3>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-white/70">Fuel</span>
                <span className="font-medium capitalize">{fuel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/70">Litres</span>
                <span className="font-medium">{Number(litres || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/70">Unit price</span>
                <span className="font-medium">{GBP(unitPrice)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/70">Delivery date</span>
                <span className="font-medium">
                  {deliveryDate ? new Date(deliveryDate).toLocaleDateString() : "—"}
                </span>
              </div>
            </div>

            <hr className="my-4 border-white/10" />

            <div className="flex justify-between text-base">
              <span className="text-white/80">Estimated total</span>
              <span className="font-semibold">{GBP(estTotal)}</span>
            </div>

            <p className="mt-4 text-xs text-white/70">
              Final amount may vary if delivery conditions require adjustments (e.g., timed slots,
              restricted access or waiting time). You’ll receive a receipt by email.
            </p>

            <button
              className={`${button} ${buttonPrimary} w-full mt-4 hidden md:block`}
              disabled={payDisabled || startingCheckout}
              onClick={startCheckout}
              title={!requirementsMet ? "Complete Documents first" : ""}
            >
              {startingCheckout ? "Processing…" : "Pay"}
            </button>
          </aside>
        </div>
      </div>

      {/* Sticky summary bar (mobile only) */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#0b1f3a]/95 backdrop-blur md:hidden pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <div className="flex-1">
            <div className="text-xs text-white/60">Estimated total</div>
            <div className="text-lg font-semibold">{GBP(estTotal)}</div>
          </div>
          <button
            className={`${button} ${buttonPrimary}`}
            disabled={payDisabled || startingCheckout}
            onClick={startCheckout}
          >
            {startingCheckout ? "Processing…" : "Pay"}
          </button>
        </div>
      </div>

      <footer className="mt-12 text-center text-white/40 text-xs relative">
        © {new Date().getFullYear()} FuelFlow. All rights reserved.
      </footer>
    </main>
  );
}

/* =========================
   Small UI helpers
   ========================= */

function Tile({
  title,
  value,
  suffix,
}: {
  title: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-4 ring-1 ring-white/5">
      <div className="text-white/70 text-sm">{title}</div>
      <div className="mt-1 text-2xl font-semibold">
        {value} {suffix && <span className="text-white/50 text-base">{suffix}</span>}
      </div>
    </div>
  );
}

function TruckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 7h11v8H3z" />
      <path d="M14 10h4l3 3v2h-7z" />
      <circle cx="7.5" cy="17.5" r="1.5" />
      <circle cx="17.5" cy="17.5" r="1.5" />
    </svg>
  );
}
