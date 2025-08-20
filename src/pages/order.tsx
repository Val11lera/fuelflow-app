// src/pages/order.tsx
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

type LatestPriceRow = {
  fuel: "petrol" | "diesel";
  price_date: string;
  total_price: number;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

// Accepts "YYYY-MM-DD" or "DD/MM/YYYY" (also dots/spaces) -> returns ISO "YYYY-MM-DD" or null
function toIsoDate(value: string): string | null {
  if (!value) return null;
  const t = value.trim();

  // direct ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;

  // DD/MM/YYYY or DD.MM.YYYY or DD MM YYYY
  const m = t.match(/^(\d{1,2})[\/.\s](\d{1,2})[\/.\s](\d{4})$/);
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

function money(n: number | null | undefined, currency = "GBP") {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(
    n
  );
}

export default function OrderPage() {
  // prices
  const [petrolPrice, setPetrolPrice] = useState<number | null>(null);
  const [dieselPrice, setDieselPrice] = useState<number | null>(null);
  const [pricesErr, setPricesErr] = useState<string | null>(null);

  // form
  const [fuel, setFuel] = useState<"petrol" | "diesel">("diesel");
  const [litres, setLitres] = useState<string>("1000"); // as string for easy typing
  const [delivery, setDelivery] = useState<string>(""); // user-entered date (any format)
  const [email, setEmail] = useState<string>("");
  const [fullName, setFullName] = useState<string>("");
  const [addr1, setAddr1] = useState<string>("");
  const [addr2, setAddr2] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [postcode, setPostcode] = useState<string>("");

  // validation
  const [formErrs, setFormErrs] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // derived
  const unitPrice = useMemo(() => {
    return fuel === "petrol" ? petrolPrice : dieselPrice;
  }, [fuel, petrolPrice, dieselPrice]);

  const litresNum = useMemo(() => {
    // accept 1,000.5 or 1000,5 (comma decimal) or 1000.5
    const normalised = litres.replace(",", ".").replace(/[^0-9.]/g, "");
    const n = Number(normalised);
    return Number.isFinite(n) ? n : NaN;
  }, [litres]);

  const total = useMemo(() => {
    if (unitPrice == null || !Number.isFinite(litresNum)) return null;
    return unitPrice * litresNum;
  }, [unitPrice, litresNum]);

  useEffect(() => {
    // load latest prices once
    (async () => {
      setPricesErr(null);
      const { data, error } = await supabase
        .from("latest_daily_prices")
        .select("fuel, price_date, total_price");
      if (error) {
        setPricesErr(error.message);
        return;
      }
      let petrol: number | null = null;
      let diesel: number | null = null;
      (data as LatestPriceRow[]).forEach((r) => {
        if (r.fuel === "petrol") petrol = r.total_price;
        if (r.fuel === "diesel") diesel = r.total_price;
      });
      setPetrolPrice(petrol);
      setDieselPrice(diesel);
    })();
  }, []);

  function validate(): string[] {
    const errs: string[] = [];

    const iso = toIsoDate(delivery);
    if (!iso) errs.push("Please enter Delivery date as YYYY-MM-DD or DD/MM/YYYY");

    if (!Number.isFinite(litresNum) || litresNum <= 0) {
      errs.push("Litres must be a positive number");
    }

    // optional: min/max guard rails
    if (Number.isFinite(litresNum) && (litresNum < 100 || litresNum > 50000)) {
      errs.push("Litres must be between 100 and 50,000");
    }

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) errs.push("Valid email is required");
    if (!fullName.trim()) errs.push("Full name is required");
    if (!addr1.trim()) errs.push("Address line 1 is required");
    if (!city.trim()) errs.push("City is required");
    if (!postcode.trim()) errs.push("Postcode is required");
    if (unitPrice == null) errs.push("Current price is unavailable");

    return errs;
  }

  async function handleSubmit() {
    const errs = validate();
    setFormErrs(errs);
    if (errs.length) return;

    setSubmitting(true);
    try {
      const isoDate = toIsoDate(delivery)!;

      // Build payload your /api/stripe/checkout/test expects.
      // If your endpoint needs a different shape, adjust here.
      const resp = await fetch("/api/stripe/checkout/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fuel,
          litres: litresNum,
          unit_price: unitPrice,
          total: total,
          delivery_date: isoDate,
          email,
          full_name: fullName,
          address_line1: addr1,
          address_line2: addr2,
          city,
          postcode,
        }),
      });

      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(txt || "Checkout failed");
      }

      const json = await resp.json();
      if (json.url) {
        window.location.href = json.url; // Stripe Checkout URL
      } else {
        throw new Error("No redirect URL from server");
      }
    } catch (e: any) {
      setFormErrs([e.message || "Checkout failed"]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-yellow-400">Place an Order</h1>
          <Link
            href="/client-dashboard"
            className="text-sm text-gray-300 hover:text-white underline"
          >
            Back to Dashboard
          </Link>
        </div>

        {/* price tiles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-800 rounded-xl p-5">
            <div className="text-gray-400">Petrol (95)</div>
            <div className="text-3xl font-bold mt-2">
              {money(petrolPrice)} <span className="text-base font-normal text-gray-400">/ litre</span>
            </div>
          </div>
          <div className="bg-gray-800 rounded-xl p-5">
            <div className="text-gray-400">Diesel</div>
            <div className="text-3xl font-bold mt-2">
              {money(dieselPrice)} <span className="text-base font-normal text-gray-400">/ litre</span>
            </div>
          </div>
          <div className="bg-gray-800 rounded-xl p-5">
            <div className="text-gray-400">Estimated Total</div>
            <div className="text-3xl font-bold mt-2">{money(total)}</div>
          </div>
        </div>

        {/* errors */}
        {formErrs.length > 0 && (
          <div className="bg-red-800/60 border border-red-600 text-red-200 rounded-md p-4 mb-6">
            <div className="font-semibold mb-1">Please fix the following:</div>
            <ul className="list-disc list-inside space-y-1">
              {formErrs.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        {pricesErr && (
          <div className="bg-yellow-800/60 border border-yellow-600 text-yellow-100 rounded-md p-3 mb-6">
            {pricesErr}
          </div>
        )}

        {/* form */}
        <div className="bg-gray-800 rounded-xl p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* fuel */}
            <div>
              <label className="block text-sm text-gray-300 mb-1">Fuel</label>
              <select
                value={fuel}
                onChange={(e) => setFuel(e.target.value as "petrol" | "diesel")}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              >
                <option value="petrol">Petrol (95)</option>
                <option value="diesel">Diesel</option>
              </select>
            </div>

            {/* litres */}
            <div>
              <label className="block text-sm text-gray-300 mb-1">Litres</label>
              <input
                type="number"
                step="0.01"
                min={0}
                inputMode="decimal"
                value={litres}
                onChange={(e) => setLitres(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                placeholder="e.g. 1000"
              />
            </div>

            {/* delivery date */}
            <div>
              <label className="block text-sm text-gray-300 mb-1">Delivery date</label>
              <input
                type="text"
                value={delivery}
                onChange={(e) => setDelivery(e.target.value)}
                placeholder="YYYY-MM-DD or DD/MM/YYYY"
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
            </div>

            {/* email */}
            <div>
              <label className="block text-sm text-gray-300 mb-1">Your email (receipt)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                placeholder="you@example.com"
              />
            </div>

            {/* full name */}
            <div>
              <label className="block text-sm text-gray-300 mb-1">Full name</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                placeholder="Name for delivery"
              />
            </div>

            {/* address line 1 */}
            <div>
              <label className="block text-sm text-gray-300 mb-1">Address line 1</label>
              <input
                value={addr1}
                onChange={(e) => setAddr1(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                placeholder="Street, building"
              />
            </div>

            {/* address line 2 */}
            <div>
              <label className="block text-sm text-gray-300 mb-1">Address line 2</label>
              <input
                value={addr2}
                onChange={(e) => setAddr2(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                placeholder="Apt, unit (optional)"
              />
            </div>

            {/* city */}
            <div>
              <label className="block text-sm text-gray-300 mb-1">City</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
            </div>

            {/* postcode */}
            <div>
              <label className="block text-sm text-gray-300 mb-1">Postcode</label>
              <input
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
            </div>
          </div>

          <div className="text-gray-400 mt-4">
            Unit price: <span className="text-gray-200">{money(unitPrice)}/L</span>{" "}
            • Total: <span className="text-yellow-400 font-bold">{money(total)}</span>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-yellow-500 text-black px-5 py-2 rounded hover:bg-yellow-400 disabled:opacity-60"
            >
              {submitting ? "Processing…" : "Pay with Stripe"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

