// src/pages/order.tsx
// src/pages/order.tsx
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

const TERMS_VERSION = "v1.2";

// Special litres rules:
// - In production: 500+ litres
// - For testing: exactly 1 litre is also allowed.
const TEST_LITRES = 1;
const BUSINESS_MIN_LITRES = 500;

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
   UI tokens (aligned to dashboard)
   ========================= */

const card = "rounded-xl bg-gray-800 p-5 md:p-6";
const button =
  "rounded-lg px-4 py-2 font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed";
const buttonPrimary =
  "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400 active:bg-yellow-300";
const buttonGhost = "bg-white/10 hover:bg-white/15 text-white";
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

// ---- working-day helpers ----

function isWorkingDay(date: Date) {
  const day = date.getDay(); // 0 = Sun, 6 = Sat
  return day !== 0 && day !== 6;
}

function addWorkingDays(from: Date, days: number) {
  const d = new Date(from);
  let remaining = days;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    if (isWorkingDay(d)) remaining -= 1;
  }
  return d;
}

/**
 * Business rule:
 * - Orders are processed Mon–Fri, 09:00–17:00.
 * - If placed outside those hours, treat as received on next working day.
 * - Earliest delivery = 3 working days after that processing day.
 */
function getEarliestDeliveryDate() {
  const now = new Date();
  const processing = new Date(now);

  const hour = now.getHours();

  if (!isWorkingDay(now) || hour < 9 || hour >= 17) {
    // move to next working day at 09:00
    do {
      processing.setDate(processing.getDate() + 1);
    } while (!isWorkingDay(processing));
    processing.setHours(9, 0, 0, 0);
  }

  // add 3 working days
  const earliest = addWorkingDays(processing, 3);
  return earliest;
}

