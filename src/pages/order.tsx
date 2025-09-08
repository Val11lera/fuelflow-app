// src/pages/order.tsx
// src/pages/order.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

/* --------------------------------- Types --------------------------------- */

type Fuel = "diesel" | "petrol";
type TankOption = "buy" | "rent";

type ContractRow = {
  id: string;
  email: string | null;
  status: "draft" | "signed" | "approved" | "cancelled";
  tank_option: "buy" | "rent";
  created_at: string;
};

type LatestPriceRow = {
  fuel: Fuel;
  total_price: number; // GBP per litre
  updated_at?: string | null;
};

/* ------------------------------ Supabase client --------------------------- */

const supabase =
  typeof window !== "undefined"
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || "",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
      )
    : (null as any);

/* --------------------------------- Utils --------------------------------- */

const termsVersion = "v1.1";
const STORAGE_KEY = "order:form:v1";

const GBP = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n);

/* --------------------------------- Page ---------------------------------- */

export default function OrderPage() {
  const qp = useSearchParams();

  // Auth + identity
  const [userEmail, setUserEmail] = useState<string>("");

  // Prices
  const [petrolPrice, setPetrolPrice] = useState<number | null>(null);
  const [dieselPrice, setDieselPrice] = useState<number | null>(null);
  const [priceStamp, setPriceStamp] = useState<string | null>(null);

  // Form
  const [fuel, setFuel] = useState<Fuel>("diesel");
  const [litres, setLitres] = useState<number>(1000);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [postcode, setPostcode] = useState("");
  const [city, setCity] = useState("");

  // Terms
  const [accepted, setAccepted] = useState(false);
  const [checkingTerms, setCheckingTerms] = useState(false);

  // Contracts state
  const [activeBuy, setActiveBuy] = useState(false);   // signed OR approved
  const [activeRent, setActiveRent] = useState(false); // approved only

  // Contract modal / ROI
  const [showROI, setShowROI] = useState(false);
  const [tankOption, setTankOption] = useState<TankOption>("buy");
  const [showContract, setShowContract] = useState(false);
  const [signatureName, setSignatureName] = useState("");
  const [savingContract, setSavingContract] = useState(false);
  const [contractSavedId, setContractSavedId] = useState<string | null>(null);

  // ROI inputs
  const [tankSizeL, setTankSizeL] = useState<number>(5000);
  const [monthlyConsumptionL, setMonthlyConsumptionL] = useState<number>(10000);
  const [marketPrice, setMarketPrice] = useState<number>(1.35);
  const [cheaperBy, setCheaperBy] = useState<number>(0.09);

  // Checkout
  const [startingCheckout, setStartingCheckout] = useState(false);

  /* --------------------------- Load auth + prices -------------------------- */

  useEffect(() => {
    (async () => {
      // auth
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        window.location.href = "/login";
        return;
      }
      const lower = (auth.user.email || "").toLowerCase();
      setUserEmail(lower);
      if (!email) setEmail(lower);

      // prices: prefer latest_prices, fallback to latest_daily_prices
      const trySources = ["latest_prices", "latest_daily_prices"] as const;
      let got = false;
      for (const src of trySources) {
        const { data, error } = await supabase
          .from(src)
          .select("fuel,total_price,updated_at")
          .limit(2);

        if (!error && data && data.length) {
          (data as LatestPriceRow[]).forEach((r) => {
            if (r.fuel === "petrol") setPetrolPrice(Number(r.total_price));
            if (r.fuel === "diesel") setDieselPrice(Number(r.total_price));
            if (r.updated_at && !priceStamp) setPriceStamp(r.updated_at);
          });
          got = true;
          break;
        }
      }
      if (!got) {
        setPetrolPrice(null);
        setDieselPrice(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ----------------------------- Persist form ----------------------------- */

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const v = JSON.parse(raw);
        if (v.fuel) setFuel(v.fuel);
        if (Number.isFinite(v.litres)) setLitres(v.litres);
        if (v.deliveryDate) setDeliveryDate(v.deliveryDate);
        if (v.email) setEmail(v.email);
        if (v.fullName) setFullName(v.fullName);
        if (v.address1) setAddress1(v.address1);
        if (v.address2) setAddress2(v.address2);
        if (v.postcode) setPostcode(v.postcode);
        if (v.city) setCity(v.city);
      }
    } catch {}
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          fuel,
          litres,
          deliveryDate,
          email,
          fullName,
          address1,
          address2,
          postcode,
          city,
        })
      );
    } catch {}
  }, [fuel, litres, deliveryDate, email, fullName, address1, address2, postcode, city]);

  /* ------------------------ Terms: accept + remember ----------------------- */

  useEffect(() => {
    const acceptedParam = qp.get("accepted");
    const emailParam = qp.get("email");
    if (emailParam && !email) setEmail(emailParam);
    if (acceptedParam === "1" && emailParam) {
      localStorage.setItem(`terms:${termsVersion}:${emailParam}`, "1");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qp]);

  useEffect(() => {
    if (!email) return;
    (async () => {
      setCheckingTerms(true);
      try {
        const cached = localStorage.getItem(`terms:${termsVersion}:${email}`);
        if (cached === "1") {
          setAccepted(true);
          return;
        }
        const { data } = await supabase
          .from("terms_acceptances")
          .select("id,email,accepted_at,version")
          .eq("email", email.toLowerCase())
          .eq("version", termsVersion)
          .order("accepted_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (data) {
          setAccepted(true);
          localStorage.setItem(`terms:${termsVersion}:${email}`, "1");
        }
      } finally {
        setCheckingTerms(false);
      }
    })();
  }, [email]);

  function openTerms() {
    const ret = `/terms?return=/order${email ? `&email=${encodeURIComponent(email)}` : ""}`;
    window.location.href = ret;
  }

  /* ---------------------- Contracts: active status check ------------------- */

  useEffect(() => {
    if (!supabase || !email) {
      setActiveBuy(false);
      setActiveRent(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("contracts")
        .select("tank_option,status")
        .eq("email", email.toLowerCase());

      const rows = (data ?? []) as ContractRow[];

      // BUY: signed OR approved is fine
      const buyActive = rows.some(
        (r) => r.tank_option === "buy" && (r.status === "signed" || r.status === "approved")
      );
      // RENT: must be approved
      const rentActive = rows.some((r) => r.tank_option === "rent" && r.status === "approved");

      setActiveBuy(buyActive);
      setActiveRent(rentActive);
    })();
  }, [email, showContract, contractSavedId]);

  /* -------------------------- ROI derived metrics ------------------------- */

  const fuelflowPrice = useMemo(
    () => Math.max(0, (marketPrice || 0) - (cheaperBy || 0)),
    [marketPrice, cheaperBy]
  );
  const estMonthlySavings = useMemo(
    () => Math.max(0, (monthlyConsumptionL || 0) * (cheaperBy || 0)),
    [monthlyConsumptionL, cheaperBy]
  );
  const capexRequired = useMemo(() => (tankOption === "buy" ? 12000 : 0), [tankOption]);

  /* ------------------------------ Estimation ------------------------------ */

  const unitPriceSelected =
    fuel === "diesel"
      ? dieselPrice ?? null
      : petrolPrice ?? null;

  const estTotal =
    unitPriceSelected != null && Number.isFinite(litres) ? litres * unitPriceSelected : 0;

  /* --------------------------- Contract creation -------------------------- */

  function openRoi() {
    setShowROI(true);
  }
  function openContract() {
    setShowContract(true);
  }

  async function signAndSaveContract() {
    if (!fullName.trim()) {
      alert("Please enter your full name above the form before signing.");
      return;
    }
    if (!signatureName.trim()) {
      alert("Type your full legal name as signature in the contract dialog.");
      return;
    }
    try {
      setSavingContract(true);
      setContractSavedId(null);

      const payload = {
        contract_type: tankOption, // kept for legacy
        tank_option: tankOption,
        customer_name: fullName,
        email: email || null,
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
        est_payback_months: capexRequired && fuelflowPrice > 0
          ? Math.max(0, (capexRequired / Math.max(1, estMonthlySavings)) * 1.0)
          : null,
        terms_version: termsVersion,
        signature_name: signatureName,
        signed_at: new Date().toISOString(),
        status: "signed" as const,
      };

      const { data, error } = await supabase
        .from("contracts")
        .insert(payload)
        .select("id")
        .single();

      if (error) throw error;
      setContractSavedId(data?.id ?? null);
      setShowContract(false);
    } catch (e: any) {
      alert(e?.message || "Failed to save contract.");
    } finally {
      setSavingContract(false);
    }
  }

  /* -------------------------------- Checkout ------------------------------ */

  const contractOkay = activeBuy || activeRent; // rent only becomes active if approved
  const requirementsOkay = accepted && contractOkay;

  const payDisabled =
    !requirementsOkay ||
    !email ||
    !fullName ||
    !address1 ||
    !postcode ||
    !city ||
    !deliveryDate ||
    !Number.isFinite(litres) ||
    litres <= 0;

  async function startCheckout() {
    try {
      if (!requirementsOkay) {
        alert("Complete the requirements first (Terms + active contract).");
        return;
      }
      setStartingCheckout(true);
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
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `Checkout failed (${res.status})`);
      }
      const data = (await res.json()) as { url?: string; error?: string };
      if (!data.url) throw new Error(data.error || "No checkout URL returned");
      window.location.href = data.url;
    } catch (e: any) {
      alert(e?.message || "Failed to create order");
    } finally {
      setStartingCheckout(false);
    }
  }

  /* ---------------------------------- UI ---------------------------------- */

  return (
    <main className="min-h-screen bg-[#061B34] text-white pb-20">
      <div className="mx-auto w-full max-w-6xl px-4 pt-10 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo-email.png" alt="FuelFlow" width={116} height={28} className="opacity-90" />
            <h1 className="text-3xl font-bold">Place an Order</h1>
          </div>
          <Link href="/client-dashboard" className="text-white/70 hover:text-white">
            Back to Dashboard
          </Link>
        </div>

        {/* Requirements */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Terms */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 relative">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Terms &amp; Conditions</h3>
              <span
                className={`text-xs px-2 py-1 rounded-full ${
                  accepted ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"
                }`}
              >
                {accepted ? "ok" : "missing"}
              </span>
            </div>
            <p className="mt-2 text-white/70 text-sm">
              You must read and accept the latest Terms before ordering.
            </p>
            <button
              onClick={openTerms}
              className="mt-3 rounded-2xl px-4 py-2 bg-white/10 hover:bg-white/15 border border-white/10"
            >
              Read &amp; accept Terms
            </button>
            {!accepted && checkingTerms && (
              <div className="mt-2 text-xs text-white/60">Checking acceptance…</div>
            )}
          </div>

          {/* Contract */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 relative">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Contract</h3>
              <span className="text-xs px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-300">required</span>
            </div>
            <p className="mt-2 text-white/70 text-sm">
              <b>Buy</b>: signed contract is enough. <b>Rent</b>: requires admin approval after signing.
            </p>

            <div className="mt-3 flex flex-wrap gap-3">
              <button
                className="rounded-2xl px-4 py-2 bg-white/10 hover:bg-white/15 border border-white/10"
                onClick={() => setShowROI(true)}
              >
                ROI / Calculator
              </button>
              <button
                className="rounded-2xl px-4 py-2 font-semibold bg-yellow-500 text-[#041F3E] hover:bg-yellow-400"
                onClick={openContract}
              >
                Start Contract
              </button>
            </div>

            <div className="mt-3 text-xs text-white/70">
              Buy: {activeBuy ? <b className="text-green-300">active</b> : "—"} ·{" "}
              Rent: {activeRent ? <b className="text-green-300">active</b> : "—"}
            </div>
          </div>
        </div>

        {/* Prices */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Tile title="Petrol (95)" value={`${GBP(petrolPrice)} `} suffix="/ litre" />
          <Tile title="Diesel" value={`${GBP(dieselPrice)} `} suffix="/ litre" />
          <Tile title="Estimated Total" value={GBP(estTotal)} />
        </div>
        <div className="text-xs text-white/50">
          {priceStamp ? `Prices last updated: ${new Date(priceStamp).toLocaleString()}` : "Prices timestamp unavailable."}
        </div>

        {/* Order form */}
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          {!requirementsOkay && (
            <div className="mb-4 text-center text-yellow-300 text-sm">
              Complete the requirements first:
              <br />
              • Accept the Terms &nbsp;• Sign a Buy contract (or Rent and wait for approval)
            </div>
          )}

          <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${!requirementsOkay ? "opacity-60" : ""}`}>
            <div>
              <Label>Fuel</Label>
              <select
                className={input}
                value={fuel}
                onChange={(e) => setFuel(e.target.value as Fuel)}
                disabled={!requirementsOkay}
              >
                <option value="diesel">Diesel</option>
                <option value="petrol">Petrol</option>
              </select>
            </div>

            <div>
              <Label>Litres</Label>
              <input
                className={input}
                type="number"
                min={1}
                value={litres}
                onChange={(e) => setLitres(Number(e.target.value))}
                disabled={!requirementsOkay}
              />
            </div>

            <div>
              <Label>Delivery date</Label>
              <input
                className={input}
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                disabled={!requirementsOkay}
              />
            </div>

            <div>
              <Label>Your email (receipt)</Label>
              <input
                className={input}
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!requirementsOkay}
              />
            </div>

            <div className="md:col-span-2">
              <Label>Full name</Label>
              <input
                className={input}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={!requirementsOkay}
              />
            </div>

            <div>
              <Label>Address line 1</Label>
              <input
                className={input}
                value={address1}
                onChange={(e) => setAddress1(e.target.value)}
                disabled={!requirementsOkay}
              />
            </div>

            <div>
              <Label>Address line 2</Label>
              <input
                className={input}
                value={address2}
                onChange={(e) => setAddress2(e.target.value)}
                disabled={!requirementsOkay}
              />
            </div>

            <div>
              <Label>Postcode</Label>
              <input
                className={input}
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                disabled={!requirementsOkay}
              />
            </div>

            <div>
              <Label>City</Label>
              <input
                className={input}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                disabled={!requirementsOkay}
              />
            </div>

            <div className="md:col-span-2">
              <button
                className={`rounded-2xl px-4 py-2 font-semibold w-full md:w-auto ${
                  payDisabled
                    ? "bg-yellow-500/60 cursor-not-allowed text-[#041F3E]"
                    : "bg-yellow-500 hover:bg-yellow-400 text-[#041F3E]"
                }`}
                disabled={payDisabled || startingCheckout}
                onClick={startCheckout}
              >
                {startingCheckout ? "Starting checkout…" : "Pay with Stripe"}
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* ROI modal */}
      {showROI && (
        <Modal onClose={() => setShowROI(false)} title="ROI / Calculator">
          <EstimateBanner />
          <div className="flex gap-2 mb-3">
            <button
              className={`px-3 py-1.5 rounded-lg text-sm ${
                tankOption === "buy" ? "bg-yellow-500 text-[#041F3E]" : "bg-white/10"
              }`}
              onClick={() => setTankOption("buy")}
            >
              Buy
            </button>
            <button
              className={`px-3 py-1.5 rounded-lg text-sm ${
                tankOption === "rent" ? "bg-yellow-500 text-[#041F3E]" : "bg-white/10"
              }`}
              onClick={() => setTankOption("rent")}
            >
              Rent
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Metric title="FuelFlow price" value={`${GBP(fuelflowPrice)} / L`} />
            <Metric title="Est. monthly savings" value={GBP(estMonthlySavings)} />
            <Metric title="Capex required" value={tankOption === "rent" ? "£0 (rental)" : GBP(capexRequired)} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Tank size (L)</Label>
              <input
                className={input}
                type="number"
                min={0}
                value={tankSizeL}
                onChange={(e) => setTankSizeL(Number(e.target.value))}
              />
            </div>
            <div>
              <Label>Monthly consumption (L)</Label>
              <input
                className={input}
                type="number"
                min={0}
                value={monthlyConsumptionL}
                onChange={(e) => setMonthlyConsumptionL(Number(e.target.value))}
              />
            </div>
            <div>
              <Label>Market price (GBP/L)</Label>
              <input
                className={input}
                type="number"
                min={0}
                step="0.01"
                value={marketPrice}
                onChange={(e) => setMarketPrice(Number(e.target.value))}
              />
            </div>
            <div>
              <Label>FuelFlow cheaper by (GBP/L)</Label>
              <input
                className={input}
                type="number"
                min={0}
                step="0.01"
                value={cheaperBy}
                onChange={(e) => setCheaperBy(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button className="rounded-2xl px-4 py-2 bg-white/10 hover:bg-white/15 border border-white/10" onClick={() => setShowROI(false)}>
              Close
            </button>
            <button
              className="rounded-2xl px-4 py-2 font-semibold bg-yellow-500 text-[#041F3E] hover:bg-yellow-400"
              onClick={() => {
                setShowROI(false);
                setShowContract(true);
              }}
            >
              Continue to Contract
            </button>
          </div>
        </Modal>
      )}

      {/* Contract modal */}
      {showContract && (
        <Modal
          onClose={() => {
            if (!savingContract) setShowContract(false);
          }}
          title={`Start ${tankOption === "buy" ? "Purchase" : "Rental"} Contract`}
        >
          <EstimateBanner />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Metric title="FuelFlow price" value={`${GBP(fuelflowPrice)} / L`} />
            <Metric title="Est. monthly savings" value={GBP(estMonthlySavings)} />
            <Metric title="Capex required" value={tankOption === "rent" ? "£0 (rental)" : GBP(capexRequired)} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Tank size (L)</Label>
              <input
                className={input}
                type="number"
                min={0}
                value={tankSizeL}
                onChange={(e) => setTankSizeL(Number(e.target.value))}
              />
            </div>
            <div>
              <Label>Monthly consumption (L)</Label>
              <input
                className={input}
                type="number"
                min={0}
                value={monthlyConsumptionL}
                onChange={(e) => setMonthlyConsumptionL(Number(e.target.value))}
              />
            </div>
            <div>
              <Label>Market price (GBP/L)</Label>
              <input
                className={input}
                type="number"
                min={0}
                step="0.01"
                value={marketPrice}
                onChange={(e) => setMarketPrice(Number(e.target.value))}
              />
            </div>
            <div>
              <Label>FuelFlow cheaper by (GBP/L)</Label>
              <input
                className={input}
                type="number"
                min={0}
                step="0.01"
                value={cheaperBy}
                onChange={(e) => setCheaperBy(Number(e.target.value))}
              />
            </div>

            <div className="md:col-span-2">
              <Label>Type your full legal name as signature</Label>
              <input
                className={input}
                placeholder="Jane Smith"
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              className="rounded-2xl px-4 py-2 bg-white/10 hover:bg-white/15 border border-white/10"
              disabled={savingContract}
              onClick={() => setShowContract(false)}
            >
              Cancel
            </button>
            <button
              className="rounded-2xl px-4 py-2 font-semibold bg-yellow-500 text-[#041F3E] hover:bg-yellow-400"
              disabled={savingContract}
              onClick={signAndSaveContract}
            >
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

/* ---------------------------- Tiny UI helpers ---------------------------- */

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

const input =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none focus:ring focus:ring-yellow-500/30";
const Label = ({ children }: { children: React.ReactNode }) => (
  <label className="block text-sm font-medium text-white/80 mb-1">{children}</label>
);

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
