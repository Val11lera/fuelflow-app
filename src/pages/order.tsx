import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type PriceRow = { fuel: "petrol" | "diesel"; price: number };

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function money(pounds: number | null) {
  if (pounds == null) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pounds);
}

export default function OrderPage() {
  const [prices, setPrices] = useState<PriceRow[] | null>(null);
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fuel, setFuel] = useState<"petrol" | "diesel">("petrol");
  const [litres, setLitres] = useState<number>(100); // default 100L
  const [deliveryDate, setDeliveryDate] = useState<string>("");
  const [name, setName] = useState("");
  const [addr1, setAddr1] = useState("");
  const [addr2, setAddr2] = useState("");
  const [city, setCity] = useState("");
  const [postcode, setPostcode] = useState("");
  const [email, setEmail] = useState("");

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoadingPrices(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from("latest_daily_prices")
          .select("fuel,total_price");
        if (error) throw error;

        const mapped: PriceRow[] =
          (data || []).map((r: any) => ({
            fuel: r.fuel,
            price: Number(r.total_price),
          })) ?? [];
        setPrices(mapped);
      } catch (e: any) {
        setError(e?.message || "Failed to load prices");
      } finally {
        setLoadingPrices(false);
      }
    };
    load();
  }, []);

  const unitPrice = useMemo(() => {
    const row = prices?.find(p => p.fuel === fuel);
    return row ? row.price : null;
  }, [prices, fuel]);

  const total = useMemo(() => {
    if (!unitPrice || !Number.isFinite(litres)) return null;
    return unitPrice * litres;
  }, [unitPrice, litres]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const resp = await fetch("/api/stripe/checkout/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fuel,
          litres,
          customer_name: name,
          address_line1: addr1,
          address_line2: addr2,
          city,
          postcode,
          delivery_date: deliveryDate || null,
          user_email: email || null,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || "Failed to start checkout");
      window.location.href = json.url; // redirect to Stripe
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-3xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-yellow-400">Place an Order</h1>
          <a href="/client-dashboard" className="text-sm text-gray-300 hover:underline">
            Back to Dashboard
          </a>
        </header>

        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-800 rounded-xl p-4 shadow">
            <h3 className="text-gray-300">Petrol (95)</h3>
            <p className="text-2xl font-bold">
              {loadingPrices ? "…" : money(prices?.find(p => p.fuel === "petrol")?.price ?? null)}
              <span className="text-sm text-gray-400"> / litre</span>
            </p>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 shadow">
            <h3 className="text-gray-300">Diesel</h3>
            <p className="text-2xl font-bold">
              {loadingPrices ? "…" : money(prices?.find(p => p.fuel === "diesel")?.price ?? null)}
              <span className="text-sm text-gray-400"> / litre</span>
            </p>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 shadow">
            <h3 className="text-gray-300">Estimated Total</h3>
            <p className="text-2xl font-bold">
              {total == null ? "—" : money(total)}
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/40 border border-red-700 rounded p-3 mb-4 text-red-200">
            {error}
          </div>
        )}

        <form
          onSubmit={onSubmit}
          className="bg-gray-800 rounded-xl p-6 shadow space-y-4"
        >
          <div className="grid md:grid-cols-3 gap-4">
            <label className="flex flex-col">
              <span className="text-gray-300 mb-1">Fuel</span>
              <select
                value={fuel}
                onChange={(e) => setFuel(e.target.value as "petrol" | "diesel")}
                className="bg-gray-900 rounded p-2 outline-none"
              >
                <option value="petrol">Petrol (95)</option>
                <option value="diesel">Diesel</option>
              </select>
            </label>

            <label className="flex flex-col">
              <span className="text-gray-300 mb-1">Litres</span>
              <input
                type="number"
                step="0.01"
                min={1}
                value={litres}
                onChange={(e) => setLitres(Number(e.target.value))}
                className="bg-gray-900 rounded p-2 outline-none"
                required
              />
            </label>

            <label className="flex flex-col">
              <span className="text-gray-300 mb-1">Delivery date</span>
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="bg-gray-900 rounded p-2 outline-none"
              />
            </label>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <label className="flex flex-col">
              <span className="text-gray-300 mb-1">Your email (receipt)</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="bg-gray-900 rounded p-2 outline-none"
              />
            </label>

            <label className="flex flex-col">
              <span className="text-gray-300 mb-1">Full name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-gray-900 rounded p-2 outline-none"
                required
              />
            </label>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <label className="flex flex-col">
              <span className="text-gray-300 mb-1">Address line 1</span>
              <input
                value={addr1}
                onChange={(e) => setAddr1(e.target.value)}
                className="bg-gray-900 rounded p-2 outline-none"
                required
              />
            </label>
            <label className="flex flex-col">
              <span className="text-gray-300 mb-1">Address line 2</span>
              <input
                value={addr2}
                onChange={(e) => setAddr2(e.target.value)}
                className="bg-gray-900 rounded p-2 outline-none"
              />
            </label>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <label className="flex flex-col">
              <span className="text-gray-300 mb-1">City</span>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="bg-gray-900 rounded p-2 outline-none"
                required
              />
            </label>
            <label className="flex flex-col">
              <span className="text-gray-300 mb-1">Postcode</span>
              <input
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                className="bg-gray-900 rounded p-2 outline-none"
                required
              />
            </label>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-gray-400">
              Unit price:{" "}
              <span className="text-gray-200 font-medium">
                {unitPrice == null ? "—" : `£${unitPrice.toFixed(3)}/L`}
              </span>
              {" • "}
              Total:{" "}
              <span className="text-yellow-400 font-semibold">
                {total == null ? "—" : money(total)}
              </span>
            </div>

            <button
              type="submit"
              disabled={submitting || unitPrice == null}
              className="bg-yellow-500 text-black px-6 py-2 rounded hover:bg-yellow-400 disabled:opacity-50"
            >
              {submitting ? "Starting Checkout…" : "Pay with Stripe"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