function isValidLitres(value: number) {
  if (!Number.isFinite(value) || value <= 0) return false;
  if (value === TEST_LITRES) return true; // 1L test orders
  return value >= BUSINESS_MIN_LITRES; // real orders
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
  const [litresError, setLitresError] = useState<string | null>(null);
  const [showDeliveryInfo, setShowDeliveryInfo] = useState(false);
  const [showLitresInfo, setShowLitresInfo] = useState(false);

  // requirements
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [buyContract, setBuyContract] = useState<ContractRow | null>(null);
  const [rentContract, setRentContract] = useState<ContractRow | null>(null);

  const [startingCheckout, setStartingCheckout] = useState(false);

  // Earliest date based on working-days rule
  const minDeliveryDateStr = useMemo(() => {
    const earliest = getEarliestDeliveryDate();
    return ymd(earliest);
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
            if (f === "petrol")
              setPetrolPrice(Number.isFinite(price) ? price : null);
            if (f === "diesel")
              setDieselPrice(Number.isFinite(price) ? price : null);
          });
          // fallback to "now" if no timestamp column on the price row
          setPricesUpdatedAt(updated || new Date());
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

  // date validation (weekday + minimum date)
  useEffect(() => {
    if (!deliveryDate) {
      setDateError(null);
      return;
    }
    const chosen = new Date(deliveryDate);
    const min = new Date(minDeliveryDateStr);
    if (isNaN(chosen.getTime())) {
      setDateError("Please choose a valid date.");
      return;
    }
    if (!isWorkingDay(chosen)) {
      setDateError(
        "Deliveries are Monday to Friday only. Please choose a weekday."
      );
      return;
    }
    if (chosen < min) {
      setDateError(
        `Earliest delivery is ${min.toLocaleDateString()} (3 working days after the processing day).`
      );
      return;
    }
    setDateError(null);
  }, [deliveryDate, minDeliveryDateStr]);

  // litres validation
  useEffect(() => {
    if (!Number.isFinite(litres) || litres <= 0) {
      setLitresError("Please enter a valid number of litres.");
      return;
    }
    if (!isValidLitres(litres)) {
      setLitresError(
        `Normal minimum order is ${BUSINESS_MIN_LITRES} litres. For testing you can also place an order for exactly ${TEST_LITRES} litre.`
      );
      return;
    }
    setLitresError(null);
  }, [litres]);

  const payDisabled =
    !requirementsMet ||
    !!dateError ||
    !!litresError ||
    !fullName ||
    !address1 ||
    !postcode ||
    !city ||
    !deliveryDate ||
    !Number.isFinite(litres) ||
    unitPrice <= 0 ||
    !receiptEmail;

  /* ---------- Stripe checkout (calls our API) ---------- */
  async function startCheckout() {
    try {
      setStartingCheckout(true);

      const litresNum = Number(litres);

      // final guards
      const chosen = new Date(deliveryDate);
      const min = new Date(minDeliveryDateStr);

      if (
        !deliveryDate ||
        isNaN(chosen.getTime()) ||
        chosen < min ||
        !isWorkingDay(chosen)
      ) {
        alert(
          `Please choose a weekday delivery date on or after ${min.toLocaleDateString()}.`
        );
        return;
      }

      if (
        !fuel ||
        !receiptEmail ||
        !fullName ||
        !address1 ||
        !city ||
        !postcode ||
        !deliveryDate ||
        !Number.isFinite(litresNum) ||
        !isValidLitres(litresNum)
      ) {
        alert(
          `Normal minimum order is ${BUSINESS_MIN_LITRES} litres (or ${TEST_LITRES} litre for testing).`
        );
        return;
      }

      // Call our backend that talks to Stripe with Connect split
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fuel, // "diesel" | "petrol" (lowercase)
          litres: litresNum,
          email: receiptEmail.trim(),
          name: fullName.trim(),
          addressLine1: address1.trim(),
          addressLine2: address2.trim() || null,
          city: city.trim(),
          postcode: postcode.trim(),
          deliveryDate, // "YYYY-MM-DD"
        }),
      });

      const data = (await res.json()) as { url?: string; error?: string };

      if (!res.ok || !data.url) {
        alert(data.error || `Checkout failed (${res.status})`);
        return;
      }

      // redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (e: any) {
      alert(e?.message || "Failed to create order");
    } finally {
      setStartingCheckout(false);
    }
  }

  /* ---------- render ---------- */

  return (
    <main className="min-h-[100svh] md:min-h-screen bg-[#0b1220] text-white">
      {/* Sticky, polished toolbar */}
      <div className="sticky top-0 z-40 bg-[#0b1220]/80 backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex h-14 items-center gap-3">
            {/* Left: logo */}
            <Link
              href="/client-dashboard"
              className="shrink-0 inline-flex items-center gap-2"
            >
              <img src="/logo-email.png" alt="FuelFlow" className="h-7 w-auto" />
              <span className="sr-only">Back to dashboard</span>
            </Link>

            {/* Center: Title (hidden on md+, shown below instead) */}
            <div className="flex-1 text-center md:hidden">
              <div className="text-base font-semibold">Place an Order</div>
            </div>

            {/* Right: Actions */}
            <div className="ml-auto flex items-center gap-2">
              {/* Mobile: compact icon buttons */}
              <Link
                href="/client-dashboard"
                title="Back to Dashboard"
                className="md:hidden grid place-items-center h-9 w-9 rounded-lg bg-white/10 hover:bg-white/15"
              >
                <DashboardIcon className="h-5 w-5" />
              </Link>
              <Link
                href="/documents"
                title="Documents"
                className="md:hidden grid place-items-center h-9 w-9 rounded-lg bg-white/10 hover:bg-white/15"
              >
                <DocumentIcon className="h-5 w-5" />
              </Link>

              {/* Desktop: full text buttons */}
              <Link
                href="/documents"
                className={`hidden md:inline-flex ${button} ${buttonGhost}`}
              >
                Documents
              </Link>
              <Link
                href="/client-dashboard"
                className={`hidden md:inline-flex ${button} ${buttonGhost}`}
              >
                Back to Dashboard
              </Link>
            </div>
          </div>
        </div>

        {/* Title row on desktop */}
        <div className="hidden md:block max-w-6xl mx-auto px-4 pb-3">
          <h1 className="text-2xl font-bold">Place an Order</h1>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 pt-4 pb-24 md:pb-12 space-y-6">
        {/* Price tiles + timestamp */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Tile
            title="Petrol (95)"
            value={petrolPrice != null ? GBP(petrolPrice) : "—"}
            suffix="/ litre"
          />
          <Tile
            title="Diesel"
            value={dieselPrice != null ? GBP(dieselPrice) : "—"}
            suffix="/ litre"
          />
          <Tile title="Estimated total" value={GBP(estTotal)} />
        </section>
        <div className="text-xs text-white/70">
          {loadingPrices
            ? "Loading prices…"
            : pricesUpdatedAt
            ? `Last update: ${pricesUpdatedAt.toLocaleString()}`
            : "Prices timestamp unavailable."}
        </div>

        {/* Requirements hint */}
        {!requirementsMet && (
          <div className="rounded-xl border border-yellow-400/30 bg-yellow-500/10 p-4 text-sm text-yellow-200">
            <div className="font-semibold mb-1">
              Complete your documents to order
            </div>
            <div>
              You must accept the Terms and have either a <b>Buy</b> contract
              signed or a <b>Rent</b> contract approved. Open{" "}
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

        {/* Main content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Form */}
          <section className={`lg:col-span-2 ${card}`}>
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
                <div className="flex items-center justify-between">
                  <label className={label}>Litres</label>
                  <button
                    type="button"
                    onClick={() => setShowLitresInfo((v) => !v)}
                    className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-yellow-400 bg-yellow-500/10 text-[10px] text-yellow-300 hover:bg-yellow-500/20"
                    aria-label="Minimum order information"
                  >
                    ?
                  </button>
                </div>
                <input
                  className={input}
                  type="number"
                  min={TEST_LITRES}
                  value={litres}
                  onChange={(e) => setLitres(Number(e.target.value))}
                />
                {showLitresInfo && (
                  <p className="mt-1 text-[11px] text-white/60">
                    For standard deliveries the minimum order is{" "}
                    <strong>{BUSINESS_MIN_LITRES} litres</strong>. For testing
                    purposes this system also allows a{" "}
                    <strong>single {TEST_LITRES} litre</strong> order. Any
                    amount between {TEST_LITRES + 1} and{" "}
                    {BUSINESS_MIN_LITRES - 1} is not allowed.
                  </p>
                )}
                {litresError && (
                  <div className="mt-1 text-xs text-rose-300">
                    {litresError}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className={label}>
                    Delivery date{" "}
                    <span className="text-white/50">
                      (earliest{" "}
                      {new Date(minDeliveryDateStr).toLocaleDateString()})
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowDeliveryInfo((v) => !v)}
                    className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-yellow-400 bg-yellow-500/10 text-[10px] text-yellow-300 hover:bg-yellow-500/20"
                    aria-label="How we calculate earliest delivery"
                  >
                    ?
                  </button>
                </div>
                <input
                  className={input}
                  type="date"
                  value={deliveryDate}
                  min={minDeliveryDateStr}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                />
                {showDeliveryInfo && (
                  <p className="mt-1 text-[11px] text-white/60">
                    Orders are processed Monday–Friday, 9am–5pm. If you order
                    outside those hours (for example late at night or over the
                    weekend), we treat it as received on the{" "}
                    <strong>next working day</strong>. The earliest delivery is
                    then <strong>three working days</strong> after that
                    processing day. Deliveries are on weekdays only.
                  </p>
                )}
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
              <strong>
                This is the address where the fuel will be delivered.
              </strong>{" "}
              Please ensure access is safe and clearly signposted on the day.
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
          </section>

          {/* Summary */}
          <aside className={`${card}`}>
            <h3 className="text-lg font-semibold mb-3">Summary</h3>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-white/70">Fuel</span>
                <span className="font-medium capitalize">{fuel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/70">Litres</span>
                <span className="font-medium">
                  {Number(litres || 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/70">Unit price</span>
                <span className="font-medium">{GBP(unitPrice)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/70">Delivery date</span>
                <span className="font-medium">
                  {deliveryDate
                    ? new Date(deliveryDate).toLocaleDateString()
                    : "—"}
                </span>
              </div>
            </div>

            <hr className="my-4 border-white/10" />

            <div className="flex justify-between text-base">
              <span className="text-white/80">Estimated total</span>
              <span className="font-semibold">{GBP(estTotal)}</span>
            </div>

            {/* No explanatory paragraph here – back to clean layout */}
            <button
              className={`${button} ${buttonPrimary} w-full mt-4 hidden md:block`}
              disabled={payDisabled || startingCheckout}
              onClick={startCheckout}
              title={!requirementsMet ? "Complete Documents first" : ""}
            >
              {startingCheckout ? "Processing…" : "Go to payment"}
            </button>
          </aside>
        </div>
      </div>

      {/* Sticky summary bar (mobile only) */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#0b1220]/95 backdrop-blur md:hidden">
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
            {startingCheckout ? "Processing…" : "Go to payment"}
          </button>
        </div>
      </div>

      <footer className="mt-12 text-center text-white/50 text-xs">
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
    <div className="rounded-xl bg-gray-800 p-4">
      <div className="text-white/70 text-sm">{title}</div>
      <div className="mt-1 text-2xl font-semibold">
        {value}{" "}
        {suffix && <span className="text-white/50 text-base">{suffix}</span>}
      </div>
    </div>
  );
}

function TruckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 7h11v8H3z" />
      <path d="M14 10h4l3 3v2h-7z" />
      <circle cx="7.5" cy="17.5" r="1.5" />
      <circle cx="17.5" cy="17.5" r="1.5" />
    </svg>
  );
}

/* Simple inline icons so we don’t pull extra deps */
function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 13h8V3H3zM13 21h8v-8h-8zM13 3h8v6h-8zM3 21h8v-6H3z" />
    </svg>
  );
}
function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}
