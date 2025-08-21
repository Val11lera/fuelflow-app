// src/pages/order.tsx
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type PriceRow = { fuel: "petrol" | "diesel"; total_price: number; price_date: string };

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

function money(n: number) {
  return `£${n.toFixed(2)}`;
}

export default function OrderPage() {
  // prices
  const [petrol, setPetrol] = useState<number | null>(null);
  const [diesel, setDiesel] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // form
  const [fuel, setFuel] = useState<"petrol" | "diesel">("diesel");
  const [litres, setLitres] = useState<string>("1000");
  const [deliveryDate, setDeliveryDate] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [fullName, setFullName] = useState<string>("");
  const [address1, setAddress1] = useState<string>("");
  const [address2, setAddress2] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [postcode, setPostcode] = useState<string>("");
  const [agree, setAgree] = useState<boolean>(false);

  const [submitting, setSubmitting] = useState(false);

  // load latest prices and prefill user
  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);

      // require login
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        window.location.href = "/login";
        return;
      }
      setEmail(auth.user.email || "");

      // fetch latest prices (view or table you created)
      // Try 'latest_prices' first, fallback to 'latest_daily_prices' if needed
      let rows: PriceRow[] = [];
      const try1 = await supabase.from("latest_prices").select("fuel,total_price,price_date");
      if (!try1.error && try1.data?.length) rows = try1.data as any;

      if (!rows.length) {
        const try2 = await supabase
          .from("latest_daily_prices")
          .select("fuel,total_price,price_date");
        if (!try2.error && try2.data?.length) rows = try2.data as any;
      }

      if (!rows.length) {
        setErr("Could not load latest prices");
      } else {
        const p = rows.find((r) => r.fuel === "petrol");
        const d = rows.find((r) => r.fuel === "diesel");
        setPetrol(p ? Number(p.total_price) : null);
        setDiesel(d ? Number(d.total_price) : null);
      }
      setLoading(false);
    })();
  }, []);

  const unitPrice = fuel === "petrol" ? petrol ?? 0 : diesel ?? 0;
  const litresNum = Number(litres) || 0;
  const total = useMemo(() => (unitPrice > 0 ? unitPrice * litresNum : 0), [unitPrice, litresNum]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!agree) {
      setErr("Please read and agree to the Terms & Conditions to continue.");
      return;
    }

    // tiny client-side validation
    if (!email || !fullName || !address1 || !city || !postcode || !deliveryDate) {
      setErr("Missing or invalid order fields");
      return;
    }
    if (!(petrol || diesel)) {
      setErr("Prices not loaded yet");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        fuel,
        litres: Number(litres),
        unit_price: unitPrice,   // GBP per litre
        total: Number(total.toFixed(2)), // total GBP
        delivery_date: deliveryDate, // YYYY-MM-DD
        email,
        full_name: fullName,
        address_line1: address1,
        address_line2: address2,
        city,
        postcode,
      };

      const resp = await fetch("/api/stripe/checkout/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
      // Navigate to Stripe
      window.location.href = data.url;
    } catch (e: any) {
      setErr(e?.message || "Failed to start checkout");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-yellow-400">Place an Order</h1>
        <a href="/client-dashboard" className="text-sm underline">Back to Dashboard</a>
      </header>

      {/* Price tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-800 p-5 rounded-2xl">
          <p className="text-gray-300">Petrol (95)</p>
          <p className="text-3xl font-bold">{petrol ? money(petrol) : "—"} <span className="text-base font-normal text-gray-300">/ litre</span></p>
        </div>
        <div className="bg-gray-800 p-5 rounded-2xl">
          <p className="text-gray-300">Diesel</p>
          <p className="text-3xl font-bold">{diesel ? money(diesel) : "—"} <span className="text-base font-normal text-gray-300">/ litre</span></p>
        </div>
        <div className="bg-gray-800 p-5 rounded-2xl">
          <p className="text-gray-300">Estimated Total</p>
          <p className="text-3xl font-bold">{money(total)}</p>
        </div>
      </div>

      {err && (
        <div className="bg-red-800/60 border border-red-600 text-red-200 p-4 rounded-xl mb-6">
          {err}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-gray-800 p-6 rounded-2xl max-w-5xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm text-gray-300">Fuel</span>
            <select
              value={fuel}
              onChange={(e) => setFuel(e.target.value as any)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 mt-1"
            >
              <option value="petrol">Petrol (95)</option>
              <option value="diesel">Diesel</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm text-gray-300">Litres</span>
            <input
              type="number"
              min="1"
              step="0.01"
              value={litres}
              onChange={(e) => setLitres(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 mt-1"
            />
          </label>

          <label className="block">
            <span className="text-sm text-gray-300">Delivery date</span>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 mt-1"
            />
          </label>

          <label className="block">
            <span className="text-sm text-gray-300">Your email (receipt)</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 mt-1"
            />
          </label>

          <label className="block">
            <span className="text-sm text-gray-300">Full name</span>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 mt-1"
            />
          </label>

          <label className="block">
            <span className="text-sm text-gray-300">Address line 1</span>
            <input
              value={address1}
              onChange={(e) => setAddress1(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 mt-1"
            />
          </label>

          <label className="block">
            <span className="text-sm text-gray-300">Address line 2</span>
            <input
              value={address2}
              onChange={(e) => setAddress2(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 mt-1"
            />
          </label>

          <label className="block">
            <span className="text-sm text-gray-300">City</span>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 mt-1"
            />
          </label>

          <label className="block">
            <span className="text-sm text-gray-300">Postcode</span>
            <input
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 mt-1"
            />
          </label>
        </div>

        <div className="mt-4">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
            />
            <span className="text-gray-300">
              I agree to the{" "}
              <a className="underline" href="/terms" target="_blank">Terms & Conditions</a>
            </span>
          </label>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <div className="text-gray-300">
            Unit price: <strong>{money(unitPrice)}/L</strong>{" "}
            • Total: <strong className="text-yellow-400">{money(total)}</strong>
          </div>
          <button
            type="submit"
            disabled={submitting || !agree}
            className={`px-6 py-3 rounded font-semibold ${
              submitting || !agree ? "bg-gray-600" : "bg-yellow-500 hover:bg-yellow-400"
            }`}
          >
            {submitting ? "Starting Checkout…" : "Pay with Stripe"}
          </button>
        </div>
      </form>
    </main>
  );
}


