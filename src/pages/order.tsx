// src/pages/order.tsx
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { createClient } from "@supabase/supabase-js";

type Fuel = "petrol" | "diesel";
type PriceRow = { fuel: Fuel; total_price: number };

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 2,
});

function todayPlus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function OrderPage() {
  // ---- prices from Supabase ----
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [pricesErr, setPricesErr] = useState<string | null>(null);
  const [petrolPrice, setPetrolPrice] = useState<number | null>(null);
  const [dieselPrice, setDieselPrice] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoadingPrices(true);
      setPricesErr(null);
      try {
        const { data, error } = await supabase
          .from("latest_daily_prices")
          .select("fuel,total_price");
        if (error) throw error;

        const byFuel: Record<string, number> = {};
        (data as PriceRow[]).forEach((r) => (byFuel[r.fuel] = Number(r.total_price)));
        setPetrolPrice(byFuel.petrol ?? null);
        setDieselPrice(byFuel.diesel ?? null);
      } catch (e: any) {
        setPricesErr(e?.message || "Failed to load prices");
      } finally {
        setLoadingPrices(false);
      }
    };
    load();
  }, []);

  // ---- form state ----
  const [fuel, setFuel] = useState<Fuel>("diesel");
  const [litres, setLitres] = useState<string>("1000");
  const [deliveryDate, setDeliveryDate] = useState<string>(todayPlus(3));

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [city, setCity] = useState("");
  const [postcode, setPostcode] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const unitPrice = useMemo(() => {
    if (fuel === "petrol") return petrolPrice ?? 0;
    return dieselPrice ?? 0;
  }, [fuel, petrolPrice, dieselPrice]);

  const litresNum = useMemo(() => Number(litres), [litres]);
  const total = useMemo(() => {
    const L = Number(litres);
    const P = Number(unitPrice);
    if (!Number.isFinite(L) || !Number.isFinite(P)) return 0;
    return L * P;
  }, [litres, unitPrice]);

  const disabled =
    submitting ||
    loadingPrices ||
    !unitPrice ||
    !email ||
    !fullName ||
    !address1 ||
    !city ||
    !postcode ||
    !deliveryDate ||
    !Number.isFinite(litresNum) ||
    litresNum <= 0;

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null);

    try {
      if (disabled) {
        throw new Error("Please complete all required fields.");
      }

      const payload = {
        fuel,
        litres: litresNum,
        unit_price: unitPrice, // number (e.g. 4.66)
        delivery_date: deliveryDate,
        email,
        full_name: fullName,
        address_line1: address1,
        address_line2: address2,
        city,
        postcode,
      };

      setSubmitting(true);

      // IMPORTANT: This must call the JSON endpoint, not the /test redirect
      const resp = await fetch("/api/stripe/checkout/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);

      // Stripe hosted page
      window.location.href = data.url;
    } catch (err: any) {
      setFormErr(err?.message || "Failed to start checkout");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>Place an Order</title>
      </Head>

      <div className="min-h-screen bg-gray-900 text-white">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-yellow-400">Place an Order</h1>
            <a
              href="/client-dashboard"
              className="text-sm text-gray-300 hover:text-white underline"
            >
              Back to Dashboard
            </a>
          </div>

          {/* price cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-800 rounded-xl p-5 shadow">
              <p className="text-gray-300">Petrol (95)</p>
              <p className="text-3xl font-bold mt-2">
                {petrolPrice != null ? gbp.format(petrolPrice) : "—"}
                <span className="text-base font-normal text-gray-400"> / litre</span>
              </p>
            </div>

            <div className="bg-gray-800 rounded-xl p-5 shadow">
              <p className="text-gray-300">Diesel</p>
              <p className="text-3xl font-bold mt-2">
                {dieselPrice != null ? gbp.format(dieselPrice) : "—"}
                <span className="text-base font-normal text-gray-400"> / litre</span>
              </p>
            </div>

            <div className="bg-gray-800 rounded-xl p-5 shadow">
              <p className="text-gray-300">Estimated Total</p>
              <p className="text-3xl font-bold mt-2">
                {gbp.format(total || 0)}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Based on today’s price and your litres
              </p>
            </div>
          </div>

          {pricesErr && (
            <div className="bg-red-800/60 border border-red-700 text-red-200 p-3 rounded mb-4">
              Failed to load prices: {pricesErr}
            </div>
          )}

          {formErr && (
            <div className="bg-red-800/60 border border-red-700 text-red-200 p-3 rounded mb-4">
              {formErr}
            </div>
          )}

          <form
            onSubmit={handlePay}
            className="bg-gray-800 rounded-2xl p-6 shadow space-y-5"
          >
            {/* row: fuel / litres / date */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-300 mb-2">Fuel</label>
                <select
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  value={fuel}
                  onChange={(e) => setFuel(e.target.value as Fuel)}
                >
                  <option value="petrol">Petrol (95)</option>
                  <option value="diesel">Diesel</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-2">Litres</label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  value={litres}
                  onChange={(e) => setLitres(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-2">Delivery date</label>
                <input
                  type="date"
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                />
              </div>
            </div>

            {/* row: email / name */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-300 mb-2">
                  Your email (receipt)
                </label>
                <input
                  type="email"
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-2">Full name</label>
                <input
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Smith"
                />
              </div>
            </div>

            {/* address */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-300 mb-2">
                  Address line 1
                </label>
                <input
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  value={address1}
                  onChange={(e) => setAddress1(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-2">
                  Address line 2
                </label>
                <input
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  value={address2}
                  onChange={(e) => setAddress2(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-2">City</label>
                <input
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-2">Postcode</label>
                <input
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value)}
                />
              </div>
            </div>

            {/* subtotal */}
            <div className="text-sm text-gray-300">
              Unit price:{" "}
              <span className="font-semibold">
                {unitPrice ? `${gbp.format(unitPrice)}/L` : "—"}
              </span>{" "}
              • Total:{" "}
              <span className="font-semibold">{gbp.format(total || 0)}</span>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={disabled}
                className={`px-5 py-3 rounded-lg font-semibold transition ${
                  disabled
                    ? "bg-gray-600 text-gray-300 cursor-not-allowed"
                    : "bg-yellow-500 text-black hover:bg-yellow-400"
                }`}
              >
                {submitting ? "Starting checkout…" : "Pay with Stripe"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}


