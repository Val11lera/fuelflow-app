// src/pages/order.tsx
// src/pages/order.tsx
// src/pages/order.tsx
// src/pages/order.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type Fuel = "diesel" | "petrol";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

function fmtGBP(n: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
  }).format(n);
}

type ContractStatus = {
  exists: boolean;
  status?: "signed" | "approved";
  approved?: boolean;
};

export default function OrderPage() {
  // ---------- pricing ----------
  const [petrolPrice, setPetrolPrice] = useState<number>(0);
  const [dieselPrice, setDieselPrice] = useState<number>(0);
  const [priceErr, setPriceErr] = useState<string | null>(null);

  // ---------- selection & totals ----------
  const [fuel, setFuel] = useState<Fuel>("diesel");
  const [litres, setLitres] = useState<number>(1000);
  const unitPrice = useMemo(
    () => (fuel === "diesel" ? dieselPrice : petrolPrice),
    [fuel, petrolPrice, dieselPrice]
  );
  const total = useMemo(() => litres * unitPrice, [litres, unitPrice]);

  // ---------- user/auth ----------
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");

  // ---------- contract ----------
  const [tankOption, setTankOption] = useState<"none" | "buy" | "rent">("none");
  const [buyStatus, setBuyStatus] = useState<ContractStatus>({ exists: false });
  const [rentStatus, setRentStatus] = useState<ContractStatus>({ exists: false });

  // ---------- form fields ----------
  const [deliveryDate, setDeliveryDate] = useState<string>("");
  const [fullName, setFullName] = useState<string>("");
  const [address1, setAddress1] = useState<string>("");
  const [address2, setAddress2] = useState<string>("");
  const [postcode, setPostcode] = useState<string>("");
  const [city, setCity] = useState<string>("");

  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const contractNeeded = tankOption === "buy" || tankOption === "rent";
  const contractOk =
    tankOption === "none"
      ? true
      : tankOption === "buy"
      ? buyStatus.exists // buy has no approval step; signed is enough
      : rentStatus.exists; // rent must be signed; payment is disabled until admin approval (UI shows warning)

  // ---------- load auth + prices ----------
  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token || null;
      setAccessToken(token || null);
      setEmail(sess?.session?.user?.email || "");

      try {
        setPriceErr(null);
        // try unified view first
        const { data: lp, error: e1 } = await supabase
          .from("latest_prices")
          .select("fuel,total_price");
        let rows = lp || [];
        if (!rows.length) {
          // fallback to daily view
          const { data: dp, error: e2 } = await supabase
            .from("latest_daily_prices")
            .select("fuel,total_price");
          rows = dp || [];
          if (!rows.length) {
            setPriceErr(e1?.message || e2?.message || "No prices found");
          }
        }
        for (const r of rows as any[]) {
          if (r.fuel === "petrol") setPetrolPrice(Number(r.total_price));
          if (r.fuel === "diesel") setDieselPrice(Number(r.total_price));
        }
      } catch (e: any) {
        setPriceErr(e?.message || "Failed to load prices");
      }
    })();
  }, []);

  // ---------- check contracts ----------
  async function loadContract(option: "buy" | "rent") {
    if (!accessToken) return;
    try {
      const resp = await fetch(`/api/contracts/latest?option=${option}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = (await resp.json()) as ContractStatus & { exists: boolean };
      if (option === "buy") setBuyStatus(json);
      else setRentStatus(json);
    } catch {
      if (option === "buy") setBuyStatus({ exists: false });
      else setRentStatus({ exists: false });
    }
  }

  useEffect(() => {
    if (accessToken) {
      loadContract("buy");
      loadContract("rent");
    }
  }, [accessToken]);

  // ---------- submit to Stripe ----------
  async function onSubmitOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!acceptedTerms) return;
    if (contractNeeded && !contractOk) return;

    setSubmitting(true);
    try {
      const resp = await fetch("/api/stripe/checkout/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fuel,
          litres,
          deliveryDate: deliveryDate || null,
          full_name: fullName || null,
          email: email || null,
          address_line1: address1 || null,
          address_line2: address2 || null,
          city: city || null,
          postcode: postcode || null,
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        alert(JSON.stringify(data || { error: "Failed to create order" }));
        return;
      }
      if (data?.url) {
        window.location.href = data.url as string;
      } else {
        alert("Stripe session URL missing.");
      }
    } catch (e: any) {
      alert(e?.message || "Failed to create order");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#071B33] text-white">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-end px-4 pt-6">
        <a href="/client-dashboard" className="text-sm text-white/80 hover:text-white">
          Back to Dashboard
        </a>
      </div>

      <section className="mx-auto w-full max-w-6xl px-4">
        <h1 className="mt-2 text-3xl font-bold">Place an Order</h1>

        {/* BUY / RENT panels */}
        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
          <TankPanel
            type="buy"
            title="Buy a Fuel Tank"
            bullets={[
              "One-time cost with full ownership.",
              "Variety of sizes and specifications.",
              "Best for long-term sites and high-volume usage.",
            ]}
            selected={tankOption === "buy"}
            onSelect={() => setTankOption("buy")}
            onOpenROI={() => alert("ROI coming soon")}
            onStartContract={() => alert("Open your Buy contract modal here")}
            statusBadge={
              buyStatus.exists ? (
                <span className="text-green-400 text-sm">Contract signed</span>
              ) : null
            }
            startDisabled={buyStatus.exists}
          />

          <TankPanel
            type="rent"
            title="Rent a Fuel Tank"
            bullets={[
              "Flexible rental plans (short & long term).",
              "Maintenance and support included.",
              "Ideal for temp sites and events.",
            ]}
            selected={tankOption === "rent"}
            onSelect={() => setTankOption("rent")}
            onOpenROI={() => alert("ROI coming soon")}
            onStartContract={() => alert("Open your Rent contract modal here")}
            statusBadge={
              rentStatus.approved ? (
                <span className="text-green-400 text-sm">Approved</span>
              ) : rentStatus.exists ? (
                <span className="text-yellow-300 text-sm">Awaiting admin approval</span>
              ) : null
            }
            startDisabled={rentStatus.exists}
          />
        </div>

        {/* price cards */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card title="Petrol (95)" value={`${fmtGBP(petrolPrice)} `} suffix="/ litre" />
          <Card title="Diesel" value={`${fmtGBP(dieselPrice)} `} suffix="/ litre" />
          <Card title="Estimated Total" value={fmtGBP(total)} />
        </div>
        {priceErr && (
          <p className="text-red-300 text-sm mt-2">Price load error: {priceErr}</p>
        )}

        {/* form */}
        <form onSubmit={onSubmitOrder} className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Fuel">
              <select
                value={fuel}
                onChange={(e) => setFuel(e.target.value as Fuel)}
                className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none"
              >
                <option value="diesel">Diesel</option>
                <option value="petrol">Petrol (95)</option>
              </select>
            </Field>

            <Field label="Litres">
              <input
                type="number"
                min={1}
                value={litres}
                onChange={(e) => setLitres(parseInt(e.target.value || "0", 10))}
                className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none"
              />
            </Field>

            <Field label="Delivery date">
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none"
              />
            </Field>

            <Field label="Your email (receipt)">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none"
              />
            </Field>

            <Field className="md:col-span-2" label="Full name">
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none"
              />
            </Field>

            <Field label="Address line 1">
              <input
                value={address1}
                onChange={(e) => setAddress1(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none"
              />
            </Field>

            <Field label="Address line 2">
              <input
                value={address2}
                onChange={(e) => setAddress2(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none"
              />
            </Field>

            <Field label="Postcode">
              <input
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none"
              />
            </Field>

            <Field label="City">
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-[#0E2E57] p-2 outline-none"
              />
            </Field>

            <Field label="Tank option" className="md:col-span-2">
              <div className="flex flex-wrap gap-3">
                {(["none", "buy", "rent"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setTankOption(opt)}
                    className={`rounded-xl border px-4 py-2 ${
                      tankOption === opt
                        ? "border-yellow-400 bg-yellow-400/10"
                        : "border-white/15 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    {opt === "none" ? "No tank" : opt.toUpperCase()}
                  </button>
                ))}
              </div>
              {tankOption === "rent" && rentStatus.exists && !rentStatus.approved && (
                <p className="mt-2 text-sm text-yellow-300">
                  Signed (awaiting admin approval). Payment will be enabled after approval.
                </p>
              )}
            </Field>
          </div>

          {/* terms + CTA */}
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 md:items-center">
            <label className="inline-flex items-center gap-3 text-sm text-white/80">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="h-4 w-4 accent-yellow-500"
              />
              <span>
                I agree to the{" "}
                <a href="/terms" target="_blank" className="underline underline-offset-4 hover:text-white">
                  Terms &amp; Conditions
                </a>
                .
              </span>
            </label>

            <div className="flex items-center justify-end gap-3">
              <button
                type="submit"
                disabled={
                  submitting ||
                  !acceptedTerms ||
                  (contractNeeded && !contractOk) ||
                  (tankOption === "rent" && !rentStatus.approved)
                }
                className={`rounded-xl px-5 py-2 font-semibold ${
                  submitting ||
                  !acceptedTerms ||
                  (contractNeeded && !contractOk) ||
                  (tankOption === "rent" && !rentStatus.approved)
                    ? "cursor-not-allowed bg-yellow-500/50 text-[#041F3E]"
                    : "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400"
                }`}
              >
                {submitting ? "Starting checkout..." : "Pay with Stripe"}
              </button>
            </div>
          </div>
        </form>

        <footer className="flex items-center justify-center py-10 text-sm text-white/60">
          © {new Date().getFullYear()} FuelFlow. All rights reserved.
        </footer>
      </section>
    </main>
  );
}

