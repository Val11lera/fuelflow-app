// src/pages/order.tsx
import { useEffect, useMemo, useState } from "react";
import type { NextPage } from "next";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

// --- Supabase browser client (anon key is safe on the client)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

type Fuel = "petrol" | "diesel";

type PriceRow = { fuel: Fuel; total_price: number }; // from public.latest_daily_prices

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
    n
  );

const OrderPage: NextPage = () => {
  // ---- auth ----
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // ---- prices ----
  const [petrolPrice, setPetrolPrice] = useState<number | null>(null); // £/L
  const [dieselPrice, setDieselPrice] = useState<number | null>(null); // £/L

  // ---- form ----
  const [fuel, setFuel] = useState<Fuel>("diesel");
  const [litres, setLitres] = useState<string>("1000");
  const [deliveryDate, setDeliveryDate] = useState<string>(""); // yyyy-mm-dd
  const [fullName, setFullName] = useState<string>("");
  const [emailReceipt, setEmailReceipt] = useState<string>(""); // for Stripe receipt only
  const [addressLine1, setAddressLine1] = useState<string>("");
  const [addressLine2, setAddressLine2] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [postcode, setPostcode] = useState<string>("");
  const [agreed, setAgreed] = useState<boolean>(false);

  // ---- ui ----
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // computed
  const unitPrice = useMemo(
    () => (fuel === "petrol" ? petrolPrice : dieselPrice) ?? null,
    [fuel, petrolPrice, dieselPrice]
  );
  const unitPence = useMemo(
    () => (unitPrice != null ? Math.round(unitPrice * 100) : null),
    [unitPrice]
  );
  const litresNum = useMemo(() => Number(litres) || 0, [litres]);
  const totalPounds = useMemo(
    () => (unitPrice != null ? unitPrice * litresNum : 0),
    [unitPrice, litresNum]
  );
  const totalPence = useMemo(
    () => (unitPence != null ? unitPence * litresNum : 0),
    [unitPence, litresNum]
  );

  // ---- initial load ----
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      const mail = data?.user?.email ?? null;
      setUserEmail(mail);
      if (mail) setEmailReceipt(mail);

      // load latest prices from your view
      const { data: rows, error: priceErr } = await supabase
        .from("latest_daily_prices")
        .select("fuel,total_price");
      if (!priceErr && rows) {
        rows.forEach((r: PriceRow) => {
          if (r.fuel === "petrol") setPetrolPrice(r.total_price);
          if (r.fuel === "diesel") setDieselPrice(r.total_price);
        });
      }
    };
    init();
  }, []);

  const validate = () => {
    if (!userEmail) return "You must be signed in.";
    if (!unitPrice) return "Missing price for selected fuel.";
    if (!(litresNum > 0)) return "Please enter litres > 0.";
    if (!deliveryDate) return "Please select a delivery date.";
    if (!fullName.trim()) return "Please enter your full name.";
    if (!addressLine1.trim()) return "Please enter your address.";
    if (!city.trim()) return "Please enter your city.";
    if (!postcode.trim()) return "Please enter your postcode.";
    if (!agreed) return "Please agree to the Terms & Conditions.";
    return null;
  };

  const handlePay = async () => {
    try {
      setBusy(true);
      setError(null);

      const v = validate();
      if (v) {
        setError(v);
        setBusy(false);
        return;
      }

      // build the row *matching your current table*
      const addressCombined = [addressLine1, addressLine2, city]
        .filter(Boolean)
        .join(", ");

      const orderRow = {
        user_email: userEmail, // critical for RLS
        fuel,
        litres: litresNum,
        delivery_date: deliveryDate || null,
        name: fullName || null,
        address: addressCombined || null,
        postcode: postcode || null,

        // new pence columns you added
        unit_price_pence: unitPence!, // int
        total_pence: totalPence, // int

        // legacy not-null column your table still has
        total_amount_pence: totalPence, // <- fixes "DB insert failed"
      };

      const { data: inserted, error: insertErr } = await supabase
        .from("orders")
        .insert(orderRow)
        .select("id")
        .single();

      if (insertErr) {
        console.error("Order insert error:", insertErr);
        setError(insertErr.message || "DB insert failed");
        setBusy(false);
        return;
      }

      const orderId = inserted.id as string;

      // create the Stripe Checkout Session
      const resp = await fetch("/api/stripe/checkout/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: orderId,
          fuel,
          litres: litresNum,
          unit_price: unitPrice, // for display only
          total: totalPence, // pence (minor units)
          delivery_date: deliveryDate,

          // for Stripe receipt/customer
          email: emailReceipt || userEmail,
          full_name: fullName,
          address_line1: addressLine1,
          address_line2: addressLine2,
          city,
          postcode,
        }),
      });

      const data = await resp.json();
      if (!resp.ok || !data?.url) {
        console.error("Checkout create error:", data);
        setError(data?.error || `HTTP ${resp.status}`);
        setBusy(false);
        return;
      }

      window.location.href = data.url; // to Stripe
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Unexpected error");
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-yellow-400">Place an Order</h1>
          <Link
            href="/client-dashboard"
            className="text-sm text-gray-300 hover:text-white underline"
          >
            Back to Dashboard
          </Link>
        </header>

        {/* Price cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-800 rounded-xl p-5">
            <p className="text-gray-300">Petrol (95)</p>
            <p className="text-3xl font-bold mt-2">
              {petrolPrice != null ? fmtMoney(petrolPrice) : "—"}
              <span className="text-base text-gray-400"> / litre</span>
            </p>
          </div>
          <div className="bg-gray-800 rounded-xl p-5">
            <p className="text-gray-300">Diesel</p>
            <p className="text-3xl font-bold mt-2">
              {dieselPrice != null ? fmtMoney(dieselPrice) : "—"}
              <span className="text-base text-gray-400"> / litre</span>
            </p>
          </div>
          <div className="bg-gray-800 rounded-xl p-5">
            <p className="text-gray-300">Estimated Total</p>
            <p className="text-3xl font-bold mt-2">
              {fmtMoney(totalPounds || 0)}
            </p>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="bg-red-700/60 border border-red-500 rounded-lg p-3">
            <p className="font-medium">Please fix the following:</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Form */}
        <div className="bg-gray-800 rounded-xl p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm text-gray-300 mb-1">Fuel</label>
              <select
                value={fuel}
                onChange={(e) => setFuel(e.target.value as Fuel)}
                className="w-full bg-gray-900 rounded-md p-3"
              >
                <option value="petrol">Petrol (95)</option>
                <option value="diesel">Diesel</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1">Litres</label>
              <input
                type="number"
                min={1}
                step="1"
                value={litres}
                onChange={(e) => setLitres(e.target.value)}
                className="w-full bg-gray-900 rounded-md p-3"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1">
                Delivery date
              </label>
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full bg-gray-900 rounded-md p-3"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1">
                Your email (receipt)
              </label>
              <input
                type="email"
                value={emailReceipt}
                onChange={(e) => setEmailReceipt(e.target.value)}
                className="w-full bg-gray-900 rounded-md p-3"
                placeholder="you@company.com"
              />
              <p className="text-xs text-gray-400 mt-1">
                Used for receipt only. Your account email is used to create the
                order for security.
              </p>
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1">
                Full name
              </label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-gray-900 rounded-md p-3"
                placeholder="Name"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1">
                Address line 1
              </label>
              <input
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                className="w-full bg-gray-900 rounded-md p-3"
                placeholder="Building, street"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1">
                Address line 2
              </label>
              <input
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
                className="w-full bg-gray-900 rounded-md p-3"
                placeholder="Area (optional)"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1">City</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full bg-gray-900 rounded-md p-3"
                placeholder="City"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1">
                Postcode
              </label>
              <input
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                className="w-full bg-gray-900 rounded-md p-3"
                placeholder="Postcode"
              />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <input
              id="agree"
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="agree" className="text-sm text-gray-300">
              I agree to the{" "}
              <Link
                href="/terms"
                target="_blank"
                className="underline text-yellow-400"
              >
                Terms &amp; Conditions
              </Link>
              .
            </label>
          </div>

          <div className="mt-4 text-sm text-gray-300">
            Unit price:{" "}
            <strong>
              {unitPrice != null ? fmtMoney(unitPrice) : "—"}/L
            </strong>{" "}
            • Total: <strong>{fmtMoney(totalPounds || 0)}</strong>
          </div>

          <div className="mt-6">
            <button
              disabled={busy}
              onClick={handlePay}
              className="bg-yellow-500 hover:bg-yellow-400 text-black font-semibold px-6 py-3 rounded-lg disabled:opacity-60"
            >
              {busy ? "Processing…" : "Pay with Stripe"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
};

export default OrderPage;


