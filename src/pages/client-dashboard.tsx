// src/pages/client-dashboard.tsx
// src/pages/client-dashboard.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* =========================
   Setup
   ========================= */

type Fuel = "petrol" | "diesel";
type ContractStatus = "draft" | "signed" | "approved" | "cancelled";
type TankOption = "buy" | "rent";

const TERMS_VERSION = "v1.1";
const INACTIVITY_MS =
  Number(process.env.NEXT_PUBLIC_IDLE_LOGOUT_MS ?? "") || 10 * 60 * 1000; // 10 minutes

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

/* =========================
   Types
   ========================= */

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

type ContractRow = {
  id: string;
  tank_option: TankOption;
  status: ContractStatus;
  signed_at: string | null;
  approved_at: string | null;
  created_at: string;
  email: string | null;
  pdf_url?: string | null;
  pdf_storage_path?: string | null;
};

/* =========================
   Helpers
   ========================= */

function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

/* =========================
   Page
   ========================= */

export default function ClientDashboard() {
  const [userEmail, setUserEmail] = useState<string>("");

  // gating: UI hidden until Refresh
  const [hasRefreshed, setHasRefreshed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const refreshedWeekday =
    lastRefreshAt
      ? new Date(lastRefreshAt).toLocaleDateString(undefined, { weekday: "long" })
      : "—";

  // prices
  const [petrolPrice, setPetrolPrice] = useState<number | null>(null);
  const [dieselPrice, setDieselPrice] = useState<number | null>(null);

  // orders
  const [orders, setOrders] = useState<
    (OrderRow & { amountGBP: number; paymentStatus?: string })[]
  >([]);

  // (we load contracts but don't show status on the dashboard)
  const [buyContract, setBuyContract] = useState<ContractRow | null>(null);
  const [rentContract, setRentContract] = useState<ContractRow | null>(null);

  // usage UI
  const currentYear = new Date().getFullYear();
  const currentMonthIdx = new Date().getMonth();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [showAllMonths, setShowAllMonths] = useState<boolean>(false);

  // ----------------- Auth on mount -----------------
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        window.location.href = "/login";
        return;
      }
      setUserEmail((auth.user.email || "").toLowerCase());
    })();
  }, []);

  // ----------------- Auto logout on inactivity -----------------
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const reset = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(async () => {
        try {
          await supabase.auth.signOut();
        } finally {
          window.location.href = "/login";
        }
      }, INACTIVITY_MS);
    };

    const events: (keyof WindowEventMap)[] = ["mousemove","mousedown","keydown","scroll","touchstart"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    const onVis = () => reset();
    document.addEventListener("visibilitychange", onVis, { passive: true });

    reset();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      events.forEach((e) => window.removeEventListener(e, reset));
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // ----------------- Loaders (triggered by Refresh) -----------------
  async function loadAll() {
    try {
      setLoading(true);
      setError(null);
      await Promise.all([loadLatestPrices(), loadContracts(), loadOrders()]);
      setHasRefreshed(true);
      setLastRefreshAt(new Date().toISOString());
    } catch (e: any) {
      setError(e?.message || "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }

  async function loadContracts() {
    if (!userEmail) return;
    const { data } = await supabase
      .from("contracts")
      .select("id,tank_option,status,signed_at,approved_at,created_at,email")
      .eq("email", userEmail)
      .order("created_at", { ascending: false });

    const rows = (data || []) as ContractRow[];
    setBuyContract(rows.find((r) => r.tank_option === "buy") ?? null);
    setRentContract(rows.find((r) => r.tank_option === "rent") ?? null);
  }

  async function loadLatestPrices() {
    setPetrolPrice(null);
    setDieselPrice(null);

    type Row = {
      fuel?: string;
      total_price?: number;
      price?: number;
      latest_price?: number;
      unit_price?: number;
    };

    const toGbp = (raw: number | undefined | null) => {
      if (!Number.isFinite(raw as number)) return null;
      const n = Number(raw);
      return n > 10 ? n / 100 : n; // handle pence or GBP
    };

    const apply = (rows: Row[]) => {
      rows.forEach((r) => {
        const f = String(r.fuel || "").toLowerCase();
        const v =
          toGbp(r.total_price) ??
          toGbp(r.price) ??
          toGbp(r.latest_price) ??
          toGbp(r.unit_price);
        if (v == null) return;
        if (f === "petrol") setPetrolPrice(Math.round(v * 1000) / 1000);
        if (f === "diesel") setDieselPrice(Math.round(v * 1000) / 1000);
      });
    };

    const tryTable = async (table: string) => {
      try {
        const { data } = await supabase.from(table).select("*").limit(10);
        if (data && data.length) {
          apply(data as Row[]);
          return true;
        }
      } catch {}
      return false;
    };

    if (await tryTable("latest_prices")) return;
    if (await tryTable("latest_fuel_prices_view")) return;
    if (await tryTable("latest_prices_view")) return;

    try {
      const { data } = await supabase
        .from("daily_prices")
        .select("*")
        .order("price_date", { ascending: false })
        .limit(200);

      if (data && data.length) {
        const seen = new Map<string, Row>();
        for (const r of data as Row[]) {
          const key = String(r.fuel || "").toLowerCase();
          if (!seen.has(key)) seen.set(key, r);
        }
        apply(Array.from(seen.values()));
      }
    } catch {}
  }

  async function loadOrders() {
    if (!userEmail) return;

    const { data: rawOrders, error: ordErr } = await supabase
      .from("orders")
      .select("id, created_at, user_email, fuel, litres, unit_price_pence, total_pence, status")
      .eq("user_email", userEmail)
      .order("created_at", { ascending: false })
      .limit(50);

    if (ordErr) throw ordErr;

    const ordersArr = (rawOrders || []) as OrderRow[];
    const ids = ordersArr.map((o) => o.id).filter(Boolean);

    let payMap = new Map<string, PaymentRow>();
    if (ids.length) {
      const { data: pays } = await supabase
        .from("payments")
        .select("order_id, amount, currency, status")
        .in("order_id", ids);
      (pays || []).forEach((p: any) => {
        if (p.order_id) payMap.set(p.order_id, p);
      });
    }

    const withTotals = ordersArr.map((o) => {
      const fromOrders = o.total_pence ?? null;
      const fromPayments = payMap.get(o.id || "")?.amount ?? null;

      let totalPence: number | null =
        fromOrders ?? (fromPayments as number | null) ?? null;

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

  // ---------- Actions ----------
  function refresh() {
    // central big button uses this
    loadAll();
  }

  async function logout() {
    try {
      await supabase.auth.signOut();
    } finally {
      window.location.href = "/login";
    }
  }

  // ---------- Usage & Spend (by month, year) ----------
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sept","Oct","Nov","Dec"];

  type MonthAgg = { monthIdx: number; monthLabel: string; litres: number; spend: number };
  const usageByMonth: MonthAgg[] = useMemo(() => {
    const base: MonthAgg[] = Array.from({ length: 12 }, (_, i) => ({
      monthIdx: i, monthLabel: months[i], litres: 0, spend: 0,
    }));
    orders.forEach((o) => {
      const d = new Date(o.created_at);
      if (d.getFullYear() !== selectedYear) return;
      const m = d.getMonth();
      base[m].litres += o.litres ?? 0;
      base[m].spend += o.amountGBP ?? 0;
    });
    return base;
  }, [orders, selectedYear]);

  const maxL = Math.max(1, ...usageByMonth.map((x) => x.litres));
  const maxS = Math.max(1, ...usageByMonth.map((x) => x.spend));
  const rowsToShow = showAllMonths ? usageByMonth : usageByMonth.filter((r) => r.monthIdx === currentMonthIdx);

  /* =========================
     Render
     ========================= */

  const canOrder = hasRefreshed && petrolPrice != null && dieselPrice != null;

  // --- BEFORE REFRESH: show centered CTA only ---
  if (!hasRefreshed) {
    return (
      <div className="min-h-screen bg-[#0b1220] text-white">
        {/* simple header with logout only */}
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center">
          <img src="/logo-email.png" alt="FuelFlow" className="h-7 w-auto" />
          <div className="ml-auto">
            <button
              onClick={logout}
              className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
            >
              Log out
            </button>
          </div>
        </div>

        {/* Centered Refresh CTA */}
        <div className="max-w-6xl mx-auto px-4">
          <div className="min-h-[60vh] grid place-items-center">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
              <h1 className="text-2xl font-semibold">Dashboard paused</h1>
              <p className="mt-2 text-white/70">
                Press refresh to load today’s prices and your latest activity.
              </p>
              <button
                onClick={refresh}
                disabled={loading}
                className={cx(
                  "mt-5 w-full rounded-xl px-4 py-3 text-base font-semibold",
                  "bg-white/10 hover:bg-white/15",
                  loading && "opacity-60 cursor-not-allowed"
                )}
              >
                {loading ? "Refreshing…" : "Refresh"}
              </button>
              {error && (
                <div className="mt-3 rounded-lg border border-rose-400/40 bg-rose-500/10 p-2 text-sm text-rose-200">
                  {error}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- AFTER REFRESH: full dashboard ---
  return (
    <div className="min-h-screen bg-[#0b1220] text-white">
      {/* Sticky mobile Order CTA */}
      <div className="md:hidden fixed bottom-4 inset-x-4 z-40">
        <a
          href="/order"
          aria-disabled={!canOrder}
          className={cx(
            "block text-center rounded-xl py-3 font-semibold shadow-lg bg-yellow-500 text-[#041F3E] hover:bg-yellow-400",
            !canOrder && "opacity-50 cursor-not-allowed pointer-events-none"
          )}
        >
          Order Fuel
        </a>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <img src="/logo-email.png" alt="FuelFlow" className="h-7 w-auto" />
          <div className="text-sm text-white/70">
            Welcome back, <span className="font-medium">{userEmail}</span>
          </div>

        <div className="ml-auto hidden md:flex gap-2">
            <a
              href="/order"
              aria-disabled={!canOrder}
              className={cx(
                "rounded-lg px-3 py-2 text-sm font-semibold bg-yellow-500 text-[#041F3E] hover:bg-yellow-400",
                !canOrder && "opacity-50 cursor-not-allowed pointer-events-none"
              )}
            >
              Order Fuel
            </a>
            <a href="/documents" className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15">
              Documents
            </a>
            <button onClick={refresh} className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15">
              Refresh
            </button>
            <button onClick={logout} className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15">
              Log out
            </button>
          </div>
        </div>

        {/* Top cards */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card title="Petrol (95)">
            <div className="text-3xl font-bold">
              {petrolPrice != null ? gbp.format(petrolPrice) : "—"}
              <span className="text-base font-normal text-gray-300"> / litre</span>
            </div>
            <div className="mt-1 text-xs text-white/60">Refreshed: {refreshedWeekday}</div>
          </Card>

          <Card title="Diesel">
            <div className="text-3xl font-bold">
              {dieselPrice != null ? gbp.format(dieselPrice) : "—"}
              <span className="text-base font-normal text-gray-300"> / litre</span>
            </div>
            <div className="mt-1 text-xs text-white/60">Refreshed: {refreshedWeekday}</div>
          </Card>

          <div className="bg-gray-800 rounded-xl p-4 md:p-5">
            <p className="text-gray-400 mb-1">Documents</p>
            <a
              href="/documents"
              className="mt-1 inline-flex items-center rounded-lg bg-white/10 hover:bg-white/15 px-3 py-1.5 text-sm font-semibold"
            >
              Open documents
            </a>
          </div>
        </section>

        {/* Usage & Spend */}
        <section className="bg-gray-800/40 rounded-xl p-4 md:p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
            <h2 className="text-xl md:text-2xl font-semibold">Usage &amp; Spend</h2>
            <div className="flex items-center gap-2">
              <span className="text-sm text-white/70">Year:</span>
              <div className="flex overflow-hidden rounded-lg bg-white/10 text-sm">
                <button
                  onClick={() => setSelectedYear(currentYear - 1)}
                  disabled={selectedYear === currentYear - 1}
                  className={cx(
                    "px-3 py-1.5",
                    selectedYear === currentYear - 1 ? "bg-yellow-500 text-[#041F3E] font-semibold" : "hover:bg-white/15"
                  )}
                >
                  {currentYear - 1}
                </button>
                <button
                  onClick={() => setSelectedYear(currentYear)}
                  disabled={selectedYear === currentYear}
                  className={cx(
                    "px-3 py-1.5",
                    selectedYear === currentYear ? "bg-yellow-500 text-[#041F3E] font-semibold" : "hover:bg-white/15"
                  )}
                >
                  {currentYear}
                </button>
              </div>
              <button
                onClick={() => setShowAllMonths((s) => !s)}
                className="ml-3 rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
              >
                {showAllMonths ? "Show current month" : "Show 12 months"}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-gray-300">
                <tr className="border-b border-gray-700/60">
                  <th className="py-2 pr-4">Month</th>
                  <th className="py-2 pr-4">Litres</th>
                  <th className="py-2 pr-4">Spend</th>
                </tr>
              </thead>
              <tbody>
                {(showAllMonths ? usageByMonth : rowsToShow).map((r) => (
                  <tr key={`${selectedYear}-${r.monthIdx}`} className="border-b border-gray-800/60">
                    <td className="py-2 pr-4">
                      {r.monthLabel} {String(selectedYear).slice(2)}
                    </td>
                    <td className="py-2 pr-4 align-middle">
                      {Math.round(r.litres).toLocaleString()}
                      <div className="mt-1 h-1.5 w-full bg-white/10 rounded">
                        <div
                          className="h-1.5 rounded bg-yellow-500/80"
                          style={{ width: `${(r.litres / maxL) * 100}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-2 pr-4 align-middle">
                      {gbp.format(r.spend)}
                      <div className="mt-1 h-1.5 w-full bg-white/10 rounded">
                        <div
                          className="h-1.5 rounded bg-white/40"
                          style={{ width: `${(r.spend / maxS) * 100}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* errors */}
        {error && (
          <div className="bg-red-800/60 border border-red-500 text-red-100 p-4 rounded">
            {error}
          </div>
        )}

        {/* recent orders */}
        <section className="bg-gray-800 rounded-xl p-4 md:p-6 mb-24 md:mb-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl md:text-2xl font-semibold">Recent Orders</h2>
            <button
              onClick={refresh}
              className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-sm"
              disabled={loading}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {loading && orders.length === 0 ? (
            <div className="text-gray-300">Loading…</div>
          ) : orders.length === 0 ? (
            <div className="text-gray-400">No orders yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-gray-300">
                  <tr className="border-b border-gray-700">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Product</th>
                    <th className="py-2 pr-4">Litres</th>
                    <th className="py-2 pr-4">Amount</th>
                    <th className="py-2 pr-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b border-gray-800">
                      <td className="py-2 pr-4">{new Date(o.created_at).toLocaleString()}</td>
                      <td className="py-2 pr-4 capitalize">{(o.fuel as string) || "—"}</td>
                      <td className="py-2 pr-4">{o.litres ?? "—"}</td>
                      <td className="py-2 pr-4">{gbp.format(o.amountGBP)}</td>
                      <td className="py-2 pr-4">
                        <span
                          className={cx(
                            "inline-flex items-center rounded px-2 py-0.5 text-xs",
                            (o.status || "").toLowerCase() === "paid" ? "bg-green-600/70" : "bg-gray-600/70"
                          )}
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
        </section>
      </div>
    </div>
  );
}

/* =========================
   Components
   ========================= */

function Card(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-800 rounded-xl p-4 md:p-5">
      <p className="text-gray-400">{props.title}</p>
      <div className="mt-2">{props.children}</div>
    </div>
  );
}