/* ---------- small components ---------- */
function Card({ title, value, suffix }: { title: string; value: string; suffix?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <h3 className="text-white/80">{title}</h3>
      <p className="mt-2 text-2xl font-bold">
        {value} {suffix ? <span className="text-base font-normal text-white/70">{suffix}</span> : null}
      </p>
    </div>
  );
}

function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm text-white/80">{label}</span>
      {children}
    </label>
  );
}

function TankPanel(props: {
  type: "buy" | "rent";
  title: string;
  bullets: string[];
  onOpenROI: () => void;
  onStartContract: () => void;
  onSelect: () => void;
  selected: boolean;
  statusBadge?: React.ReactNode;
  startDisabled?: boolean;
}) {
  const { title, bullets, onOpenROI, onStartContract, onSelect, selected, statusBadge, startDisabled } = props;
  return (
    <div className={`rounded-2xl border p-6 ${selected ? "border-yellow-400 bg-white/5" : "border-white/10 bg-white/5"}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-semibold">{title}</h3>
        <div className="flex items-center gap-3">
          {statusBadge}
          <button
            type="button"
            onClick={onSelect}
            className={`rounded-xl px-3 py-1 text-sm ${
              selected ? "bg-yellow-400 text-[#041F3E]" : "border border-white/20 bg-white/10"
            }`}
          >
            {selected ? "Selected" : "Select"}
          </button>
        </div>
      </div>

      <ul className="mt-4 space-y-2 text-white/80">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2">
            <span>✔</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onOpenROI}
          className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 hover:bg-white/15"
        >
          Open ROI
        </button>
        <button
          type="button"
          onClick={startDisabled ? undefined : onStartContract}
          disabled={!!startDisabled}
          className={`rounded-xl px-4 py-2 font-semibold ${
            startDisabled
              ? "bg-white/10 text-white/40 cursor-not-allowed border border-white/15"
              : "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400"
          }`}
        >
          {startDisabled ? "Contract in place" : "Start Contract"}
        </button>
      </div>
    </div>
  );
}
