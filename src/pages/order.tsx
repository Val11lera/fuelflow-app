// src/pages/order.tsx
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type Fuel = "petrol" | "diesel";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

const fmt = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

export default function OrderPage() {
  const [user, setUser] = useState<any>(null);

  // Prices
  const [petrolPrice, setPetrolPrice] = useState<number | null>(null);
  const [dieselPrice, setDieselPrice] = useState<number | null>(null);

  // Form
  const [fuel, setFuel] = useState<Fuel>("diesel");
  const [litres, setLitres] = useState<string>("1000");
  const [deliveryDate, setDeliveryDate] = useState<string>(""); // yyyy-mm-dd
  const [email, setEmail] = useState<string>("");

  const [fullName, setFullName] = useState("");
  const [addr1, setAddr1] = useState("");
  const [addr2, setAddr2] = useState("");
  const [city, setCity] = useState("");
  const [postcode, setPostcode] = useState("");

  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Derived
  const litresNum = useMemo(() => Number(litres) || 0, [litres]);
  const unitPrice = useMemo(
    () => (fuel === "petrol" ? petrolPrice ?? 0 : dieselPrice ?? 0),
    [fuel, petrolPrice, dieselPrice]
  );
  const totalGBP = useMemo(() => unitPrice * litresNum, [unitPrice, litresNum]);

  // Load auth + prices
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        window.location.href = "/login";
        return;
      }
      setUser(data.user);
      setEmail(data.user.email || "");

      // prices from latest_prices or latest_daily_prices
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
    })();
  }, []);

  async function handlePay() {
    try {
      setErr(null);

      if (!accepted) throw new Error("Please agree to the Terms & Conditions.");
      if (!unitPrice) throw new Error("Price unavailable.");
      if (!litresNum || litresNum <= 0) throw new Error("Enter valid litres.");
      if (!email) throw new Error("Email is required.");
      if (!fullName) throw new Error("Full name is required.");
      if (!addr1 || !city || !postcode) throw new Error("Please complete your address.");

      setBusy(true);

// 1) Create order row with the new fixed columns
const row = {
  user_email: (user?.email || "").toLowerCase(),
  fuel,
  product: fuel,                // <-- ADD THIS LINE
  litres: litresNum,
  name: fullName,
  address_line1: addr1,
  address_line2: addr2 || null,
  city,
  postcode,
  delivery_date: deliveryDate || null,
  unit_price_pence: Math.round(unitPrice * 100),
  total_pence: Math.round(totalGBP * 100),
  status: "ordered" as const,
};


      const { data: created, error } = await supabase
        .from("orders")
        .insert(row)
        .select("id")
        .single();

      if (error) throw new Error(error.message || "DB insert failed");
      const orderId = created?.id as string;

      // 2) Start Stripe Checkout (send all details as metadata)
      const payload = {
        order_id: orderId,
        fuel,
        litres: litresNum,
        unit_price: unitPrice,
        total: totalGBP,
        delivery_date: deliveryDate || null,
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
      if (!resp.ok || !data?.url) throw new Error(data?.error || `HTTP ${resp.status}`);

      window.location.href = data.url;
    } catch (e: any) {
      setBusy(false);
      setErr(e?.message || "Something went wrong.");
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white px-4 sm:px-6 py-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-yellow-400">Place an Order</h1>
          <a href="/client-dashboard" className="text-gray-300 hover:text-white underline">
            Back to Dashboard
          </a>
        </div>

        {/* Price cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-800 p-5 rounded-xl">
            <p className="text-gray-400">Petrol (95)</p>
            <p className="text-2xl sm:text-3xl font-bold mt-2">
              {petrolPrice != null ? fmt.format(petrolPrice) : "—"}
              <span className="text-base font-normal text-gray-300"> / litre</span>
            </p>
          </div>
          <div className="bg-gray-800 p-5 rounded-xl">
            <p className="text-gray-400">Diesel</p>
            <p className="text-2xl sm:text-3xl font-bold mt-2">
              {dieselPrice != null ? fmt.format(dieselPrice) : "—"}
              <span className="text-base font-normal text-gray-300"> / litre</span>
            </p>
          </div>
          <div className="bg-gray-800 p-5 rounded-xl">
            <p className="text-gray-400">Estimated Total</p>
            <p className="text-2xl sm:text-3xl font-bold mt-2">{fmt.format(totalGBP)}</p>
          </div>
        </div>

        {/* Any error */}
        {err && (
          <div className="bg-red-800/60 border border-red-500 text-red-100 p-4 rounded mb-6">
            {err}
          </div>
        )}

        {/* Form */}
        <div className="bg-gray-800 rounded-xl p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Fuel */}
            <div>
              <label className="block text-sm text-gray-300 mb-1">Fuel</label>
              <select
                value={fuel}
                onChange={(e) => setFuel(e.target.value as Fuel)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
              >
                <option value="diesel">Diesel</option>
                <option value="petrol">Petrol (95)</option>
              </select>
            </div>

            {/* Litres */}
            <div>
              <label className="block text-sm text-gray-300 mb-1">Litres</label>
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
              <label className="block text-sm text-gray-300 mb-1">Delivery date</label>
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm text-gray-300 mb-1">Your email (receipt)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
              />
            </div>

            {/* Full name */}
            <div>
              <label className="block text-sm text-gray-300 mb-1">Full name</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
              />
            </div>

            {/* Address 1 */}
            <div>
              <label className="block text-sm text-gray-300 mb-1">Address line 1</label>
              <input
                value={addr1}
                onChange={(e) => setAddr1(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
              />
            </div>

            {/* Address 2 */}
            <div>
              <label className="block text-sm text-gray-300 mb-1">Address line 2</label>
              <input
                value={addr2}
                onChange={(e) => setAddr2(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
              />
            </div>

            {/* City */}
            <div>
              <label className="block text-sm text-gray-300 mb-1">City</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
              />
            </div>

            {/* Postcode */}
            <div>
              <label className="block text-sm text-gray-300 mb-1">Postcode</label>
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
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor="terms" className="text-sm text-gray-300">
              I agree to the{" "}
              <a href="/terms" target="_blank" className="underline">
                Terms &amp; Conditions
              </a>
              .
            </label>
          </div>

          {/* Footer */}
          <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-gray-300">
            <div>
              Unit price: <strong>{fmt.format(unitPrice)}/L</strong> • Total:{" "}
              <strong>{fmt.format(totalGBP)}</strong>
            </div>
            <button
              disabled={busy}
              onClick={handlePay}
              className="bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-medium px-5 py-2 rounded-lg"
            >
              {busy ? "Loading…" : "Pay with Stripe"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}



