// src/pages/order.tsx
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type PriceRow = { fuel: "petrol" | "diesel"; total_price: number };

/** Supabase client (browser) */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

function money(n: number | null | undefined) {
  if (!Number.isFinite(n as number)) return "—";
  return `£${(n as number).toFixed(2)}`;
}

export default function OrderPage() {
  const [user, setUser] = useState<any>(null);

  /** Prices */
  const [petrolPrice, setPetrolPrice] = useState<number | null>(null); // £/L
  const [dieselPrice, setDieselPrice] = useState<number | null>(null); // £/L

  /** Form */
  const [fuel, setFuel] = useState<"petrol" | "diesel">("diesel");
  const [litres, setLitres] = useState<string>("1000");
  const [deliveryDate, setDeliveryDate] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [fullName, setFullName] = useState<string>("");

  const [addr1, setAddr1] = useState<string>("");
  const [addr2, setAddr2] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [postcode, setPostcode] = useState<string>("");

  const [accepted, setAccepted] = useState<boolean>(true);

  /** UI */
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /** Derived totals */
  const unitPrice = useMemo(() => {
    const p = fuel === "petrol" ? petrolPrice : dieselPrice;
    return p ?? null;
  }, [fuel, petrolPrice, dieselPrice]);

  const total = useMemo(() => {
    const L = Number(litres);
    if (!unitPrice || !Number.isFinite(L)) return null;
    return unitPrice * L;
  }, [unitPrice, litres]);

  /** Load user + latest prices */
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) {
        window.location.href = "/login";
        return;
      }
      setUser(u.user);
      setEmail(u.user.email || "");

      // Try latest_prices first (your project shows this view).
      let { data: lp, error: e1 } = await supabase
        .from("latest_prices")
        .select("fuel,total_price");
      if (e1 || !lp?.length) {
        // Fallback to latest_daily_prices
        const { data: dp, error: e2 } = await supabase
          .from("latest_daily_prices")
          .select("fuel,total_price");
        if (!e2 && dp?.length) lp = dp as any;
      }

      if (lp && lp.length) {
        for (const r of lp as PriceRow[]) {
          if (r.fuel === "petrol") setPetrolPrice(Number(r.total_price));
          if (r.fuel === "diesel") setDieselPrice(Number(r.total_price));
        }
      }
    })();
  }, []);

  /** Insert that adapts to your current schema */
  async function insertOrderWithFallbacks(base: {
    user_email: string;
    fuel: "petrol" | "diesel";
    litres: number;
    delivery_date: string | null; // ISO (YYYY-MM-DD)
    name: string;
    address_line1: string;
    address_line2?: string | null;
    city?: string | null;
    postcode: string;
    unit_price_GBP: number; // £/L
    total_GBP: number; // £
  }) {
    // Attempt A: split-address + pence columns (modern)
    const tryA = {
      user_email: base.user_email,
      fuel: base.fuel,
      litres: base.litres,
      delivery_date: base.delivery_date,
      name: base.name,
      address_line1: base.address_line1,
      address_line2: base.address_line2 ?? null,
      city: base.city ?? null,
      postcode: base.postcode,
      unit_price_pence: Math.round(base.unit_price_GBP * 100),
      total_pence: Math.round(base.total_GBP * 100),
      status: "ordered",
    };

    // Attempt B: split-address + (unit_price numeric) + (total_amount_pence)
    const tryB = {
      ...tryA,
      unit_price: base.unit_price_GBP,
      total_amount_pence: Math.round(base.total_GBP * 100),
    } as any;
    delete (tryB as any).unit_price_pence;
    delete (tryB as any).total_pence;

    // Attempt C: single address field + pence columns
    const singleAddress =
      [base.address_line1, base.address_line2, base.city]
        .filter(Boolean)
        .join(", ") || base.postcode;

    const tryC = {
      user_email: base.user_email,
      fuel: base.fuel,
      litres: base.litres,
      delivery_date: base.delivery_date,
      name: base.name,
      address: singleAddress,
      postcode: base.postcode,
      unit_price_pence: Math.round(base.unit_price_GBP * 100),
      total_pence: Math.round(base.total_GBP * 100),
      status: "ordered",
    };

    // Attempt D: single address + (unit_price numeric) + (total_amount_pence)
    const tryD = {
      ...tryC,
      unit_price: base.unit_price_GBP,
      total_amount_pence: Math.round(base.total_GBP * 100),
    } as any;
    delete (tryD as any).unit_price_pence;
    delete (tryD as any).total_pence;

    // Try in order, stopping at the first that succeeds.
    const attempts = [tryA, tryB, tryC, tryD];

    let lastError: string | null = null;
    for (const payload of attempts) {
      const { data, error } = await supabase
        .from("orders")
        .insert(payload)
        .select("id")
        .single();

      if (!error && data?.id) {
        return data.id as string;
      }
      lastError = error?.message || "insert_failed";
      // If the error is clearly a column-missing error, we continue to the next attempt.
      // Otherwise we also continue — the next mapping might match the live schema.
    }
    throw new Error(lastError || "DB insert failed");
  }

  async function handlePay() {
    try {
      setErr(null);

      if (!accepted) {
        setErr("Please agree to the Terms & Conditions.");
        return;
      }

      const L = Number(litres);
      if (!Number.isFinite(L) || L <= 0) {
        setErr("Please enter a valid number of litres.");
        return;
      }
      if (!unitPrice) {
        setErr("No price available for the selected fuel.");
        return;
      }
      if (!deliveryDate) {
        setErr("Please select a delivery date.");
        return;
      }
      if (!email) {
        setErr("Email is required.");
        return;
      }
      if (!fullName) {
        setErr("Full name is required.");
        return;
      }
      if (!addr1 || !city || !postcode) {
        setErr("Please complete your address.");
        return;
      }

      setBusy(true);

      /** 1) Create order row (with schema fallbacks) */
      const orderId = await insertOrderWithFallbacks({
        user_email: (user?.email || "").toLowerCase(),
        fuel,
        litres: L,
        delivery_date: deliveryDate || null, // YYYY-MM-DD
        name: fullName,
        address_line1: addr1,
        address_line2: addr2 || null,
        city,
        postcode,
        unit_price_GBP: unitPrice,
        total_GBP: unitPrice * L,
      });

      /** 2) Create Stripe Checkout session */
      const payload = {
        order_id: orderId,
        fuel,
        litres: L,
        unit_price: unitPrice,
        total: unitPrice * L,
        delivery_date: deliveryDate,
        email,
        full_name: fullName,
        address_line1: addr1,
        address_line2: addr2 || "",
        city,
        postcode,
      };

      const resp = await fetch("/api/stripe/checkout/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok || !data?.url) {
        throw new Error(data?.error || `HTTP ${resp.status}`);
      }

      window.location.href = data.url; // redirect to Stripe
    } catch (e: any) {
      setBusy(false);
      setErr(e?.message || "Something went wrong.");
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between">
          <h1 className="text-3xl font-bold text-yellow-400">Place an Order</h1>
          <a className="underline text-gray-300" href="/client-dashboard">
            Back to Dashboard
          </a>
        </div>

        {/* Price cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="bg-gray-800 p-5 rounded-lg">
            <div className="text-sm text-gray-300">Petrol (95)</div>
            <div className="text-3xl font-bold mt-2">{money(petrolPrice)}{" "}<span className="text-sm font-normal">/ litre</span></div>
          </div>
          <div className="bg-gray-800 p-5 rounded-lg">
            <div className="text-sm text-gray-300">Diesel</div>
            <div className="text-3xl font-bold mt-2">{money(dieselPrice)}{" "}<span className="text-sm font-normal">/ litre</span></div>
          </div>
          <div className="bg-gray-800 p-5 rounded-lg">
            <div className="text-sm text-gray-300">Estimated Total</div>
            <div className="text-3xl font-bold mt-2">{money(total)}</div>
          </div>
        </div>

        {/* Error */}
        {err && (
          <div className="mt-6 bg-red-700/80 border border-red-500 text-red-100 p-4 rounded">
            <p className="font-semibold">Please fix the following:</p>
            <p className="mt-1">{err}</p>
          </div>
        )}

        {/* Form */}
        <div className="bg-gray-800 rounded-lg p-6 mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Fuel */}
            <div>
              <label className="block text-gray-300 mb-1">Fuel</label>
              <select
                value={fuel}
                onChange={(e) => setFuel(e.target.value as any)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
              >
                <option value="petrol">Petrol (95)</option>
                <option value="diesel">Diesel</option>
              </select>
            </div>

            {/* Litres */}
            <div>
              <label className="block text-gray-300 mb-1">Litres</label>
              <input
                type="number"
                min={1}
                value={litres}
                onChange={(e) => setLitres(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
              />
            </div>

            {/* Delivery date */}
            <div>
              <label className="block text-gray-300 mb-1">Delivery date</label>
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-gray-300 mb-1">Your email (receipt)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
              />
            </div>

            {/* Full name */}
            <div>
              <label className="block text-gray-300 mb-1">Full name</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
              />
            </div>

            {/* Address line 1 */}
            <div>
              <label className="block text-gray-300 mb-1">Address line 1</label>
              <input
                value={addr1}
                onChange={(e) => setAddr1(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
              />
            </div>

            {/* Address line 2 */}
            <div>
              <label className="block text-gray-300 mb-1">Address line 2</label>
              <input
                value={addr2}
                onChange={(e) => setAddr2(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
              />
            </div>

            {/* City */}
            <div>
              <label className="block text-gray-300 mb-1">City</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
              />
            </div>

            {/* Postcode */}
            <div>
              <label className="block text-gray-300 mb-1">Postcode</label>
              <input
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
              />
            </div>
          </div>

          {/* Terms */}
          <div className="mt-4 flex items-center gap-2">
            <input
              id="terms"
              type="checkbox"
              className="h-4 w-4"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            <label htmlFor="terms" className="text-gray-300">
              I agree to the{" "}
              <a href="/terms" target="_blank" className="underline">
                Terms &amp; Conditions
              </a>
              .
            </label>
          </div>

          {/* Summary + CTA */}
          <div className="mt-6 flex items-center justify-between">
            <div className="text-gray-300">
              Unit price: <strong>{unitPrice ? `£${unitPrice.toFixed(3)}/L` : "—"}</strong>{" "}
              • Total: <strong>{money(total)}</strong>
            </div>
            <button
              onClick={handlePay}
              disabled={busy}
              className="bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-semibold px-6 py-3 rounded"
            >
              {busy ? "Creating checkout…" : "Pay with Stripe"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

