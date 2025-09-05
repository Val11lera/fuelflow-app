// src/pages/order.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

type Fuel = "diesel" | "petrol";
type TankOption = "buy" | "rent";

const supabase =
  typeof window !== "undefined"
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || "",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
      )
    : (null as any);

const card =
  "rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-5 py-4 shadow transition";
const cardSelected = "ring-2 ring-yellow-400 border-yellow-400 bg-white/10";
const pill = "inline-flex items-center text-xs font-medium px-2 py-1 rounded-full";
const button =
  "rounded-2xl px-4 py-2 font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed";
const buttonPrimary = "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400 active:bg-yellow-300";
const buttonGhost = "bg-white/10 hover:bg-white/15 text-white border border-white/10";
const input = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none focus:ring focus:ring-yellow-500/30";
const label = "block text-sm font-medium text-white/80 mb-1";

const TERMS_VERSION = "v1.1";

function GBP(n: number) {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export default function OrderPage() {
  // -- user-entered fields
  const [fuel, setFuel] = useState<Fuel>("diesel");
  const [litres, setLitres] = useState<number>(1000);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [city, setCity] = useState("");
  const [postcode, setPostcode] = useState("");

  // -- prices pulled from DB
  const [pricePetrol, setPricePetrol] = useState<number | null>(null);
  const [priceDiesel, setPriceDiesel] = useState<number | null>(null);

  // -- contracts
  const [selectedOption, setSelectedOption] = useState<TankOption>("buy");
  const [rentStatus, setRentStatus] = useState<"none" | "signed" | "approved">("none");
  const [buyStatus, setBuyStatus] = useState<"none" | "signed" | "approved">("none");
  const [showContract, setShowContract] = useState(false);
  const [savingContract, setSavingContract] = useState(false);
  const [contractId, setContractId] = useState<string | null>(null);

  // -- terms
  const [accepted, setAccepted] = useState(false);
  const [checkingTerms, setCheckingTerms] = useState(false);
  const [acceptanceId, setAcceptanceId] = useState<string | null>(null);

  // ROI inputs (kept simple)
  const [tankSizeL, setTankSizeL] = useState(5000);
  const [monthlyConsumptionL, setMonthlyConsumptionL] = useState(10000);
  const [marketPrice, setMarketPrice] = useState(1.35);
  const [cheaperBy, setCheaperBy] = useState(0.09);

  // computed
  const unitPrice =
    fuel === "diesel"
      ? (priceDiesel ?? 0)
      : (pricePetrol ?? 0);

  const estimateTotal = useMemo(
    () => (Number.isFinite(litres) ? litres * unitPrice : 0),
    [litres, unitPrice]
  );

  const fuelflowPrice = Math.max(0, marketPrice - cheaperBy);
  const estMonthlySavings = Math.max(0, monthlyConsumptionL * cheaperBy);
  const capexRequired = selectedOption === "buy" ? 12000 : 0;

  // ---------- effects ----------
  // fetch prices (from view latest_prices)
  useEffect(() => {
    (async () => {
      if (!supabase) return;
      const { data, error } = await supabase
        .from("latest_prices")
        .select("fuel,total_price");
      if (error) {
        console.warn("price load error:", error.message);
        return;
      }
      for (const r of data || []) {
        if (r.fuel === "petrol") setPricePetrol(Number(r.total_price));
        if (r.fuel === "diesel") setPriceDiesel(Number(r.total_price));
      }
    })();
  }, []);

  // check terms + existing contracts whenever email changes
  useEffect(() => {
    (async () => {
      if (!supabase || !email) return;

      // terms
      setCheckingTerms(true);
      try {
        const { data } = await supabase
          .from("terms_acceptances")
          .select("id,version,accepted_at")
          .eq("email", email)
          .eq("version", TERMS_VERSION)
          .order("accepted_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) {
          setAccepted(true);
          setAcceptanceId(data.id);
        } else {
          setAccepted(false);
          setAcceptanceId(null);
        }
      } finally {
        setCheckingTerms(false);
      }

      // existing contracts (signed/approved) for this email
      const { data: rows } = await supabase
        .from("contracts")
        .select("id,status,tank_option")
        .eq("email", email.toLowerCase())
        .in("status", ["signed", "approved"]);

      let rent: "none" | "signed" | "approved" = "none";
      let buy: "none" | "signed" | "approved" = "none";
      (rows || []).forEach((r: any) => {
        if (r.tank_option === "rent") rent = r.status as any;
        if (r.tank_option === "buy") buy = r.status as any;
      });
      setRentStatus(rent);
      setBuyStatus(buy);
    })();
  }, [email]);

  // ---------- helpers ----------
  function openTerms() {
    // send to your /terms page; after accept it should come back
    window.location.href = `/terms?return=/order&email=${encodeURIComponent(
      email || ""
    )}`;
  }

  async function saveContractDraft() {
    if (!supabase) return;
    setSavingContract(true);
    try {
      const { data, error } = await supabase
        .from("contracts")
        .insert({
          contract_type: selectedOption, // buy|rent
          customer_name: fullName || null,
          email: email || null,
          address_line1: address1 || null,
          address_line2: address2 || null,
          city: city || null,
          postcode: postcode || null,
          tank_option: selectedOption,
          tank_size_l: tankSizeL || null,
          monthly_consumption_l: monthlyConsumptionL || null,
          market_price_gbp_l: marketPrice || null,
          cheaper_by_gbp_l: cheaperBy || null,
          fuelflow_price_gbp_l: fuelflowPrice || null,
          est_monthly_savings_gbp: estMonthlySavings || null,
          capex_required_gbp: capexRequired || null,
          terms_version: TERMS_VERSION,
          status: "signed", // treat modal submit as "signed"
        })
        .select("id,tank_option,status")
        .single();

      if (error) throw error;
      setContractId(data.id);
      if (data.tank_option === "rent") setRentStatus("signed");
      if (data.tank_option === "buy") setBuyStatus("signed");
      alert(
        data.tank_option === "rent"
          ? "Rental contract signed. An admin must approve before you can pay."
          : "Purchase contract signed."
      );
      setShowContract(false);
    } catch (e: any) {
      alert(e?.message || "Failed to save contract.");
    } finally {
      setSavingContract(false);
    }
  }

  async function startCheckout() {
    try {
      const res = await fetch("/api/stripe/checkout/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fuel,
          litres,
          deliveryDate,
          full_name: fullName,
          email,
          address_line1: address1,
          address_line2: address2,
          city,
          postcode,
        }),
      });

      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error(json?.error || "Checkout creation failed");
      }
      if (!json?.url) throw new Error("No Checkout URL returned");
      window.location.href = json.url;
    } catch (e: any) {
      alert(JSON.stringify({ error: e?.message || String(e) }));
    }
  }

  const payDisabled =
    !email ||
    !fullName ||
    !address1 ||
    !postcode ||
    !city ||
    !deliveryDate ||
    !Number.isFinite(litres) ||
    litres <= 0 ||
    !accepted ||
    // block rent until approved
    (selectedOption === "rent" && rentStatus !== "approved");

  return (
    <main className="min-h-screen bg-[#061B34] text-white pb-20">
      <div className="mx-auto w-full max-w-6xl px-4 pt-10">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <img src="/logo-email.png" alt="FuelFlow" width={116} height={28} className="opacity-90" />
          <div className="ml-2 text-2xl md:text-3xl font-bold">Place an Order</div>
          <div className="ml-auto">
            <Link href="/client-dashboard" className="text-white/70 hover:text-white">
              Back to Dashboard
            </Link>
          </div>
        </div>

        {/* Buy vs Rent cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* BUY */}
          <div className={`${card} ${selectedOption === "buy" ? cardSelected : ""}`}>
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Buy a Fuel Tank</h3>
              {selectedOption === "buy" ? (
                <span className={`${pill} bg-yellow-500/20 text-yellow-300`}>Selected</span>
              ) : (
                <button className={`${pill} ${buttonGhost} border-none`} onClick={() => setSelectedOption("buy")}>
                  Select
                </button>
              )}
            </div>
            <ul className="mt-3 space-y-2 text-white/70 text-sm">
              <li>✔ One-time cost with full ownership.</li>
              <li>✔ Variety of sizes and specifications.</li>
              <li>✔ Best for long-term sites and high-volume usage.</li>
            </ul>
            <div className="mt-4 flex items-center gap-3">
              <button className={`${button} ${buttonGhost}`} onClick={() => alert("Open ROI (optional)")}>
                Open ROI
              </button>
              <button
                className={`${button} ${buttonPrimary}`}
                onClick={() => setShowContract(true)}
                disabled={buyStatus !== "none"}
                title={buyStatus !== "none" ? `Contract ${buyStatus}` : ""}
              >
                {buyStatus === "approved" ? "Contract approved" : buyStatus === "signed" ? "Contract signed" : "Start Contract"}
              </button>
            </div>
          </div>

          {/* RENT */}
          <div className={`${card} ${selectedOption === "rent" ? cardSelected : ""}`}>
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Rent a Fuel Tank</h3>
              {selectedOption === "rent" ? (
                <span className={`${pill} bg-yellow-500/20 text-yellow-300`}>Selected</span>
              ) : (
                <button className={`${pill} ${buttonGhost} border-none`} onClick={() => setSelectedOption("rent")}>
                  Select
                </button>
              )}
            </div>
            <ul className="mt-3 space-y-2 text-white/70 text-sm">
              <li>✔ Flexible rental plans (short &amp; long term).</li>
              <li>✔ Maintenance and support included.</li>
              <li>✔ Ideal for temp sites and events.</li>
            </ul>
            <div className="mt-4 flex items-center gap-3">
              <button className={`${button} ${buttonGhost}`} onClick={() => alert("Open ROI (optional)")}>
                Open ROI
              </button>
              <button
                className={`${button} ${buttonPrimary}`}
                onClick={() => setShowContract(true)}
                disabled={rentStatus !== "none"}
                title={rentStatus !== "none" ? `Contract ${rentStatus}` : ""}
              >
                {rentStatus === "approved" ? "Contract approved" : rentStatus === "signed" ? "Awaiting approval" : "Start Contract"}
              </button>
            </div>
            {rentStatus === "signed" && (
              <p className="mt-3 text-yellow-300 text-sm">
                Your rental contract is signed and awaiting admin approval. Payment will be enabled once approved.
              </p>
            )}
          </div>
        </div>

        {/* price tiles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Tile title="Petrol (95)" value={GBP(pricePetrol ?? 0)} suffix="/ litre" />
          <Tile title="Diesel" value={GBP(priceDiesel ?? 0)} suffix="/ litre" />
          <Tile title="Estimated Total" value={GBP(estimateTotal)} />
        </div>

        {/* order form */}
        <section className={`${card} px-5 md:px-6 py-6`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={label}>Fuel</label>
              <select className={input} value={fuel} onChange={(e) => setFuel(e.target.value as Fuel)}>
                <option value="diesel">Diesel</option>
                <option value="petrol">Petrol</option>
              </select>
            </div>

            <div>
              <label className={label}>Litres</label>
              <input className={input} type="number" min={1} value={litres} onChange={(e) => setLitres(Number(e.target.value))} />
            </div>

            <div>
              <label className={label}>Delivery date</label>
              <input className={input} type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
            </div>

            <div>
              <label className={label}>Your email (receipt)</label>
              <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            <div className="md:col-span-2">
              <label className={label}>Full name</label>
              <input className={input} value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>

            <div>
              <label className={label}>Address line 1</label>
              <input className={input} value={address1} onChange={(e) => setAddress1(e.target.value)} />
            </div>

            <div>
              <label className={label}>Address line 2</label>
              <input className={input} value={address2} onChange={(e) => setAddress2(e.target.value)} />
            </div>

            <div>
              <label className={label}>City</label>
              <input className={input} value={city} onChange={(e) => setCity(e.target.value)} />
            </div>

            <div>
              <label className={label}>Postcode</label>
              <input className={input} value={postcode} onChange={(e) => setPostcode(e.target.value)} />
            </div>

            {/* terms */}
            <div className="md:col-span-2 mt-2 flex items-center gap-2">
              <input id="terms" type="checkbox" className="h-4 w-4 accent-yellow-500" checked={accepted} readOnly />
              <label htmlFor="terms" className="text-sm">
                I agree to the{" "}
                <button type="button" onClick={openTerms} className="underline text-yellow-300 hover:text-yellow-200">
                  Terms &amp; Conditions
                </button>
                .
              </label>
            </div>
            {!accepted && (
              <p className="md:col-span-2 text-sm text-red-300">
                You must read and accept the Terms first. {checkingTerms ? "Checking…" : ""}
              </p>
            )}

            {/* pay */}
            <div className="md:col-span-2 mt-3">
              <button className={`${button} ${buttonPrimary} w-full md:w-auto`} disabled={payDisabled} onClick={startCheckout}>
                Pay with Stripe
              </button>
              {selectedOption === "rent" && rentStatus !== "approved" && (
                <p className="mt-2 text-sm text-yellow-300">
                  Payment for **Rent** is disabled until an admin approves your rental contract.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Contract modal */}
      {showContract && (
        <Modal title={`Start ${selectedOption === "buy" ? "Purchase" : "Rental"} Contract`} onClose={() => setShowContract(false)}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={label}>Tank size (L)</label>
              <input className={input} type="number" value={tankSizeL} onChange={(e) => setTankSizeL(Number(e.target.value))} />
            </div>
            <div>
              <label className={label}>Monthly consumption (L)</label>
              <input
                className={input}
                type="number"
                value={monthlyConsumptionL}
                onChange={(e) => setMonthlyConsumptionL(Number(e.target.value))}
              />
            </div>
            <div>
              <label className={label}>Market price (GBP/L)</label>
              <input className={input} type="number" step="0.01" value={marketPrice} onChange={(e) => setMarketPrice(Number(e.target.value))} />
            </div>
            <div>
              <label className={label}>FuelFlow cheaper by (GBP/L)</label>
              <input className={input} type="number" step="0.01" value={cheaperBy} onChange={(e) => setCheaperBy(Number(e.target.value))} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <Metric title="FuelFlow price" value={`${GBP(fuelflowPrice)} / L`} />
            <Metric title="Est. monthly savings" value={GBP(estMonthlySavings)} />
            <Metric title="Capex required" value={selectedOption === "buy" ? GBP(capexRequired) : "£0 (rental)"} />
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button className={`${button} ${buttonGhost}`} onClick={() => setShowContract(false)}>
              Cancel
            </button>
            <button className={`${button} ${buttonPrimary}`} onClick={saveContractDraft} disabled={savingContract}>
              {savingContract ? "Saving…" : "Sign & Save"}
            </button>
          </div>
          {contractId && <p className="mt-3 text-green-300 text-sm">Saved contract id: {contractId}</p>}
        </Modal>
      )}

      <footer className="mt-12 text-center text-white/40 text-xs">
        © {new Date().getFullYear()} FuelFlow. All rights reserved.
      </footer>
    </main>
  );
}

function Tile({ title, value, suffix }: { title: string; value: string; suffix?: string }) {
  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
      <div className="text-white/70 text-sm">{title}</div>
      <div className="mt-1 text-2xl font-semibold">
        {value} {suffix && <span className="text-white/50 text-base">{suffix}</span>}
      </div>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0E2E57] p-4">
      <div className="text-white/70 text-sm">{title}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div className="relative w-[95%] max-w-3xl rounded-2xl bg-[#0B274B] border border-white/10 p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button aria-label="Close" className="rounded-lg p-2 text-white/70 hover:bg-white/10" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}
