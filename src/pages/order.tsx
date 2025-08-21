// src/pages/order.tsx
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type PriceRow = { fuel: "petrol" | "diesel"; total_price: number };

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

function money(n: number | null | undefined) {
  if (!Number.isFinite(n as number)) return "—";
  return `£${(n as number).toFixed(2)}`;
}

type AddrShape = "split" | "single" | "unknown";
type MoneyShape = "pence" | "numeric" | "unknown";

export default function OrderPage() {
  const [user, setUser] = useState<any>(null);

  // prices
  const [petrolPrice, setPetrolPrice] = useState<number | null>(null);
  const [dieselPrice, setDieselPrice] = useState<number | null>(null);

  // form
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

  // UI
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  // detected table shape
  const [addrShape, setAddrShape] = useState<AddrShape>("unknown");
  const [moneyShape, setMoneyShape] = useState<MoneyShape>("unknown");

  const unitPrice = useMemo(() => {
    const p = fuel === "petrol" ? petrolPrice : dieselPrice;
    return p ?? null;
  }, [fuel, petrolPrice, dieselPrice]);

  const total = useMemo(() => {
    const L = Number(litres);
    if (!unitPrice || !Number.isFinite(L)) return null;
    return unitPrice * L;
  }, [unitPrice, litres]);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) {
        window.location.href = "/login";
        return;
      }
      setUser(u.user);
      setEmail(u.user.email || "");

      // prices (try latest_prices -> latest_daily_prices)
      let { data: lp, error: e1 } = await supabase
        .from("latest_prices")
        .select("fuel,total_price");
      if (e1 || !lp?.length) {
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

      // ==== Detect orders table shape (no DB migrations) ====

      // Address shape
      // If selecting a non-existing column errors, that's OK – we catch quietly.
      let aShape: AddrShape = "unknown";
      let r1 = await supabase.from("orders").select("address_line1").limit(0);
      if (!r1.error) aShape = "split";
      if (aShape === "unknown") {
        let r2 = await supabase.from("orders").select("address").limit(0);
        if (!r2.error) aShape = "single";
      }
      setAddrShape(aShape);

      // Money shape
      let mShape: MoneyShape = "unknown";
      let m1 = await supabase
        .from("orders")
        .select("unit_price_pence,total_pence")
        .limit(0);
      if (!m1.error) mShape = "pence";
      if (mShape === "unknown") {
        let m2 = await supabase
          .from("orders")
          .select("unit_price,total_amount_pence")
          .limit(0);
        if (!m2.error) mShape = "numeric";
      }
      setMoneyShape(mShape);

      if (aShape === "unknown" || mShape === "unknown") {
        setWarn(
          "Some order columns were not detected. We will save a minimal order record and continue to Stripe."
        );
      }
    })();
  }, []);

  async function handlePay() {
    try {
      setErr(null);
      setWarn(null);

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

      // Build payload only with columns that exist
      const baseCommon: any = {
        user_email: (user?.email || "").toLowerCase(),
        fuel,
        litres: L,
        delivery_date: deliveryDate, // YYYY-MM-DD
        name: fullName,
        status: "ordered",
      };

      // address
      if (addrShape === "split") {
        baseCommon.address_line1 = addr1;
        baseCommon.address_line2 = addr2 || null;
        baseCommon.city = city;
        baseCommon.postcode = postcode;
      } else if (addrShape === "single") {
        baseCommon.address = [addr1, addr2, city].filter(Boolean).join(", ");
        baseCommon.postcode = postcode;
      } else {
        // unknown: store only what is safe
        baseCommon.postcode = postcode;
      }

      // money
      const totalGBP = unitPrice * L;
      if (moneyShape === "pence") {
        baseCommon.unit_price_pence = Math.round(unitPrice * 100);
        baseCommon.total_pence = Math.round(totalGBP * 100);
      } else if (moneyShape === "numeric") {
        baseCommon.unit_price = unitPrice;
        baseCommon.total_amount_pence = Math.round(totalGBP * 100);
      } // unknown -> store nothing extra

      // Insert (no unknown columns are sent)
      const { data: created, error } = await supabase
        .from("orders")
        .insert(baseCommon)
        .select("id")
        .single();

      if (error) {
        throw new Error(error.message || "DB insert failed");
      }
      const orderId = created?.id as string;

      // Stripe payload (can include rich details regardless of DB columns)
      const payload = {
        order_id: orderId,
        fuel,
        litres: L,
        unit_price: unitPrice,
        total: totalGBP,
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

      window.location.href = data.url;
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
            <div className="text-3xl font-bold mt-2">
              {money(petrolPrice)} <span className="text-sm font-normal">/ litre</span>
            </div>
          </div>
          <div className="bg-gray-800 p-5 rounded-lg">
            <div className="text-sm text-gray-300">Diesel</div>
            <div className="text-3xl font-bold mt-2">
              {money(dieselPrice)} <span className="text-sm font-normal">/ litre</span>
            </div>
          </div>
          <div className="bg-gray-800 p-5 rounded-lg">
            <div className="text-sm text-gray-300">Estimated Total</div>
            <div className="text-3xl font-bold mt-2">{money(total)}</div>
          </div>
        </div>

        {err && (
          <div className="mt-6 bg-red-700/80 border border-red-500 text-red-100 p-4 rounded">
            <p className="font-semibold">Please fix the following:</p>
            <p className="mt-1">{err}</p>
          </div>
        )}
        {!err && warn && (
          <div className="mt-6 bg-yellow-800/70 border border-yellow-500 text-yellow-100 p-4 rounded">
            {warn}
          </div>
        )}

        {/* Form */}
        <div className="bg-gray-800 rounded-lg p-6 mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

            <div>
              <label className="block text-gray-300 mb-1">Delivery date</label>
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-gray-300 mb-1">Your email (receipt)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-gray-300 mb-1">Full name</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-gray-300 mb-1">Address line 1</label>
              <input
                value={addr1}
                onChange={(e) => setAddr1(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-gray-300 mb-1">Address line 2</label>
              <input
                value={addr2}
                onChange={(e) => setAddr2(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-gray-300 mb-1">City</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-gray-300 mb-1">Postcode</label>
              <input
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
              />
            </div>
          </div>

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

