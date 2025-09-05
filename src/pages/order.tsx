// src/pages/order.tsx
// src/pages/order.tsx
// src/pages/order.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

/** Types */
type TankOption = "none" | "buy" | "rent";
type Fuel = "diesel" | "petrol";
type PriceRow = { fuel: Fuel; total_price: number };

/** Supabase (browser) */
const supabase =
  typeof window !== "undefined"
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || "",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
      )
    : (null as any);

/** UI tokens */
const card = "rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-5 py-4 shadow transition";
const cardSelected = "ring-2 ring-yellow-400 border-yellow-400 bg-white/10";
const pill = "inline-flex items-center text-xs font-medium px-2 py-1 rounded-full";
const button = "rounded-2xl px-4 py-2 font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed";
const buttonPrimary = "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400 active:bg-yellow-300";
const buttonGhost = "bg-white/10 hover:bg-white/15 text-white border border-white/10";
const input = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none focus:ring focus:ring-yellow-500/30";
const label = "block text-sm font-medium text-white/80 mb-1";

/** helpers */
function GBP(n: number) {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
}
const TERMS_VERSION = "v1.1";
const FORM_CACHE_KEY = "order:form:v1";
const TERMS_CACHE = (email: string) => `terms:${TERMS_VERSION}:${email.toLowerCase()}`;

