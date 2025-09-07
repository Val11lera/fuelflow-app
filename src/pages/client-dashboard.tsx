// src/pages/client-dashboard.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type Fuel = "petrol" | "diesel";

type PriceRow = {
  fuel: Fuel | string;
  total_price: number;       // GBP per litre (number, not pence)
  price_date: string;        // yyyy-mm-dd
  updated_at?: string | null;
};

type OrderRow = {
  id: string;
  created_at: string;
  user_email: string | null;
  fuel: Fuel | string | null;
  litres: number | null;
  unit_price_pence: number | null; // stored pence
  total_pence: number | null;      // stored pence
  status: string | null;
};

type PaymentRow = {
  order_id: string | null;
  amount: number; // pence
  currency: string;
  status: string;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

const INACTIVITY_MS =
  Number(process.env.NEXT_PUBLIC_IDLE_LOGOUT_MS ?? "") || 15 * 60 * 1000; // 15m default

function isToday(d: string | Date | null | undefined) {
  if (!d) return false;
  const date = typeof d === "string" ? new Date(d) : d;
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export default function ClientDashboard() {
  // ---------- auth & meta ----------
  const [userEmail, setUserEmail] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---------- prices ----------
  const [prices, setPrices] = useState<Record<Fuel, PriceRow | null>>({
    petrol: null,
    diesel: null,
  });
  const [priceSourceTried, setPriceSourceTried] = useState<string[]>([]);

  // ---------- orders ----------
  const [orders, setOrders] = useState<
    (OrderRow & { amountGBP: number; paymentStatus?: string })[]
  >([]);

  // ---------- usage view (year toggle) ----------
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  // ---------- auto logout ----------
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const resetTimer = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(async () => {
        try {
          await supabase.auth.signOut();
        } finally {
          window.location.href = "/login";
        }
      }, INACTIVITY_MS);
    };

    // start + bind listeners
    resetTimer();
    const evts: (keyof DocumentEventMap)[] = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "visibilitychange",
    ];
    evts.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));

    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      evts.forEach((e) => window.removeEventListener(e, resetTimer));
    };
  }, []);

  // ---------- load everything ----------
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);

        // --- Auth
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user?.email) {
          window.location.href = "/login";
          return;
        }
        const emailLower = auth.user.email.toLowerCase();
        setUserEmail(emailLower);

        // --- Prices (simplified: latest date from daily_prices)
        await loadPrices();

        // --- Orders (for card + tables)
        const { data: rawOrders, error: ordErr } = await supabase
          .from("orders")
          .select(
            "id, created_at, user_email, fuel, litres, unit_price_pence, total_pence, status"
          )
          .eq("user_email", emailLower)
          .order("created_at", { ascending: false })
          .limit(50);

        if (ordErr) throw ordErr;

        const ordersArr = (rawOrders || []) as OrderRow[];
        const ids = ordersArr.map((o) => o.id).filter(Boolean);

        // link payments by order_id (exact backfill)
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
          // preference: orders.total_pence -> payments.amount -> estimate(unit_price_pence*litres)
          const fromOrders = o.total_pence ?? null;
          const fromPayments = payMap.get(o.id || "")?.amount ?? null;

          let totalPence: number | null =
            fromOrders ?? (fromPayments as number | null) ?? null;

          if (totalPence == null) {
            if (o.unit_price_pence != null && o.litres != null) {
              totalPence = Math.round(o.unit_price_pence * o.litres);
            }
          }

          const amountGBP = totalPence != null ? totalPence / 100 : 0;
          return {
            ...o,
            amountGBP,
            paymentStatus: payMap.get(o.id || "")?.status,
          };
        });

        setOrders(withTotals);
      } catch (e: any) {
        setError(e?.message || "Failed to load dashboard.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function loadPrices() {
    // 1) latest price_date
    const { data: maxRow, error: maxErr } = await supabase
      .from("daily_prices")
      .select("price_date")
      .order("price_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (maxErr) throw maxErr;
    const latestDate = maxRow?.price_date;
    if (!latestDate) {
      setPrices({ petrol: null, diesel: null });
      setPriceSourceTried(["daily_prices(empty)"]);
      return;
    }

    // 2) read both fuels for that date
    const { data: rows, error: rowsErr } = await supabase
      .from("daily_prices")
      .select("fuel,total_price,price_date,updated_at")
      .eq("price_date", latestDate);

    if (rowsErr) throw rowsErr;

    const next: Record<Fuel, PriceRow | null> = { petrol: null, diesel: null };
    (rows || []).forEach((r: any) => {
      const f = String(r.fuel).toLowerCase() as Fuel;
      if (f === "petrol" || f === "diesel") next[f] = r as PriceRow;
    });

    setPrices(next);
    setPriceSourceTried([`daily_prices(${latestDate})`]);
  }

  // banner / buttons logic
  const pricesAreToday =
    isToday(prices.petrol?.price_date) && isToday(prices.diesel?.price_date);

  // year/month usage (simple)
  const monthsOfYear = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];

  type MonthRow = { monthIdx: number; monthLabel: string; litres: number; spend: number };
  const usageByMonth: MonthRow[] = useMemo(() => {
    const base: MonthRow[] = Array.from({ length: 12 }, (_, i) => ({
      monthIdx: i,
      monthLabel: monthsOfYear[i],
      litres: 0,
      spend: 0,
    }));
    for (const o of orders) {
      const d = new Date(o.created_at);
      if (d.getFullYear() !== selectedYear) continue;
      const m = d.getMonth();
      base[m].litres += o.litres ?? 0;
      base[m].spend += o.amountGBP ?? 0;
    }
    return base;
  }, [orders, selectedYear]);

  function lastUpdateText(p: PriceRow | null) {
    if (!p) return "—";
    // prefer updated_at if set, otherwise price_date
    const d = p.updated_at ? new Date(p.updated_at) : new Date(p.price_date);
    return d.toLocaleString();
  }

  async function onRefresh() {
    setLoading(true);
    setError(null);
    try {
      await loadPrices();
      // quick orders refresh without reloading page
      const { data: auth } = await supabase.auth.getUser();
      const emailLower = auth?.user?.email?.toLowerCase();
      if (emailLower) {
        const { data: rawOrders } = await supabase
          .from("orders")
          .select(
            "id, created_at, user_email, fuel, litres, unit_price_pence, total_pence, status"
          )
          .eq("user_email", emailLower)
          .order("created_at", { ascending: false })
          .limit(50);
        const rows = (rawOrders || []) as OrderRow[];
        setOrders((prev) => {
          // recompute amount using stored pence if present
          return rows.map((o) => ({
            ...o,
            amountGBP:
              o.total_pence != null
                ? o.total_pence / 100
                : o.unit_price_pence && o.litres
                ? (o.unit_price_pence * o.litres) / 100
                : 0,
          }));
        });
      }
    } catch (e: any) {
      setError(e?.message || "Refresh failed.");
    } finally {
      setLoading(false);
    }
  }

  async function onLogout() {
    try {
      await supabase.auth.signOut();
    } finally {
      window.location.href = "/login";
    }
  }

  return (
    <div className="min-h-screen bg-[#0A1324] text-white">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[#0A1324]/70 backdrop-blur border-b border-white/10">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
          <img src="/logo-email.png" alt="FuelFlow" className="h-8 w-auto" />
          <div className="text-white/80">
            Welcome back, <span className="font-medium">{userEmail}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <a
              href="/order"
              aria-disabled={!pricesAreToday}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                pricesAreToday
                  ? "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400"
                  : "bg-white/10 text-white/60 cursor-not-allowed"
              }`}
            >
              Order Fuel
            </a>
            <button
              onClick={onRefresh}
              className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
              disabled={loading}
            >
              Refresh
            </button>
            <button
              onClick={onLogout}
              className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5 space-y-6">
        {/* Prices banner */}
        {!pricesAreToday && (
          <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-200">
            <div className="font-semibold mb-1">Prices are out of date</div>
            <div className="text-red-200/90">
              Today’s prices haven’t been loaded yet. Click{" "}
              <button
                onClick={onRefresh}
                className="underline decoration-yellow-400 underline-offset-2 hover:text-white"
              >
                Refresh
              </button>{" "}
              to update. Ordering is disabled until today’s prices are available.
            </div>
            {priceSourceTried.length > 0 && (
              <div className="mt-2 text-xs text-red-200/80">
                Tried source: {priceSourceTried.join(", ")}.
              </div>
            )}
          </div>
        )}

        {/* Top cards */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Petrol */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
            <div className="text-white/80 mb-1">Petrol (95)</div>
            <div className="text-3xl font-bold">
              {prices.petrol ? gbp.format(prices.petrol.total_price) : "—"}
              <span className="text-base font-normal text-white/70"> / litre</span>
            </div>
            <div className="mt-2 text-xs text-white/60">
              Last update: {lastUpdateText(prices.petrol)}
            </div>
          </div>

          {/* Diesel */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
            <div className="text-white/80 mb-1">Diesel</div>
            <div className="text-3xl font-bold">
              {prices.diesel ? gbp.format(prices.diesel.total_price) : "—"}
              <span className="text-base font-normal text-white/70"> / litre</span>
            </div>
            <div className="mt-2 text-xs text-white/60">
              Last update: {lastUpdateText(prices.diesel)}
            </div>
          </div>

          {/* Contracts quick-links (optional) */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
            <div className="text-white/80 mb-2">Contracts</div>
            <div className="flex gap-2">
              <a
                href="/order"
                className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
              >
                View / Start
              </a>
              <a
                href="/terms"
                className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
              >
                Terms
              </a>
            </div>
          </div>
        </section>

        {/* Usage & Spend (12 months, selected year / previous year only) */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <h2 className="text-xl md:text-2xl font-semibold">Usage & Spend</h2>
            <div className="flex items-center gap-2">
              <span className="text-sm text-white/70">Year:</span>
              <div className="flex rounded-lg bg-white/10 text-sm overflow-hidden">
                <button
                  onClick={() => setSelectedYear(currentYear - 1)}
                  disabled={selectedYear === currentYear - 1}
                  className={`px-3 py-1.5 ${
                    selectedYear === currentYear - 1
                      ? "bg-yellow-500 text-[#041F3E] font-semibold"
                      : "hover:bg-white/15"
                  }`}
                >
                  {currentYear - 1}
                </button>
                <button
                  onClick={() => setSelectedYear(currentYear)}
                  disabled={selectedYear === currentYear}
                  className={`px-3 py-1.5 ${
                    selectedYear === currentYear
                      ? "bg-yellow-500 text-[#041F3E] font-semibold"
                      : "hover:bg-white/15"
                  }`}
                >
                  {currentYear}
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-white/70">
                <tr className="border-b border-white/10">
                  <th className="py-2 pr-4">Month</th>
                  <th className="py-2 pr-4">Litres</th>
                  <th className="py-2 pr-4">Spend</th>
                </tr>
              </thead>
              <tbody>
                {usageByMonth.map((r) => (
                  <tr key={r.monthIdx} className="border-b border-white/5">
                    <td className="py-2 pr-4">
                      {r.monthLabel} {String(selectedYear).slice(2)}
                    </td>
                    <td className="py-2 pr-4">
                      {Math.round(r.litres).toLocaleString()}
                      <div className="mt-1 h-1.5 w-full bg-white/10 rounded">
                        <div
                          className="h-1.5 rounded bg-yellow-500/80"
                          style={{
                            width: `${
                              (() => {
                                const max = Math.max(1, ...usageByMonth.map((x) => x.litres));
                                return (r.litres / max) * 100;
                              })()
                            }%`,
                          }}
                        />
                      </div>
                    </td>
                    <td className="py-2 pr-4">
                      {gbp.format(r.spend)}
                      <div className="mt-1 h-1.5 w-full bg-white/10 rounded">
                        <div
                          className="h-1.5 rounded bg-white/40"
                          style={{
                            width: `${
                              (() => {
                                const max = Math.max(1, ...usageByMonth.map((x) => x.spend));
                                return (r.spend / max) * 100;
                              })()
                            }%`,
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Errors */}
        {error && (
          <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Recent Orders */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl md:text-2xl font-semibold">Recent Orders</h2>
            <button
              onClick={onRefresh}
              className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
              disabled={loading}
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="text-white/70">Loading…</div>
          ) : orders.length === 0 ? (
            <div className="text-white/70">No orders yet.</div>
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
        </section>
      </main>
    </div>
  );
}

