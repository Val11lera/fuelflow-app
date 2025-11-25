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

type OrderStatus =
  | "draft"
  | "pending"
  | "paid"
  | "failed"
  | "refunded"
  | "partially_refunded"
  | "cancelled";

type ContractRow = {
  id: string;
  type: TankOption; // "buy" or "rent"
  status: ContractStatus;
  company_name: string | null;
  billing_address_line1: string | null;
  billing_address_line2: string | null;
  billing_city: string | null;
  billing_postcode: string | null;
  site_address_line1: string | null;
  site_address_line2: string | null;
  site_city: string | null;
  site_postcode: string | null;
};

type PriceRow = {
  id: string;
  fuel: Fuel;
  unit_price_pence: number;
  price_date: string;
  created_at: string;
};

type DailyPriceView = {
  fuel: Fuel;
  unit_price_pence: number;
  updated_at: string | null;
};

type OrdersRow = {
  id: string;
  created_at: string;
  user_email: string | null;
  fuel: Fuel | null;
  litres: number | null;
  unit_price_pence: number | null;
  total_pence: number | null;
  status: OrderStatus | null;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  delivery_date: string | null;
  delivery_address_line1: string | null;
  delivery_address_line2: string | null;
  delivery_city: string | null;
  delivery_postcode: string | null;
  receipt_email: string | null;
  customer_name: string | null;
  fulfilment_status: string | null;
  fulfilment_notes: string | null;
};

// minimal supabase client for browser
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

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

function isWorkingDay(d: Date) {
  const day = d.getDay(); // 0 = Sun, 6 = Sat
  return day !== 0 && day !== 6;
}

function addWorkingDays(from: Date, days: number) {
  const d = new Date(from);
  let remaining = days;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    if (isWorkingDay(d)) {
      remaining -= 1;
    }
  }
  return d;
}

function getEarliestDeliveryDate() {
  const now = new Date();
  const start = new Date(now);

  // Business hours: 09:00–17:00, Monday–Friday.
  // If order placed outside business hours, treat as received on the next working day.
  const hour = now.getHours();

  if (!isWorkingDay(now) || hour < 9 || hour >= 17) {
    // Move start to next working day at 09:00
    do {
      start.setDate(start.getDate() + 1);
    } while (!isWorkingDay(start));
    start.setHours(9, 0, 0, 0);
  }

  // Earliest delivery = 3 working days after the (possibly adjusted) start day
  const earliest = addWorkingDays(start, 3);
  return earliest;
}

/* =========================
   Page
   ========================= */

