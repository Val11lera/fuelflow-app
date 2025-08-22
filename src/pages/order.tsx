// src/pages/order.tsx
import { useEffect, useMemo, useState } from "react";
import { createClient, PostgrestError } from "@supabase/supabase-js";

type Fuel = "petrol" | "diesel";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

const fmt = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function OrderPage() {
  // auth + prices
  const [user, setUser] = useState<any>(null);
  const [petrolPrice, setPetrolPrice] = useState<number | null>(null);
  const [dieselPrice, setDieselPrice] = useState<number | null>(null);

  // form
  const [fuel, setFuel] = useState<Fuel>("diesel");
  const [litres, setLitres] = useState<string>("1000");
  const [deliveryDate, setDeliveryDate] = useState<string>(""); // yyyy-mm-dd
  const [email, setEmail] = useState<string>("");

  const [fullName, setFullName] = useState<string>("");
  const [addr1, setAddr1] = useState<string>("");
  const [addr2, setAddr2] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [postcode, setPostcode] = useState<string>("");
  const [accepted, setAccepted] = useState<boolean>(false);

  // ui state
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  // ---------- derived ----------
  const unitPrice = useMemo(
    () => (fuel === "petrol" ? petrolPrice ?? 0 : dieselPrice ?? 0),
    [fuel, petrolPrice, dieselPrice]
  );
  const litresNum = useMemo(() => Number(litres) || 0, [litres]);
  const totalGBP = useMemo(() => unitPrice * litresNum, [unitPrice, litresNum]);

  // ---------- load auth + prices ----------
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        window.location.href = "/login";
        return;
      }
      setUser(data.user);
      setEmail(data.user.email || "");

      // Prices: try latest_prices then latest_daily_prices
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

  // ---- helper: insert with graceful fallback if some columns are missing
  async function insertOrder(rowFull: Record<string, any>) {
    // 1) Try full insert
    let res = await supabase
      .from("orders")
      .insert(rowFull)
      .select("id")
      .single();

    if (!res.error) return res.data;

    const msg = (res.error as PostgrestError)?.message || "";
    const looksLikeMissingColumn =
      msg.includes("column") && msg.includes("does not exist");

    if (!looksLikeMissingColumn) throw res.error;

    // 2) Retry with a minimal set of guaranteed columns
    const minimal = {
      user_email: rowFull.user_email,
      fuel: rowFull.fuel,
      product: rowFull.product, // legacy/compat required by your table
      litres: rowFull.litres,
      unit_price_pence: rowFull.unit_price_pence,
      total_pence: rowFull.total_pence,
      amount: rowFull.amount, // GBP numeric, NOT NULL
      status: "ordered",
    };

    const res2 = await supabase
      .from("orders")
      .insert(minimal)
      .select("id")
      .single();

    if (res2.error) throw res2.error;

    setWarn(
      "Some order fields (delivery date, address) are not stored in the database and will be attached to the Stripe payment only. Your order record will contain the product and totals."
    );
    return res2.data;
  }

  // ---------- submit ----------
  async function handlePay() {
    try {
      setErr(null);

      if (!accepted) throw new Error("Please agree to the Terms & Conditions.");
      if (!unitPrice) throw new Error("Price unavailable for the selected fuel.");
      if (!litresNum || litresNum <= 0) throw new Error("Enter valid litres.");
      if (!email) throw new Error("Email is required.");
      if (!fullName) throw new Error("Full name is required.");
      if (!addr1 || !city || !postcode)
        throw new Error("Please complete your address.");

      setBusy(true);

      // --- compute amounts
      const unit_price_pence = Math.round(unitPrice * 100);
      const total_pence = unit_price_pence * litresNum;
      const amount = +(total_pence / 100).toFixed(2); // GBP numeric (for NOT NULL)

      // --- full row we *want* to store
      const row: Record<string, any> = {
        user_email: (user?.email || "").toLowerCase(),
        fuel,
        product: fuel, // your table still uses 'product' (NOT NULL) -> mirror fuel
        litres: litresNum,
        name: fullName,

        address_line1: addr1,
        address_line2: addr2 || null,
        city,
        postcode,
        delivery_date: deliveryDate || null,

        unit_price_pence,
        total_pence,
        amount, // GBP numeric, NOT NULL
        status: "ordered",
      };

      // Insert (with graceful fallback if some columns are missing)
      const created = await insertOrder(row);
      const orderId = created?.id as string;

      // Create Stripe Checkout (attach all details as metadata)
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
      if (!resp.ok || !data?.url) {
        throw new Error(data?.error || `HTTP ${resp.status}`);
      }
      window.location.href = data.url;
    } catch (e: any) {
      setBusy(false);
      setErr(e?.message || "Something went wrong.");
    }
  }

  // ---------- UI ----------
  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
          <h1 className="text-3xl font-bold text-yellow-400">Place an Order</h1>
          <a
            href="/client-dashboard"
            className="text-gray-300 hover:text-white underline self-start md:self-auto"
          >
            Back to Dashboard
          </a>
        </div>

        {/* price cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-800 p-5 rounded-xl">
            <p className="text-gray-400">Petrol (95)</p>
            <p className="text-3xl font-bold mt-2">
              {petrolPrice != null ? fmt.format(petrolPrice) : "—"}
              <span className="text-base font-normal text-gray-300"> / litre</span>
            </p>
          </div>
          <div className="bg-gray-800 p-5 rounded-xl">
            <p className="text-gray-400">Diesel</p>
            <p className="text-3xl font-bold mt-2">
              {dieselPrice != null ? fmt.format(dieselPrice) : "—"}
              <span className="text-base font-normal text-gray-300"> / litre</span>
            </p>
          </div>
          <div className="bg-gray-800 p-5 rounded-xl">
            <p className="text-gray-400">Estimated Total</p>
            <p className="text-3xl font-bold mt-2">{fmt.format(totalGBP)}</p>
          </div>
        </div>

        {warn && (
          <div className="bg-amber-800/60 border border-amber-500 text-amber-100 p-4 rounded mb-6">
            {warn}
          </div>
        )}
        {err && (
          <div className="bg-red-800/60 border border-red-500 text-red-100 p-4 rounded mb-6">
            {err}
          </div>
        )}

        {/* form */}
        <div className="bg-gray-800 rounded-xl p-4 md:p-6">
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
              <label className="block text-sm text-gray-300 mb-1">
                Delivery date
              </label>
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
              />
            </div>

            {/* Email (receipt) */}
            <div>
              <label className="block text-sm text-gray-300 mb-1">
                Your email (receipt)
              </label>
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

            {/* Address line 1 */}
            <div>
              <label className="block text-sm text-gray-300 mb-1">
                Address line 1
              </label>
              <input
                value={addr1}
                onChange={(e) => setAddr1(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
              />
            </div>

            {/* Address line 2 */}
            <div>
              <label className="block text-sm text-gray-300 mb-1">
                Address line 2
              </label>
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

          {/* terms */}
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

          {/* footer */}
          <div className="mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-gray-300">
            <div>
              Unit price: <strong>{fmt.format(unitPrice)}/L</strong> • Total:{" "}
              <strong>{fmt.format(totalGBP)}</strong>
            </div>
            <button
              disabled={busy}
              onClick={handlePay}
              className="bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-medium px-5 py-2 rounded-lg w-full md:w-auto"
            >
              {busy ? "Loading…" : "Pay with Stripe"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}