export default function OrderPage() {
  const qp = useSearchParams();

  // live price tiles
  const [unitPricePetrol, setUnitPricePetrol] = useState<number | null>(null);
  const [unitPriceDiesel, setUnitPriceDiesel] = useState<number | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);

  // order form
  const [fuel, setFuel] = useState<Fuel>("diesel");
  const [litres, setLitres] = useState<number>(1000);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [postcode, setPostcode] = useState("");
  const [city, setCity] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");

  // terms
  const [accepted, setAccepted] = useState(false);
  const [checkingTerms, setCheckingTerms] = useState(false);
  const [acceptedAt, setAcceptedAt] = useState<string | null>(null);

  // contract
  const [tankOption, setTankOption] = useState<TankOption>("rent");
  const [showContract, setShowContract] = useState(false);
  const [savingContract, setSavingContract] = useState(false);
  const [contractSavedId, setContractSavedId] = useState<string | null>(null);
  const [signature, setSignature] = useState("");
  const [activeBuy, setActiveBuy] = useState(false);
  const [activeRent, setActiveRent] = useState(false);
  const [contractError, setContractError] = useState<string | null>(null);

  // estimates (in-modal calculators)
  const [tankSizeL, setTankSizeL] = useState<number>(5000);
  const [monthlyConsumptionL, setMonthlyConsumptionL] = useState<number>(10000);
  const [marketPrice, setMarketPrice] = useState<number>(1.35);
  const [cheaperBy, setCheaperBy] = useState<number>(0.09);

  const fuelflowPrice = useMemo(
    () => Math.max(0, (marketPrice || 0) - (cheaperBy || 0)),
    [marketPrice, cheaperBy]
  );
  const estMonthlySavings = useMemo(
    () => Math.max(0, (monthlyConsumptionL || 0) * (cheaperBy || 0)),
    [monthlyConsumptionL, cheaperBy]
  );
  const capexRequired = useMemo(() => (tankOption === "buy" ? 12000 : 0), [tankOption]);

  // derived
  const unitPrice =
    fuel === "diesel"
      ? (unitPriceDiesel ?? 0)
      : (unitPricePetrol ?? 0);
  const estTotal = useMemo(
    () => (Number.isFinite(litres) ? litres * (unitPrice || 0) : 0),
    [litres, unitPrice]
  );

  /** ---------- 1) restore form and query params ---------- */
  useEffect(() => {
    // restore cached form (so redirect back from /terms keeps data)
    try {
      const raw = localStorage.getItem(FORM_CACHE_KEY);
      if (raw) {
        const v = JSON.parse(raw);
        if (v.fuel) setFuel(v.fuel);
        if (Number.isFinite(v.litres)) setLitres(Number(v.litres));
        if (v.email) setEmail(v.email);
        if (v.fullName) setFullName(v.fullName);
        if (v.address1) setAddress1(v.address1);
        if (v.address2) setAddress2(v.address2);
        if (v.postcode) setPostcode(v.postcode);
        if (v.city) setCity(v.city);
        if (v.deliveryDate) setDeliveryDate(v.deliveryDate);
      }
    } catch {}
    // apply ?accepted=1&email=...
    const acceptedParam = qp.get("accepted");
    const emailParam = qp.get("email");
    if (emailParam) setEmail(emailParam);
    if (acceptedParam === "1" && emailParam) {
      localStorage.setItem(TERMS_CACHE(emailParam), "1");
      setAccepted(true);
      setAcceptedAt(new Date().toISOString());
    }
  }, []); // run once

  /** cache the form on each change */
  useEffect(() => {
    try {
      localStorage.setItem(
        FORM_CACHE_KEY,
        JSON.stringify({
          fuel,
          litres,
          email,
          fullName,
          address1,
          address2,
          postcode,
          city,
          deliveryDate,
        })
      );
    } catch {}
  }, [fuel, litres, email, fullName, address1, address2, postcode, city, deliveryDate]);

  /** ---------- 2) fetch live prices ---------- */
  useEffect(() => {
    (async () => {
      if (!supabase) return;
      setPriceError(null);
      // latest_prices is our unified view (fuel,total_price). Fallback to latest_daily_prices.
      let { data, error } = await supabase
        .from("latest_prices")
        .select("fuel,total_price");
      if (!data || error) {
        const fb = await supabase
          .from("latest_daily_prices")
          .select("fuel,total_price");
        data = fb.data as any;
        error = fb.error as any;
      }
      if (!data || error) {
        setPriceError("Price load error — check latest_prices / latest_daily_prices views.");
        return;
      }
      (data as PriceRow[]).forEach((r) => {
        if (r.fuel === "petrol") setUnitPricePetrol(Number(r.total_price));
        if (r.fuel === "diesel") setUnitPriceDiesel(Number(r.total_price));
      });
    })();
  }, []);

  /** ---------- 3) term acceptance check (server) ---------- */
  useEffect(() => {
    (async () => {
      if (!email || !supabase) return;
      setCheckingTerms(true);
      try {
        // quick local cache first
        if (localStorage.getItem(TERMS_CACHE(email)) === "1") {
          setAccepted(true);
        }
        const { data, error } = await supabase
          .from("terms_acceptances")
          .select("accepted_at")
          .eq("email", email.toLowerCase())
          .eq("version", TERMS_VERSION)
          .order("accepted_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!error && data) {
          setAccepted(true);
          setAcceptedAt(data.accepted_at);
          localStorage.setItem(TERMS_CACHE(email), "1");
        }
      } finally {
        setCheckingTerms(false);
      }
    })();
  }, [email]);

  /** ---------- 4) active contracts (to disable Start Contract) ---------- */
  useEffect(() => {
    (async () => {
      if (!email || !supabase) return;
      const { data } = await supabase
        .from("contracts")
        .select("id,tank_option,status")
        .eq("email", email.toLowerCase())
        .in("status", ["signed", "approved"]);
      setActiveBuy(Boolean(data?.some((r) => r.tank_option === "buy")));
      setActiveRent(Boolean(data?.some((r) => r.tank_option === "rent")));
    })();
  }, [email, showContract, contractSavedId]);

  /** redirect to terms preserving email + a return path */
  function openTerms() {
    const url = `/terms?return=/order&email=${encodeURIComponent(email || "")}`;
    window.location.href = url;
  }

  /** start contract modal */
  function openContractWith(type: TankOption) {
    setTankOption(type);
    setShowContract(true);
    setContractError(null);
  }

  /** save contract (sign) */
  async function saveContractSigned() {
    try {
      setSavingContract(true);
      setContractError(null);

      if (!supabase) throw new Error("Supabase not ready");
      if (!fullName.trim() || !email.trim()) {
        alert("Please enter your full name and email in the form above the contract.");
        return;
      }
      if (!signature.trim()) {
        alert("Please type your full legal name as signature in the contract modal.");
        return;
      }
      // prevent duplicates
      const existing = await supabase
        .from("contracts")
        .select("id")
        .eq("email", email.toLowerCase())
        .eq("tank_option", tankOption)
        .in("status", ["signed", "approved"])
        .limit(1);
      if (existing.data && existing.data.length) {
        setContractError("You already have an active contract for this option.");
        return;
      }

      const { data, error } = await supabase
        .from("contracts")
        .insert({
          contract_type: tankOption === "buy" ? "buy" : "rent",
          tank_option: tankOption,
          customer_name: fullName, // NOT NULL friendly
          email: email.toLowerCase(),
          address_line1: address1 || null,
          address_line2: address2 || null,
          city: city || null,
          postcode: postcode || null,
          tank_size_l: tankSizeL || null,
          monthly_consumption_l: monthlyConsumptionL || null,
          market_price_gbp_l: marketPrice || null,
          cheaper_by_gbp_l: cheaperBy || null,
          fuelflow_price_gbp_l: fuelflowPrice || null,
          est_monthly_savings_gbp: estMonthlySavings || null,
          capex_required_gbp: capexRequired || null,
          terms_version: TERMS_VERSION,
          signature_name: signature,
          status: "signed",
        })
        .select("id")
        .single();

      if (error) throw error;
      setContractSavedId(data.id);
      setShowContract(false);
      // refresh active flags
      setActiveBuy((p) => p || tankOption === "buy");
      setActiveRent((p) => p || tankOption === "rent");
    } catch (e: any) {
      setContractError(e?.message || "Failed to save contract.");
      alert(e?.message || "Failed to save contract.");
    } finally {
      setSavingContract(false);
    }
  }

  /** Stripe */
  const payingRef = useRef(false);
  async function startCheckout() {
    if (payingRef.current) return;
    payingRef.current = true;
    try {
      if (!accepted) {
        alert("Please accept the Terms & Conditions first.");
        return;
      }
      if (!email || !fullName || !address1 || !postcode || !city || !deliveryDate) {
        alert("Please complete all required fields.");
        return;
      }
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
          address_line2: address2 || "",
          city,
          postcode,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Failed to create order");
      }
      if (json?.url) {
        window.location.href = json.url as string;
      } else {
        throw new Error("No checkout URL returned.");
      }
    } catch (e: any) {
      alert(e?.message || "Failed to create order");
    } finally {
      payingRef.current = false;
    }
  }

  // disabled if anything is missing
  const payDisabled =
    !email ||
    !fullName ||
    !address1 ||
    !postcode ||
    !city ||
    !deliveryDate ||
    !Number.isFinite(litres) ||
    litres <= 0 ||
    !accepted;

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

        {/* Buy vs Rent */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* BUY */}
          <div className={`${card} ${tankOption === "buy" ? cardSelected : ""} ${activeBuy ? "opacity-60" : ""}`}>
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Buy a Fuel Tank</h3>
              {activeBuy ? (
                <span className={`${pill} bg-green-500/20 text-green-300`}>Contract active</span>
              ) : tankOption === "buy" ? (
                <span className={`${pill} bg-yellow-500/20 text-yellow-300`}>Selected</span>
              ) : (
                <button className={`${pill} ${buttonGhost} border-none`} onClick={() => setTankOption("buy")}>
                  Select
                </button>
              )}
            </div>
            <ul className="mt-3 space-y-2 text-white/70 text-sm">
              <li>✔ One-time cost with full ownership.</li>
              <li>✔ Variety of sizes and specifications.</li>
              <li>✔ Best for long-term sites and high-volume usage.</li>
            </ul>
            <div className="mt-4 flex gap-3">
              <button className={`${button} ${buttonGhost}`} disabled={activeBuy} onClick={() => openContractWith("buy")}>
                Start Contract
              </button>
            </div>
          </div>

          {/* RENT */}
          <div className={`${card} ${tankOption === "rent" ? cardSelected : ""} ${activeRent ? "opacity-60" : ""}`}>
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Rent a Fuel Tank</h3>
              {activeRent ? (
                <span className={`${pill} bg-green-500/20 text-green-300`}>Contract active</span>
              ) : tankOption === "rent" ? (
                <span className={`${pill} bg-yellow-500/20 text-yellow-300`}>Selected</span>
              ) : (
                <button className={`${pill} ${buttonGhost} border-none`} onClick={() => setTankOption("rent")}>
                  Select
                </button>
              )}
            </div>
            <ul className="mt-3 space-y-2 text-white/70 text-sm">
              <li>✔ Flexible rental plans (short &amp; long term).</li>
              <li>✔ Maintenance and support included.</li>
              <li>✔ Ideal for temp sites and events.</li>
            </ul>
            <div className="mt-4 flex gap-3">
              <button className={`${button} ${buttonGhost}`} disabled={activeRent} onClick={() => openContractWith("rent")}>
                Start Contract
              </button>
            </div>
          </div>
        </div>

        {/* live prices */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Tile title="Petrol (95)" value={unitPricePetrol != null ? GBP(unitPricePetrol) : "—"} suffix="/ litre" />
          <Tile title="Diesel" value={unitPriceDiesel != null ? GBP(unitPriceDiesel) : "—"} suffix="/ litre" />
          <Tile title="Estimated Total" value={GBP(estTotal)} />
        </div>
        {priceError && <p className="text-red-300 mb-4 text-sm">{priceError}</p>}

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
              <input className={input} type="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
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
              <label className={label}>Postcode</label>
              <input className={input} value={postcode} onChange={(e) => setPostcode(e.target.value)} />
            </div>

            <div>
              <label className={label}>City</label>
              <input className={input} value={city} onChange={(e) => setCity(e.target.value)} />
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
            {accepted && (
              <p className="md:col-span-2 text-xs text-green-300">
                Terms accepted {acceptedAt ? new Date(acceptedAt).toLocaleString() : ""} (version {TERMS_VERSION})
              </p>
            )}

            {/* pay */}
            <div className="md:col-span-2 mt-3">
              <button className={`${button} ${buttonPrimary} w-full md:w-auto`} disabled={payDisabled} onClick={startCheckout}>
                Pay with Stripe
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Contract modal */}
      {showContract && (
        <Modal onClose={() => setShowContract(false)} title={`Start ${tankOption === "buy" ? "Purchase" : "Rental"} Contract`}>
          <EstimateBanner />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-4">
            <Metric title="FuelFlow price" value={`${GBP(fuelflowPrice)} / L`} />
            <Metric title="Est. monthly savings" value={GBP(estMonthlySavings)} />
            <Metric title="Capex required" value={capexRequired ? GBP(capexRequired) : "£0 (rental)"} />
          </div>

          {/* calculator + signature */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={label}>Tank size (L)</label>
              <input className={input} type="number" min={0} value={tankSizeL} onChange={(e) => setTankSizeL(Number(e.target.value))} />
            </div>
            <div>
              <label className={label}>Monthly consumption (L)</label>
              <input className={input} type="number" min={0} value={monthlyConsumptionL} onChange={(e) => setMonthlyConsumptionL(Number(e.target.value))} />
            </div>
            <div>
              <label className={label}>Market price (GBP/L)</label>
              <input className={input} type="number" min={0} step="0.01" value={marketPrice} onChange={(e) => setMarketPrice(Number(e.target.value))} />
            </div>
            <div>
              <label className={label}>FuelFlow cheaper by (GBP/L)</label>
              <input className={input} type="number" min={0} step="0.01" value={cheaperBy} onChange={(e) => setCheaperBy(Number(e.target.value))} />
            </div>
            <div className="md:col-span-2">
              <label className={label}>Type your full legal name as signature</label>
              <input className={input} value={signature} onChange={(e) => setSignature(e.target.value)} placeholder={fullName || "Full name"} />
            </div>
          </div>

          {contractError && <p className="text-red-300 mt-3 text-sm">{contractError}</p>}

          <div className="mt-6 flex justify-end gap-3">
            <button className={`${button} ${buttonGhost}`} onClick={() => setShowContract(false)}>
              Cancel
            </button>
            <button className={`${button} ${buttonPrimary}`} disabled={savingContract} onClick={saveContractSigned}>
              {savingContract ? "Saving…" : "Sign & Save"}
            </button>
          </div>
        </Modal>
      )}

      <footer className="mt-12 text-center text-white/40 text-xs">
        © {new Date().getFullYear()} FuelFlow. All rights reserved.
      </footer>
    </main>
  );
}

/* ---------------- UI helpers ---------------- */

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
function EstimateBanner() {
  return (
    <div className="relative overflow-hidden mb-3 rounded-xl border border-white/10 bg-gradient-to-r from-yellow-500/10 via-orange-500/10 to-red-500/10 p-3 text-center">
      <span className="font-semibold text-yellow-300 tracking-wide">
        ESTIMATE ONLY — prices fluctuate daily based on market conditions
      </span>
      <div className="pointer-events-none absolute inset-0 opacity-10 [background-image:repeating-linear-gradient(45deg,transparent,transparent_8px,rgba(255,255,255,.4)_8px,rgba(255,255,255,.4)_10px)]" />
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

