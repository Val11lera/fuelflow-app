// src/pages/client-dashboard.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

type Fuel = "petrol" | "diesel";

const supabase: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

// ---------- types ----------
type PriceRow = {
  fuel: Fuel | string;
  total_price: number;          // £/litre (numeric)
  price_date?: string | null;   // 'YYYY-MM-DD'
  updated_at?: string | null;   // timestamptz if you have it
};

type OrderRow = {
  id: string;
  created_at: string;
  user_email: string;
  fuel: Fuel | string | null;
  litres: number | null;
  unit_price_pence: number | null;
  total_pence: number | null;
  status: string | null;
};

type PaymentRow = {
  order_id: string | null;
  amount: number; // pence
  currency: string;
  status: string;
};

// ---------- helpers ----------
const todayStr = () => new Date().toISOString().slice(0, 10);

function fmtDateTime(s?: string | null) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString();
  } catch {
    return "—";
  }
}

// ---------- component ----------
export default function ClientDashboard() {
  const [userEmail, setUserEmail] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // prices
  const [prices, setPrices] = useState<Record<Fuel, PriceRow | null>>({
    petrol: null,
    diesel: null,
  });

  // orders
  const [orders, setOrders] = useState<
    (OrderRow & { amountGBP: number; paymentStatus?: string })[]
  >([]);

  // auto-logout (15 min default)
  const LOGOUT_AFTER_MIN = 15;
  const logoutTimer = useRef<number | undefined>(undefined);

  function scheduleAutoLogout() {
    clearAutoLogout();
    logoutTimer.current = window.setTimeout(async () => {
      await supabase.auth.signOut();
      window.location.href = "/login";
    }, LOGOUT_AFTER_MIN * 60 * 1000);
  }
  function clearAutoLogout() {
    if (logoutTimer.current) window.clearTimeout(logoutTimer.current);
  }
  function wireInactivityResetters() {
    const reset = () => scheduleAutoLogout();
    ["click", "keydown", "scroll", "mousemove", "touchstart"].forEach((ev) =>
      window.addEventListener(ev, reset, { passive: true })
    );
    return () => {
      ["click", "keydown", "scroll", "mousemove", "touchstart"].forEach((ev) =>
        window.removeEventListener(ev, reset)
      );
    };
  }

  // derived flags
  const priceDates = useMemo(() => {
    const map: Partial<Record<Fuel, string | undefined>> = {};
    if (prices.petrol?.price_date) map.petrol = prices.petrol.price_date!;
    if (prices.diesel?.price_date) map.diesel = prices.diesel.price_date!;
    return map;
  }, [prices]);

  const arePricesToday = useMemo(() => {
    const t = todayStr();
    const dates = [priceDates.petrol, priceDates.diesel].filter(Boolean) as string[];
    if (dates.length < 2) return false; // need both fuels
    return dates.every((d) => d === t);
  }, [priceDates]);

  // block ordering if prices not today
  const orderDisabled = !arePricesToday;

  // ---------- data loaders ----------
  async function loadAuth() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      window.location.href = "/login";
      return null;
    }
    const emailLower = (auth.user.email || "").toLowerCase();
    setUserEmail(emailLower);
    return emailLower;
  }

  async function loadPrices() {
    // Try the view you already have: latest_daily_prices
    let { data, error } = await supabase
      .from("latest_daily_prices")
      .select("fuel,total_price,price_date,updated_at");

    // Fallback: derive from daily_prices if that view isn't present/allowed
    if (error || !data || data.length === 0) {
      const { data: fbData } = await supabase
        .from("daily_prices")
        .select("fuel,total_price,price_date,updated_at")
        .eq("price_date", todayStr()); // take today's rows if present
      data = fbData || [];
    }

    const next: Record<Fuel, PriceRow | null> = { petrol: null, diesel: null };
    for (const r of data as PriceRow[]) {
      const f = String(r.fuel).toLowerCase() as Fuel;
      if (f === "petrol" || f === "diesel") next[f] = r;
    }
    setPrices(next);
  }

  async function loadOrders(emailLower: string) {
    const { data: rawOrders, error: ordErr } = await supabase
      .from("orders")
      .select(
        "id, created_at, user_email, fuel, litres, unit_price_pence, total_pence, status"
      )
      .eq("user_email", emailLower)
      .order("created_at", { ascending: false })
      .limit(20);

    if (ordErr) throw ordErr;

    const ordersArr = (rawOrders || []) as OrderRow[];
    const ids = ordersArr.map((o) => o.id).filter(Boolean);

    // payments map for exact fallback
    let payMap = new Map<string, PaymentRow>();
    if (ids.length) {
      const { data: pays } = await supabase
        .from("payments")
        .select("order_id, amount, currency, status")
        .in("order_id", ids);
      (pays || []).forEach((p: any) => p?.order_id && payMap.set(p.order_id, p));
    }

    const withTotals = ordersArr.map((o) => {
      const fromOrders = o.total_pence ?? null;
      const fromPayments = payMap.get(o.id || "")?.amount ?? null;

      let totalPence: number | null = fromOrders ?? (fromPayments as number | null) ?? null;
      if (totalPence == null && o.unit_price_pence != null && o.litres != null) {
        totalPence = Math.round(o.unit_price_pence * o.litres);
      }
      const amountGBP = totalPence != null ? totalPence / 100 : 0;

      return {
        ...o,
        amountGBP,
        paymentStatus: payMap.get(o.id || "")?.status,
      };
    });

    setOrders(withTotals);
  }

  async function loadAll() {
    try {
      setLoading(true);
      setError(null);
      const email = await loadAuth();
      if (!email) return;
      await Promise.all([loadPrices(), loadOrders(email)]);
    } catch (e: any) {
      setError(e?.message || "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }

  // ---------- effects ----------
  useEffect(() => {
    loadAll();
    scheduleAutoLogout();
    const unWire = wireInactivityResetters();

    // live update when new daily_prices rows arrive
    const channel = supabase
      .channel("prices-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "daily_prices" },
        () => loadPrices()
      )
      .subscribe();

    return () => {
      clearAutoLogout();
      unWire();
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- actions ----------
  async function handleRefresh() {
    await loadAll();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  // ---------- UI ----------
  return (
    <div className="min-h-screen bg-[#0B1627] text-white">
      <div className="mx-auto max-w-6xl px-4 py-5 md:py-7">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo-email.png" alt="FuelFlow" className="h-8 w-auto" />
            <div className="text-sm text-white/70">
              Welcome back, <span className="font-medium text-white">{userEmail}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/order"
              aria-disabled={orderDisabled}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                orderDisabled
                  ? "bg-gray-700 text-gray-300 cursor-not-allowed"
                  : "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400"
              }`}
            >
              Order Fuel
            </a>
            <button
              onClick={handleRefresh}
              className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
            >
              Refresh
            </button>
            <button
              onClick={handleLogout}
              className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
            >
              Log out
            </button>
          </div>
        </div>

        {/* Prices stale banner */}
        {!arePricesToday && (
          <div className="mb-5 rounded-xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-200">
            <div className="font-semibold">Prices are out of date</div>
            <div className="mt-1">
              Today’s prices haven’t been loaded yet. Click <span className="underline">Refresh</span> to update.
              Ordering is disabled until today’s prices are available.
            </div>
          </div>
        )}

        {/* Top cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card title="Petrol (95)">
            <div className="text-3xl font-bold">
              {prices.petrol ? gbp.format(prices.petrol.total_price) : "—"}
              <span className="text-base font-normal text-white/70"> / litre</span>
            </div>
            <div className="mt-1 text-xs text-white/60">
              Last update:{" "}
              {prices.petrol?.updated_at
                ? fmtDateTime(prices.petrol.updated_at)
                : prices.petrol?.price_date || "—"}
            </div>
          </Card>

          <Card title="Diesel">
            <div className="text-3xl font-bold">
              {prices.diesel ? gbp.format(prices.diesel.total_price) : "—"}
              <span className="text-base font-normal text-white/70"> / litre</span>
            </div>
            <div className="mt-1 text-xs text-white/60">
              Last update:{" "}
              {prices.diesel?.updated_at
                ? fmtDateTime(prices.diesel.updated_at)
                : prices.diesel?.price_date || "—"}
            </div>
          </Card>

          {/* Contracts quick-links (optional; wire to your routes) */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 md:p-5">
            <p className="text-white/80">Contracts</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <a
                href="/order#contracts"
                className="rounded-lg bg-white/10 px-3 py-2 text-center text-sm hover:bg-white/15"
              >
                View / Start
              </a>
              <a
                href="/terms"
                className="rounded-lg bg-white/10 px-3 py-2 text-center text-sm hover:bg-white/15"
              >
                Terms
              </a>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-5 rounded-xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Orders */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.05] p-4 md:p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl md:text-2xl font-semibold">Recent Orders</h2>
            <button
              onClick={handleRefresh}
              className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="text-white/70">Loading…</div>
          ) : orders.length === 0 ? (
            <div className="text-white/60">No orders yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-white/70">
                  <tr className="border-b border-white/10">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Product</th>
                    <th className="py-2 pr-4">Litres</th>
                    <th className="py-2 pr-4">Amount</th>
                    <th className="py-2 pr-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b border-white/5">
                      <td className="py-2 pr-4">{new Date(o.created_at).toLocaleString()}</td>
                      <td className="py-2 pr-4 capitalize">{(o.fuel as string) || "—"}</td>
                      <td className="py-2 pr-4">{o.litres ?? "—"}</td>
                      <td className="py-2 pr-4">{gbp.format(o.amountGBP)}</td>
                      <td className="py-2 pr-4">
                        <span
                          className={`inline-flex items-center rounded px-2 py-0.5 text-xs ${
                            (o.status || "").toLowerCase() === "paid"
                              ? "bg-green-600/70"
                              : "bg-gray-600/70"
                          }`}
                        >
                          {(o.status || o.paymentStatus || "pending").toLowerCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Card(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 md:p-5">
      <p className="text-white/80">{props.title}</p>
      <div className="mt-2">{props.children}</div>
    </div>
  );
}

