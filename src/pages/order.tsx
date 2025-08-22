import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type LatestPriceRow = { fuel: "petrol" | "diesel"; total_price: number };

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

// --------- HARD MAPS TO YOUR SCHEMA ---------
// Your table stores petrol/diesel in "product" (not "fuel")
const ORDER_FUEL_COL: "product" = "product";
// You do NOT have delivery_date or address columns; we’ll only pass those to Stripe metadata.
// Money columns you *do* have:
const USE_PENCE_COLUMNS = true; // unit_price_pence + total_pence

export default function OrderPage() {
  const [userEmail, setUserEmail] = useState<string>("");
  const [prices, setPrices] = useState<Record<"petrol" | "diesel", number>>({
    petrol: 0,
    diesel: 0,
  });

  // form
  const [fuel, setFuel] = useState<"petrol" | "diesel">("diesel");
  const [litres, setLitres] = useState<number>(1000);
  const [deliveryDate, setDeliveryDate] = useState<string>(""); // metadata only
  const [fullName, setFullName] = useState("");
  const [addr1, setAddr1] = useState("");
  const [addr2, setAddr2] = useState("");
  const [city, setCity] = useState("");
  const [postcode, setPostcode] = useState("");
  const [agreed, setAgreed] = useState(true);

  const [banner, setBanner] = useState<{ tone: "warn" | "error"; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);

  // Get current user + latest prices
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      setUserEmail(u.user?.email ?? "");

      // Read from your latest prices view/table. Adjust name if needed.
      const { data, error } = await supabase
        .from("latest_prices") // OR latest_daily_prices depending on your project
        .select("fuel,total_price");

      if (error) {
        setBanner({ tone: "error", msg: "Could not load latest prices." });
        return;
      }
      const map: any = { petrol: 0, diesel: 0 };
      (data as LatestPriceRow[]).forEach((r) => (map[r.fuel] = Number(r.total_price)));
      setPrices(map);
    })();
  }, []);

  const unitPrice = useMemo(() => prices[fuel] || 0, [prices, fuel]); // £/L
  const estTotal = useMemo(() => unitPrice * (Number(litres) || 0), [unitPrice, litres]); // £

  async function handlePay() {
    setBanner(null);

    if (!agreed) {
      setBanner({ tone: "error", msg: "Please agree to the Terms & Conditions." });
      return;
    }

    setLoading(true);
    try {
      // Always read the authenticated user (RLS insert policy uses this)
      const { data: u } = await supabase.auth.getUser();
      if (!u.user?.email) {
        setBanner({ tone: "error", msg: "You need to be logged in." });
        setLoading(false);
        return;
      }

      const unit_pence = Math.round((unitPrice || 0) * 100);
      const total_pence = Math.round(estTotal * 100);

      // Insert a MINIMAL order that matches your columns only
      // Columns present: user_email, product, unit_price_pence, total_pence, amount, status
      const insertRow: Record<string, any> = {
        user_email: u.user.email,
        [ORDER_FUEL_COL]: fuel,           // -> product: 'petrol' | 'diesel'
        status: "pending",
      };

      if (USE_PENCE_COLUMNS) {
        insertRow.unit_price_pence = unit_pence;
        insertRow.total_pence = total_pence;
        // optional: keep "amount" (numeric £) updated as well for readability
        insertRow.amount = total_pence / 100.0;
      }

      const { data: ins, error: insErr } = await supabase
        .from("orders")
        .insert(insertRow)
        .select("id")
        .single();

      if (insErr) {
        setBanner({ tone: "error", msg: `DB insert failed: ${insErr.message}` });
        setLoading(false);
        return;
      }

      // Now create Stripe Checkout on the server
      const resp = await fetch("/api/stripe/checkout/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: ins!.id,
          product: fuel,
          litres: Number(litres) || 0,
          unit_price_pence: unit_pence,
          total_pence: total_pence,
          customer_email: userEmail || u.user.email,
          // metadata only (not stored in DB)
          delivery_date: deliveryDate || null,
          full_name: fullName || null,
          address_line1: addr1 || null,
          address_line2: addr2 || null,
          city: city || null,
          postcode: postcode || null,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data?.error || `HTTP ${resp.status}`);
      }

      window.location.href = data.url; // Go to Stripe Checkout
    } catch (e: any) {
      setBanner({ tone: "error", msg: e?.message || "Something went wrong" });
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold text-yellow-400">Place an Order</h1>

        {/* Top cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card title="Petrol (95)" value={`£${prices.petrol.toFixed(2)} / litre`} />
          <Card title="Diesel" value={`£${prices.diesel.toFixed(2)} / litre`} />
          <Card title="Estimated Total" value={`£${estTotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`} />
        </div>

        {/* Helpful info: we’re saving a minimal order record only */}
        <div className="rounded bg-amber-900/50 border border-amber-500 text-amber-100 p-3">
          Some order fields (delivery date, address) are not stored in the database and will be attached to
          the Stripe payment only. Your order record will contain the product and totals.
        </div>

        {banner && (
          <div
            className={`rounded p-4 border ${
              banner.tone === "error" ? "bg-red-900/60 border-red-500" : "bg-amber-900/60 border-amber-500"
            }`}
          >
            {banner.msg}
          </div>
        )}

        {/* Form */}
        <div className="bg-gray-800 rounded p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Labeled label="Fuel">
              <select
                value={fuel}
                onChange={(e) => setFuel(e.target.value as any)}
                className="w-full bg-gray-900 rounded p-2"
              >
                <option value="petrol">Petrol (95)</option>
                <option value="diesel">Diesel</option>
              </select>
            </Labeled>

            <Labeled label="Litres">
              <input
                type="number"
                min={1}
                value={litres}
                onChange={(e) => setLitres(Number(e.target.value))}
                className="w-full bg-gray-900 rounded p-2"
              />
            </Labeled>

            <Labeled label="Delivery date (metadata)">
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full bg-gray-900 rounded p-2"
              />
            </Labeled>

            <Labeled label="Your email (receipt)">
              <input
                type="email"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                className="w-full bg-gray-900 rounded p-2"
              />
            </Labeled>

            <Labeled label="Full name (metadata)">
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full bg-gray-900 rounded p-2" />
            </Labeled>

            <Labeled label="Address line 1 (metadata)">
              <input value={addr1} onChange={(e) => setAddr1(e.target.value)} className="w-full bg-gray-900 rounded p-2" />
            </Labeled>

            <Labeled label="Address line 2 (metadata)">
              <input value={addr2} onChange={(e) => setAddr2(e.target.value)} className="w-full bg-gray-900 rounded p-2" />
            </Labeled>

            <Labeled label="City (metadata)">
              <input value={city} onChange={(e) => setCity(e.target.value)} className="w-full bg-gray-900 rounded p-2" />
            </Labeled>

            <Labeled label="Postcode (metadata)">
              <input value={postcode} onChange={(e) => setPostcode(e.target.value)} className="w-full bg-gray-900 rounded p-2" />
            </Labeled>
          </div>

          <div className="text-sm text-gray-300">
            Unit price: <b>£{unitPrice.toFixed(2)}/L</b> • Total:{" "}
            <b>£{estTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={agreed} onChange={() => setAgreed((v) => !v)} />
            I agree to the&nbsp;
            <a href="/terms" target="_blank" className="underline text-yellow-300">
              Terms & Conditions
            </a>
            .
          </label>

          <div>
            <button
              onClick={handlePay}
              disabled={loading}
              className="bg-yellow-500 hover:bg-yellow-400 text-black font-semibold px-5 py-2 rounded disabled:opacity-60"
            >
              {loading ? "Preparing…" : "Pay with Stripe"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-gray-800 rounded p-5">
      <div className="text-gray-300">{title}</div>
      <div className="text-3xl font-bold mt-1">{value}</div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-sm mb-1 text-gray-300">{label}</div>
      {children}
    </label>
  );
}