export default function OrderPage() {
  // auth identity (used for gating)
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Tank option state
  const [tankOption, setTankOption] = useState<TankOption>("buy");

  // Pricing
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

  // Earliest delivery date based on business rules
  // - Orders are processed Monday–Friday, 09:00–17:00
  // - Orders placed outside those hours are treated as received on the next working day
  // - Earliest delivery is 3 working days after the processing day
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
        .eq("version", "v1.2")
        .limit(1)
        .maybeSingle();

      setTermsAccepted(!!t?.id);

      // CONTRACTS
      const { data: contracts, error: contractsError } = await supabase
        .from("contracts")
        .select("*")
        .eq("user_email", emailLower)
        .order("created_at", { ascending: false });

      if (contractsError) {
        console.error("Failed to load contracts:", contractsError);
      } else if (contracts && contracts.length > 0) {
        const buy = contracts.find(
          (c) => c.type === "buy" && (c.status === "signed" || c.status === "approved")
        );
        const rent = contracts.find(
          (c) => c.type === "rent" && c.status === "approved"
        );
        setBuyContract(buy || null);
        setRentContract(rent || null);

        // If they only have a rent contract approved, default the tank selection to rent
        if (!buy && rent) {
          setTankOption("rent");
        }
      }

      // PRICES (from a daily prices view)
      setLoadingPrices(true);
      const { data: dailyPrices, error: priceErr } = await supabase
        .from("v_latest_daily_prices")
        .select("*");

      if (priceErr) {
        console.error("Failed to load prices:", priceErr);
      } else if (dailyPrices && dailyPrices.length > 0) {
        let petrol: DailyPriceView | undefined;
        let diesel: DailyPriceView | undefined;

        for (const row of dailyPrices as DailyPriceView[]) {
          if (row.fuel === "petrol") petrol = row;
          if (row.fuel === "diesel") diesel = row;
        }

        setPetrolPrice(petrol?.unit_price_pence ?? null);
        setDieselPrice(diesel?.unit_price_pence ?? null);

        const dates = [toDateMaybe(petrol), toDateMaybe(diesel)].filter(
          Boolean
        ) as Date[];
        if (dates.length > 0) {
          dates.sort((a, b) => b.getTime() - a.getTime());
          setPricesUpdatedAt(dates[0]);
        }
      }
      setLoadingPrices(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // derived
  const unitPrice = useMemo(() => {
    if (fuel === "diesel") return dieselPrice ?? 0;
    if (fuel === "petrol") return petrolPrice ?? 0;
    return 0;
  }, [fuel, petrolPrice, dieselPrice]);

  const totalPence = useMemo(() => {
    if (!Number.isFinite(litres) || litres <= 0 || unitPrice <= 0) return 0;
    return Math.round(litres * unitPrice);
  }, [litres, unitPrice]);

  const totalGbp = useMemo(
    () => (totalPence > 0 ? totalPence / 100 : 0),
    [totalPence]
  );

  const requirementsMet = useMemo(() => {
    // Either buy contract (signed/approved) OR rent contract (approved)
    const hasBuy =
      buyContract &&
      (buyContract.status === "signed" || buyContract.status === "approved");
    const hasRent = rentContract && rentContract.status === "approved";

    return termsAccepted && (hasBuy || hasRent);
  }, [termsAccepted, buyContract, rentContract]);

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
        `Earliest delivery is ${new Date(
          minDeliveryDateStr
        ).toLocaleDateString()} (based on 3 working days from the processing day).`
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

  /* ---------- Stripe checkout (calls our API) ---------- */
  async function startCheckout() {
    try {
      setStartingCheckout(true);

      if (!userEmail) {
        alert("You must be logged in to place an order.");
        return;
      }

      if (!requirementsMet) {
        alert(
          "You need to accept the latest Terms and have an approved contract before placing an order."
        );
        return;
      }

      if (!deliveryDate) {
        alert("Please choose a delivery date.");
        return;
      }

      const chosen = new Date(deliveryDate);
      const min = new Date(minDeliveryDateStr);
      if (isNaN(chosen.getTime()) || chosen < min) {
        alert(
          `Earliest delivery is ${min.toLocaleDateString()}. Please pick a date on or after this, based on 3 working days from the processing day.`
        );
        return;
      }

      // Extra sanity check for all order details
      if (
        !fullName ||
        !address1 ||
        !postcode ||
        !city ||
        !Number.isFinite(litres) ||
        litres <= 0
      ) {
        alert("Please complete all required fields before paying.");
        return;
      }

      const body = {
        fuel,
        litres,
        deliveryDate,
        fullName,
        address1,
        address2,
        postcode,
        city,
        receiptEmail,
        tankOption,
      };

      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        console.error("Checkout session error:", err);
        alert(
          err?.error ||
            "Sorry, something went wrong starting checkout. Please try again."
        );
        return;
      }

      const data = await res.json();
      if (!data?.url) {
        alert("Unexpected response from checkout API.");
        return;
      }

      window.location.href = data.url;
    } catch (err) {
      console.error("startCheckout error:", err);
      alert("Unexpected error starting checkout.");
    } finally {
      setStartingCheckout(false);
    }
  }

  /* =========================
     UI helpers
     ========================= */
  const card = "rounded-xl bg-gray-800 p-5 md:p-6";
  const button =
    "rounded-lg px-4 py-2 font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed";
  const buttonPrimary =
    "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400 active:bg-yellow-300";
  const buttonGhost = "bg-white/10 hover:bg-white/15 text-white";
  const input =
    "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:ring focus:ring-yellow-500/30";
  const label = "block text-sm font-medium text-white/80 mb-1";
  const row = "grid grid-cols-1 md:grid-cols-2 gap-4";

  /* =========================
     Render
     ========================= */

  const priceTimestamp = pricesUpdatedAt
    ? pricesUpdatedAt.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="min-h-screen bg-[#020617] text-white">
      {/* Top nav / logo */}
      <header className="sticky top-0 z-20 bg-[#020617]/95 backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex h-14 items-center gap-3">
            {/* Left: logo */}
            <Link
              href="/client-dashboard"
              className="flex items-center gap-2 text-sm font-semibold text-white hover:text-yellow-400"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-yellow-500 text-[#041F3E] text-lg font-black">
                F
              </span>
              <span>FuelFlow</span>
            </Link>

            {/* Right: simple links */}
            <div className="ml-auto flex items-center gap-3 text-xs">
              <Link
                href="/client-dashboard"
                className="text-white/70 hover:text-white"
              >
                Dashboard
              </Link>
              <Link
                href="/documents"
                className="text-white/70 hover:text-white"
              >
                Documents
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 py-6 md:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Left column: order form */}
          <section className="lg:col-span-2 space-y-4">
            {/* Intro card */}
            <div className={card}>
              <h1 className="text-xl md:text-2xl font-semibold mb-2">
                Place a fuel order
              </h1>
              <p className="text-sm text-white/70">
                Choose your fuel, volume and delivery details. You’ll be taken
                to a secure Stripe checkout to pay, and your invoice will be
                saved in your dashboard.
              </p>
            </div>

            {/* Requirements card */}
            <div className={card}>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-yellow-500/90 text-xs font-bold text-[#041F3E]">
                  1
                </span>
                Check requirements
              </h2>
              <p className="text-sm text-white/70 mb-3">
                You’ll need to have accepted the latest Terms and have either a
                Buy or Rent tank contract in place before ordering.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="font-semibold mb-1">Terms & Conditions</div>
                  <div className="text-white/70 mb-2">
                    {termsAccepted ? (
                      <span className="text-green-300">
                        Accepted (v1.2) – you’re good to go.
                      </span>
                    ) : (
                      <>
                        Not accepted yet. You must accept the latest Terms in
                        the{" "}
                        <Link
                          href="/documents"
                          className="text-yellow-300 underline"
                        >
                          Documents
                        </Link>{" "}
                        section before ordering.
                      </>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="font-semibold mb-1">Tank contract</div>
                  <div className="text-white/70 mb-2">
                    {buyContract || rentContract ? (
                      <>
                        <div>
                          Buy contract:{" "}
                          {buyContract
                            ? buyContract.status === "approved"
                              ? "Approved"
                              : buyContract.status === "signed"
                              ? "Signed – auto-approved"
                              : buyContract.status
                            : "Not in place"}
                        </div>
                        <div>
                          Rent contract:{" "}
                          {rentContract
                            ? rentContract.status === "approved"
                              ? "Approved"
                              : rentContract.status
                            : "Not in place"}
                        </div>
                      </>
                    ) : (
                      <>
                        No active contract found. You’ll need either a Buy or
                        Rent tank contract. Please visit{" "}
                        <Link
                          href="/documents"
                          className="text-yellow-300 underline"
                        >
                          Documents
                        </Link>{" "}
                        to complete one.
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Tank option selector */}
              <div className="mt-4">
                <div className="text-sm font-medium text-white/80 mb-1">
                  Tank option
                </div>
                <div className="inline-flex rounded-full bg-white/10 p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setTankOption("buy")}
                    className={`px-3 py-1.5 rounded-full ${
                      tankOption === "buy"
                        ? "bg-yellow-500 text-[#041F3E] font-semibold"
                        : "text-white/70 hover:text-white"
                    }`}
                  >
                    Buy tank
                  </button>
                  <button
                    type="button"
                    onClick={() => setTankOption("rent")}
                    className={`px-3 py-1.5 rounded-full ${
                      tankOption === "rent"
                        ? "bg-yellow-500 text-[#041F3E] font-semibold"
                        : "text-white/70 hover:text-white"
                    }`}
                  >
                    Rent tank
                  </button>
                </div>
                <p className="mt-1 text-xs text-white/60">
                  Buy = own the tank outright. Rent = pay a regular fee but no
                  upfront tank cost. Your contract status is checked
                  automatically.
                </p>
              </div>

              {/* Requirements hint */}
              {!requirementsMet && (
                <div className="rounded-xl border border-yellow-400/30 bg-yellow-500/10 p-4 text-sm text-yellow-200 mt-4">
                  <div className="font-semibold mb-1">
                    Complete your documents to order
                  </div>
                  <div>
                    You must accept the latest Terms and have an approved Buy or
                    Rent tank contract linked to your account.
                  </div>
                  <div className="mt-2">
                    <Link
                      href="/documents"
                      className="inline-flex items-center gap-1 rounded-lg bg-yellow-500 px-3 py-1.5 text-xs font-semibold text-[#041F3E] hover:bg-yellow-400"
                    >
                      Go to Documents
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Order details card */}
            <div className={card}>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-yellow-500/90 text-xs font-bold text-[#041F3E]">
                  2
                </span>
                Order details
              </h2>

              {/* Pricing info */}
              <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <div className="text-xs font-semibold text-white/60 mb-1 uppercase tracking-wide">
                      Live pricing
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm">
                      <div>
                        <div className="text-white/60 text-xs">Diesel</div>
                        <div className="font-mono">
                          {dieselPrice
                            ? `${GBP(dieselPrice / 100)} per litre`
                            : loadingPrices
                            ? "Loading…"
                            : "Unavailable"}
                        </div>
                      </div>
                      <div>
                        <div className="text-white/60 text-xs">Petrol</div>
                        <div className="font-mono">
                          {petrolPrice
                            ? `${GBP(petrolPrice / 100)} per litre`
                            : loadingPrices
                            ? "Loading…"
                            : "Unavailable"}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="ml-auto text-xs text-white/60">
                    {priceTimestamp
                      ? `Last updated ${priceTimestamp}`
                      : "Prices timestamp unavailable."}
                  </div>
                </div>
              </div>

              {/* Actual form fields */}
              <div className={row}>
                {/* Fuel selection */}
                <div>
                  <label className={label}>Fuel type</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setFuel("diesel")}
                      className={`flex-1 rounded-lg px-3 py-2 text-sm ${
                        fuel === "diesel"
                          ? "bg-yellow-500 text-[#041F3E] font-semibold"
                          : "bg-white/5 text-white/80 hover:bg-white/10"
                      }`}
                    >
                      Diesel
                    </button>
                    <button
                      type="button"
                      onClick={() => setFuel("petrol")}
                      className={`flex-1 rounded-lg px-3 py-2 text-sm ${
                        fuel === "petrol"
                          ? "bg-yellow-500 text-[#041F3E] font-semibold"
                          : "bg-white/5 text-white/80 hover:bg-white/10"
                      }`}
                    >
                      Petrol
                    </button>
                  </div>
                </div>

                {/* Litres */}
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

                {/* Delivery date */}
                <div>
                  <label className={label}>
                    Delivery date{" "}
                    <span className="text-white/50">
                      (earliest{" "}
                      {new Date(minDeliveryDateStr).toLocaleDateString()}{" "}
                      based on our 3-working-day rule)
                    </span>
                  </label>
                  <input
                    className={input}
                    type="date"
                    value={deliveryDate}
                    min={minDeliveryDateStr}
                  />
                  <details className="mt-1 text-[11px] text-white/60">
                    <summary className="cursor-pointer underline underline-offset-2">
                      How we calculate earliest delivery
                    </summary>
                    <p className="mt-1">
                      Orders are processed on working days (Monday to Friday,
                      9am–5pm). If you place an order outside those hours – for
                      example at 11pm or over the weekend – we treat it as
                      received on the next working day. The earliest delivery
                      date is then three working days after that processing day.
                    </p>
                  </details>
                </div>
              </div>

              {/* Delivery address */}
              <div className="mt-4">
                <h3 className="text-sm font-semibold mb-2">
                  Delivery address
                </h3>
                <div className={row}>
                  <div>
                    <label className={label}>Full name / contact</label>
                    <input
                      className={input}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Name on delivery"
                    />
                  </div>
                  <div>
                    <label className={label}>Address line 1</label>
                    <input
                      className={input}
                      value={address1}
                      onChange={(e) => setAddress1(e.target.value)}
                      placeholder="Site address line 1"
                    />
                  </div>
                  <div>
                    <label className={label}>Address line 2 (optional)</label>
                    <input
                      className={input}
                      value={address2}
                      onChange={(e) => setAddress2(e.target.value)}
                      placeholder="Site address line 2"
                    />
                  </div>
                  <div>
                    <label className={label}>City / town</label>
                    <input
                      className={input}
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
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
                </div>
              </div>

              {/* Receipt email */}
              <div className="mt-4">
                <label className={label}>Receipt email</label>
                <input
                  className={input}
                  type="email"
                  value={receiptEmail}
                  onChange={(e) => setReceiptEmail(e.target.value)}
                  placeholder="Where should we send the receipt?"
                />
                <p className="mt-1 text-xs text-white/60">
                  This is where your Stripe receipt and PDF invoice will be
                  emailed.
                </p>
              </div>

              {/* Date error message */}
              {dateError && (
                <div className="mt-3 text-sm text-rose-300">{dateError}</div>
              )}
            </div>
          </section>

          {/* Right column: summary & help */}
          <section className="space-y-4">
            {/* Order summary */}
            <div className={card}>
              <h2 className="text-lg font-semibold mb-3">Order summary</h2>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/70">Fuel</span>
                  <span className="font-mono uppercase">
                    {fuel === "diesel" ? "Diesel" : "Petrol"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/70">Litres</span>
                  <span className="font-mono">{litres || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/70">Price per litre</span>
                  <span className="font-mono">
                    {unitPrice > 0 ? GBP(unitPrice / 100) : "—"}
                  </span>
                </div>
                <div className="border-t border-white/10 my-2"></div>
                <div className="flex justify-between text-base font-semibold">
                  <span>Total</span>
                  <span className="font-mono text-yellow-300">
                    {GBP(totalGbp)}
                  </span>
                </div>
              </div>

              <p className="mt-3 text-xs text-white/60">
                The actual amount you pay is handled securely by Stripe. We
                split the payment between the refinery and FuelFlow’s commission
                using Stripe Connect.
              </p>
            </div>

            {/* Action card */}
            <div className={card}>
              <h2 className="text-lg font-semibold mb-3">Pay & confirm</h2>
              <p className="text-sm text-white/70 mb-3">
                When you press{" "}
                <span className="font-semibold text-white">Go to payment</span>,
                we’ll create the order and redirect you to Stripe Checkout. Once
                payment is confirmed, your invoice will appear under Documents →
                Invoices.
              </p>

              <button
                type="button"
                onClick={startCheckout}
                disabled={payDisabled || startingCheckout}
                className={`${button} ${buttonPrimary} w-full justify-center flex items-center gap-2`}
              >
                {startingCheckout ? "Starting checkout…" : "Go to payment"}
              </button>

              {!requirementsMet && (
                <p className="mt-2 text-xs text-rose-300">
                  You’ll need to accept the Terms and have a valid contract
                  before you can pay.
                </p>
              )}
            </div>

            {/* Help card */}
            <div className={card}>
              <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-xs font-bold">
                  ?
                </span>
                Need help?
              </h2>
              <p className="text-sm text-white/70 mb-2">
                If you’re unsure about anything, you can ask questions in your{" "}
                <Link
                  href="/client-dashboard"
                  className="text-yellow-300 underline"
                >
                  client dashboard
                </Link>{" "}
                using the{" "}
                <span className="font-semibold">“Need help?”</span> assistant.
              </p>
              <p className="text-xs text-white/50">
                A human can review the conversation and step in where needed.
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

/* =========================
   Inline icons
   ========================= */

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
function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 13h8V3H3zM13 13h8V9h-8zM3 21h8v-6H3zM13 21h8v-6h-8z" />
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

