// src/pages/order.tsx
// src/pages/order.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

type Fuel = "diesel" | "petrol";
type TankOption = "buy" | "rent";
type ContractRow = {
  id: string;
  email: string | null;
  tank_option: TankOption;
  status: "draft" | "signed" | "approved" | "cancelled";
  created_at?: string | null;
};

const supabase =
  typeof window !== "undefined"
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || "",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
      )
    : (null as any);

/* UI tokens (page-local) */
const uiCard =
  "rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-5 py-4 shadow transition";
const uiBtn =
  "rounded-2xl px-4 py-2 font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed";
const uiBtnPrimary =
  "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400 active:bg-yellow-300";
const uiBtnGhost =
  "bg-white/10 hover:bg-white/15 text-white border border-white/10";
const uiInput =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/40 outline-none focus:ring focus:ring-yellow-500/30";
const uiLabel = "block text-sm font-medium text-white/80 mb-1";
const uiRow = "grid grid-cols-1 md:grid-cols-2 gap-4";

const termsVersion = "v1.1";
const TERMS_KEY = (email: string) => `terms:${termsVersion}:${email}`;

const GBP = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);

function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export default function OrderPage() {
  const [authEmail, setAuthEmail] = useState<string>("");

  // prices
  const [petrolPrice, setPetrolPrice] = useState<number | null>(null);
  const [dieselPrice, setDieselPrice] = useState<number | null>(null);

  // form
  const [fuel, setFuel] = useState<Fuel>("diesel");
  const [litres, setLitres] = useState<number>(1000);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [postcode, setPostcode] = useState("");
  const [city, setCity] = useState("");

  // requirements
  const [accepted, setAccepted] = useState(false);
  const [activeBuy, setActiveBuy] = useState(false);
  const [activeRent, setActiveRent] = useState(false);
  const [rentAwaitingApproval, setRentAwaitingApproval] = useState(false);

  const [startingCheckout, setStartingCheckout] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const em = (data?.user?.email || "").toLowerCase();
      if (!em) {
        window.location.href = "/login";
        return;
      }
      setAuthEmail(em);
      setEmail(em);
    })();
  }, []);

  // prices
  useEffect(() => {
    (async () => {
      try {
        let { data: lp } = await supabase.from("latest_prices").select("fuel,total_price");
        if (!lp?.length) {
          const { data: dp } = await supabase.from("latest_daily_prices").select("fuel,total_price");
          if (dp?.length) lp = dp as any;
        }
        if (lp?.length) {
          for (const r of lp as { fuel: Fuel; total_price: number }[]) {
            if (r.fuel === "petrol") setPetrolPrice(Number(r.total_price));
            if (r.fuel === "diesel") setDieselPrice(Number(r.total_price));
          }
        }
      } catch {}
    })();
  }, []);

  // requirements (terms + contracts)
  useEffect(() => {
    if (!authEmail) return;
    (async () => {
      // terms
      const cached = localStorage.getItem(TERMS_KEY(authEmail));
      if (cached === "1") {
        setAccepted(true);
      } else {
        const { data } = await supabase
          .from("terms_acceptances")
          .select("id")
          .eq("email", authEmail)
          .eq("version", termsVersion)
          .limit(1)
          .maybeSingle();
        if (data) {
          setAccepted(true);
          localStorage.setItem(TERMS_KEY(authEmail), "1");
        }
      }

      // contracts
      const { data: rows } = await supabase
        .from("contracts")
        .select("tank_option,status,created_at")
        .eq("email", authEmail)
        .order("created_at", { ascending: false });

      const list = (rows ?? []) as ContractRow[];
      const buyActive = list.some(
        (r) => r.tank_option === "buy" && (r.status === "signed" || r.status === "approved")
      );
      const rentApproved = list.some((r) => r.tank_option === "rent" && r.status === "approved");
      const rentPending = list.some((r) => r.tank_option === "rent" && r.status === "signed");

      setActiveBuy(buyActive);
      setActiveRent(rentApproved);
      setRentAwaitingApproval(rentPending && !rentApproved);
    })();
  }, [authEmail]);

  const unitPrice = fuel === "diesel" ? dieselPrice : petrolPrice;
  const estTotal = useMemo(
    () => (unitPrice != null && Number.isFinite(litres) ? litres * unitPrice : 0),
    [unitPrice, litres]
  );

  const requirementsOkay = accepted && (activeBuy || activeRent);

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
        window.location.href = "/documents";
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

  return (
    <main className="min-h-screen bg-[#061B34] text-white pb-20">
      <div className="mx-auto w-full max-w-6xl px-4 pt-8">
        <div className="mb-6 flex items-center gap-3">
          <img src="/logo-email.png" alt="FuelFlow" width={116} height={28} className="opacity-90" />
          <h1 className="ml-2 text-2xl md:text-3xl font-bold">Place an Order</h1>
          <div className="ml-auto">
            <Link href="/client-dashboard" className="text-white/70 hover:text-white">
              Back to Dashboard
            </Link>
          </div>
        </div>

        {!requirementsOkay && (
          <div className={cx(uiCard, "mb-6 border-yellow-500/30 bg-yellow-500/10")}>
            <div className="text-yellow-300 font-medium">Complete requirements</div>
            <p className="text-sm text-yellow-200/90 mt-1">
              You need to accept the Terms and have an active contract before ordering.
              {rentAwaitingApproval && " Your rent contract is signed and awaiting approval."}
            </p>
            <Link href="/documents" className={cx(uiBtn, uiBtnPrimary, "mt-3 inline-block")}>
              Go to Documents
            </Link>
          </div>
        )}

        <section className={cx(uiCard, "px-5 md:px-6 py-6")}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Tile title="Petrol (95)" value={petrolPrice != null ? GBP(petrolPrice) : "—"} suffix="/ litre" />
            <Tile title="Diesel" value={dieselPrice != null ? GBP(dieselPrice) : "—"} suffix="/ litre" />
            <Tile title="Estimated Total" value={GBP(estTotal)} />
          </div>

          <div className={uiRow}>
            <div>
              <label className={uiLabel}>Fuel</label>
              <select className={uiInput} value={fuel} onChange={(e) => setFuel(e.target.value as Fuel)} disabled={!requirementsOkay}>
                <option value="diesel">Diesel</option>
                <option value="petrol">Petrol</option>
              </select>
            </div>

            <div>
              <label className={uiLabel}>Litres</label>
              <input className={uiInput} type="number" min={1} value={litres} onChange={(e) => setLitres(Number(e.target.value))} disabled={!requirementsOkay} />
            </div>

            <div>
              <label className={uiLabel}>Delivery date</label>
              <input className={uiInput} type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} disabled={!requirementsOkay} />
            </div>

            <div>
              <label className={uiLabel}>Your email (receipt)</label>
              <input className={uiInput} type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!requirementsOkay} />
            </div>

            <div className="md:col-span-2">
              <label className={uiLabel}>Full name</label>
              <input className={uiInput} value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={!requirementsOkay} />
            </div>

            <div>
              <label className={uiLabel}>Address line 1</label>
              <input className={uiInput} value={address1} onChange={(e) => setAddress1(e.target.value)} disabled={!requirementsOkay} />
            </div>

            <div>
              <label className={uiLabel}>Address line 2</label>
              <input className={uiInput} value={address2} onChange={(e) => setAddress2(e.target.value)} disabled={!requirementsOkay} />
            </div>

            <div>
              <label className={uiLabel}>Postcode</label>
              <input className={uiInput} value={postcode} onChange={(e) => setPostcode(e.target.value)} disabled={!requirementsOkay} />
            </div>

            <div>
              <label className={uiLabel}>City</label>
              <input className={uiInput} value={city} onChange={(e) => setCity(e.target.value)} disabled={!requirementsOkay} />
            </div>

            <div className="md:col-span-2 mt-3">
              <button className={cx(uiBtn, uiBtnPrimary, "w-full md:w-auto")} disabled={payDisabled || startingCheckout} onClick={startCheckout}>
                {startingCheckout ? "Starting checkout…" : "Pay with Stripe"}
              </button>
            </div>
          </div>
        </section>
      </div>
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
