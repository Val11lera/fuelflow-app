// src/pages/order.tsx
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type Fuel = "petrol" | "diesel";
type AddrShape = "split" | "single" | "unknown";
type MoneyShape = "pence" | "numeric" | "unknown";

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

// ======= FORCE SHAPE OVERRIDES (set these to match your table, see Step 2) =======
const FORCE_ADDR_SHAPE: "split" | "single" | null = null;   // e.g. 'split'
const FORCE_MONEY_SHAPE: "pence" | "numeric" | null = null; // e.g. 'pence'
const FORCE_HAS_STATUS: boolean | null = null;              // e.g. true

export default function OrderPage() {
  // auth / prices
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

  // schema “shape” (we keep detection minimal/safe)
  const [addrShape, setAddrShape] = useState<AddrShape>("unknown");
  const [moneyShape, setMoneyShape] = useState<MoneyShape>("unknown");
  const [hasStatus, setHasStatus] = useState<boolean | null>(null);

  // ---------- derived ----------
  const unitPrice = useMemo(() => {
    return fuel === "petrol" ? petrolPrice ?? 0 : dieselPrice ?? 0;
  }, [fuel, petrolPrice, dieselPrice]);

  const litresNum = useMemo(() => Number(litres) || 0, [litres]);
  const totalGBP = useMemo(() => unitPrice * litresNum, [unitPrice, litresNum]);

  // ---------- load auth + prices + (optionally) detect shape ----------
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

      // ----- shape detection (safe; does NOT touch delivery_date) -----
      if (FORCE_ADDR_SHAPE) setAddrShape(FORCE_ADDR_SHAPE);
      if (FORCE_MONEY_SHAPE) setMoneyShape(FORCE_MONEY_SHAPE);
      if (FORCE_HAS_STATUS !== null) setHasStatus(FORCE_HAS_STATUS);

      if (!FORCE_ADDR_SHAPE || !FORCE_MONEY_SHAPE || FORCE_HAS_STATUS === null) {
        const emailLower = (data.user.email || "").toLowerCase();

        async function colExists(sel: string) {
          const { error } = await supabase
            .from("orders")
            .select(sel)
            .eq("user_email", emailLower)
            .limit(0);
          return !error;
        }

        if (!FORCE_ADDR_SHAPE) {
          let a: AddrShape = "unknown";
          if (await colExists("address_line1")) a = "split";
          else if (await colExists("address")) a = "single";
          setAddrShape(a);
        }
        if (!FORCE_MONEY_SHAPE) {
          let m: MoneyShape = "unknown";
          if (await colExists("unit_price_pence,total_pence")) m = "pence";
          else if (await colExists("unit_price,total_amount_pence")) m = "numeric";
          setMoneyShape(m);
        }
        if (FORCE_HAS_STATUS === null) {
          setHasStatus(await colExists("status"));
        }
      }

      if (
        (FORCE_ADDR_SHAPE ?? "unknown") === "unknown" &&
        (FORCE_MONEY_SHAPE ?? "unknown") === "unknown"
      ) {
        setWarn(
          "Some order columns were not detected. We will save a minimal order record and continue to Stripe."
        );
      } else {
        setWarn(null);
      }
    })();
  }, []);

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

      // Build minimal row (only columns we know will exist)
      const row: any = {
        user_email: (user?.email || "").toLowerCase(),
        fuel,
        litres: litresNum,
        name: fullName,
      };

      // Address shape
      if (addrShape === "split") {
        row.address_line1 = addr1;
        row.address_line2 = addr2 || null;
        row.city = city;
        row.postcode = postcode;
      } else if (addrShape === "single") {
        row.address = [addr1, addr2, city].filter(Boolean).join(", ");
        row.postcode = postcode;
      } else {
        // unknown — store something minimally helpful
        row.postcode = postcode;
      }

      // Money shape
      if (moneyShape === "pence") {
        row.unit_price_pence = Math.round(unitPrice * 100);
        row.total_pence = Math.round(totalGBP * 100);
      } else if (moneyShape === "numeric") {
        row.unit_price = unitPrice;
        row.total_amount_pence = Math.round(totalGBP * 100);
      }

      // Optional status column
      if (hasStatus) row.status = "ordered";

      // IMPORTANT: we do NOT set delivery_date here.
      // If your table has a delivery_date column and it's nullable,
      // you can add: row.delivery_date = deliveryDate || null;

      const { data: created, error } = await supabase
        .from("orders")
        .insert(row)
        .select("id")
        .single();
      if (error) throw new Error(error.message || "DB insert failed");
      const orderId = created?.id as string;

      // Create Stripe Checkout (send everything as metadata)
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
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-yellow-400">Place an Order</h1>
          <a
            href="/client-dashboard"
            className="text-gray-300 hover:text-white underline"
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

            {/* Delivery date (kept for metadata / webhook) */}
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
          <div className="mt-6 flex items-center justify-between text-gray-300">
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


