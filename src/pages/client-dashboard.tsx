// src/pages/client-dashboard.tsx
// src/pages/client-dashboard.tsx
// src/pages/client-dashboard.tsx
// src/pages/client-dashboard.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { GetServerSideProps } from "next";
import { createClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabase-server";
import { OrderAIChat } from "@/components/OrderAIChat";

/* =========================
   Setup
   ========================= */

type Fuel = "petrol" | "diesel";

const INACTIVITY_MS =
  Number(process.env.NEXT_PUBLIC_IDLE_LOGOUT_MS ?? "") || 10 * 60 * 1000; // 10 minutes default

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
  user_email: string | null;
  fuel: Fuel | string | null;
  litres: number | null;
  unit_price_pence: number | null;
  total_pence: number | null;
  status: string | null; // payment status (legacy / backup)
  fulfilment_status: string | null; // delivery status
  fulfilment_notes?: string | null; // admin → client message
};

type PaymentRow = {
  order_id: string | null;
  amount: number | null; // pence
  currency: string | null;
  status: string | null;
};

type OrderWithExtras = OrderRow & {
  amount_gbp: number;
  payment_status?: string | null;
};

/* =========================
   Helpers
   ========================= */

function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

// dd/mm/yy
function formatShortDMY(value?: string | Date | null) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

function truncate(text: string | null | undefined, max: number) {
  if (!text) return "";
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

/* =========================
   Page
   ========================= */

export default function ClientDashboard() {
  const [userEmail, setUserEmail] = useState<string>("");

  // screen / loading
  const [hasRefreshed, setHasRefreshed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  // prices
  const [petrolPrice, setPetrolPrice] = useState<number | null>(null);
  const [dieselPrice, setDieselPrice] = useState<number | null>(null);

  // orders (all fetched, then sliced for table)
  const [orders, setOrders] = useState<OrderWithExtras[]>([]);
  const [visibleCount, setVisibleCount] = useState<number>(20);
  const [error, setError] = useState<string | null>(null);

  // usage UI
  const currentYear = new Date().getFullYear();
  const currentMonthIdx = new Date().getMonth();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [showAllMonths, setShowAllMonths] = useState<boolean>(false);

  // ----------------- Auth + access gate (allow-list / blocked) -----------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { ensureClientAccess } = await import("@/lib/access-guard");

        // Throws "signin" | "blocked" | "pending"
        let okEmail = "";
        try {
          okEmail = await ensureClientAccess(supabase);
        } catch (e: any) {
          const reason = String(e?.message || "signin");
          try {
            await supabase.auth.signOut();
          } catch {}
          if (!cancelled) {
            window.location.replace(
              `/login?reason=${encodeURIComponent(
                reason
              )}&next=/client-dashboard`
            );
          }
          return;
        }

        if (cancelled) return;

        // normalise to lower-case for lookups
        const lower = okEmail.toLowerCase();
        setUserEmail(lower);
        await loadAll(lower);
      } catch {
        if (!cancelled) {
          window.location.replace(
            "/login?reason=signin&next=/client-dashboard"
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          window.location.href = "https://fuelflow.co.uk";
        }
      }, INACTIVITY_MS);
    };

    const events: (keyof WindowEventMap)[] = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
    ];
    events.forEach((e) =>
      window.addEventListener(e, reset, { passive: true })
    );
    const onVisibility = () => reset();
    document.addEventListener("visibilitychange", onVisibility, {
      passive: true,
    });

    reset();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      events.forEach((e) => window.removeEventListener(e, reset));
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // ----------------- Refresh (loads all dashboard data) -----------------
  async function loadAll(emailLower?: string) {
    try {
      setLoading(true);
      setError(null);

      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        window.location.replace("/login?reason=signin&next=/client-dashboard");
        return;
      }
      const lower = (emailLower || auth.user.email || "").toLowerCase();
      setUserEmail(lower);

      await Promise.all([loadLatestPrices(), loadOrders(lower)]);

      setHasRefreshed(true);
      setRefreshedAt(new Date());
    } catch (e: any) {
      setError(e?.message || "Failed to refresh dashboard.");
    } finally {
      setLoading(false);
    }
  }

  // ----------------- Load ORDERS for this customer -----------------
  async function loadOrders(emailLower: string) {
    // 1) fetch this customer's orders, including fulfilment fields
    const { data: rawOrders, error: ordErr } = await supabase
      .from("orders")
      .select(
        "id, created_at, user_email, fuel, litres, unit_price_pence, total_pence, status, fulfilment_status, fulfilment_notes"
      )
      .eq("user_email", emailLower)
      .order("created_at", { ascending: false })
      .limit(200);

    if (ordErr) throw ordErr;

    const ordersArr = (rawOrders || []) as OrderRow[];
    const ids = ordersArr.map((o) => o.id).filter(Boolean);

    // 2) fetch payments for those orders (to show PAID / pending)
    let paymentMap = new Map<string, PaymentRow>();
    if (ids.length) {
      const { data: pays, error: payErr } = await supabase
        .from("payments")
        .select("order_id, amount, currency, status")
        .in("order_id", ids);

      if (payErr) throw payErr;
      (pays || []).forEach((p: any) => {
        if (p.order_id) paymentMap.set(p.order_id, p);
      });
    }

    // 3) combine and compute final amount_gbp for each row
    const withTotals: OrderWithExtras[] = ordersArr.map((o) => {
      const pay = paymentMap.get(o.id || "");
      const fromOrders = o.total_pence ?? null;
      const fromPayments = pay?.amount ?? null;

      let totalPence: number | null =
        fromOrders ?? (fromPayments as number | null) ?? null;

      if (totalPence == null) {
        if (o.unit_price_pence != null && o.litres != null) {
          totalPence = Math.round(o.unit_price_pence * o.litres);
        }
      }

      const amount_gbp = totalPence != null ? totalPence / 100 : 0;

      // prefer Stripe payment status; fall back to order.status
      const payment_status = pay?.status ?? o.status ?? null;

      return {
        ...o,
        amount_gbp,
        payment_status,
      };
    });

    setOrders(withTotals);
    setVisibleCount(20); // reset slice on each refresh
  }

  // ------------ Latest prices (same as before, just tidied) ------------
  async function loadLatestPrices() {
    setPetrolPrice(null);
    setDieselPrice(null);

    type Row = {
      fuel?: string;
      total_price?: number;
      price?: number;
      latest_price?: number;
      unit_price?: number;
      price_date?: string | null;
      updated_at?: string | null;
      created_at?: string | null;
    };

    const toGbp = (raw: number | undefined | null) => {
      if (!Number.isFinite(raw as number)) return null;
      const n = Number(raw);
      const v = n > 10 ? n / 100 : n; // if stored in pence, convert
      return Math.round(v * 1000) / 1000;
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
        if (f === "petrol") setPetrolPrice(v);
        if (f === "diesel") setDieselPrice(v);
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

  // ---------- simple UI helpers ----------
  function refresh() {
    loadAll();
  }

  async function logout() {
    try {
      await supabase.auth.signOut();
      await fetch("/api/auth/signout", { method: "POST" }).catch(() => {});
    } finally {
      window.location.href = "https://fuelflow.co.uk";
    }
  }

  // ---------- Usage & Spend (by month, year), based on THIS user's orders ----------
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sept",
    "Oct",
    "Nov",
    "Dec",
  ];

  type MonthAgg = {
    monthIdx: number;
    monthLabel: string;
    litres: number;
    spend: number;
  };

  const usageByMonth: MonthAgg[] = useMemo(() => {
    const base: MonthAgg[] = Array.from({ length: 12 }, (_, i) => ({
      monthIdx: i,
      monthLabel: months[i],
      litres: 0,
      spend: 0,
    }));
    orders.forEach((o) => {
      const d = new Date(o.created_at);
      if (d.getFullYear() !== selectedYear) return;
      const m = d.getMonth();
      base[m].litres += o.litres ?? 0;
      base[m].spend += o.amount_gbp ?? 0;
    });
    return base;
  }, [orders, selectedYear]);

  const rowsToShow = showAllMonths
    ? usageByMonth
    : usageByMonth.filter((r) => r.monthIdx === currentMonthIdx);

  const maxLitres = Math.max(1, ...usageByMonth.map((x) => x.litres));
  const maxSpend = Math.max(1, ...usageByMonth.map((x) => x.spend));

  /* =========================
     Render
     ========================= */

  const canOrder = petrolPrice != null && dieselPrice != null;

  // ----------------- Loading screen -----------------
  if (!hasRefreshed || loading) {
    return (
      <div className="min-h-screen bg-[#0b1220] text-white">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <a
              href="https://fuelflow.co.uk"
              aria-label="FuelFlow website"
              className="shrink-0"
            >
              <img src="/logo-email.png" alt="FuelFlow" className="h-7 w-auto" />
            </a>
            <div className="hidden md:block text-sm text-white/70">
              Refreshing…
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={logout}
                className="h-9 inline-flex items-center rounded-lg bg-yellow-500 px-3 text-sm font-semibold text-[#041F3E] hover:bg-yellow-400"
              >
                Log out
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4">
          <div className="mt-16 rounded-2xl border border-white/10 bg_WHITE/[0.03] p-8 text-center">
            <h1 className="text-2xl md:text-3xl font-bold">
              Loading dashboard
            </h1>
            <p className="mt-2 text-white/70">
              Pulling latest prices and your recent orders…
            </p>
            <button
              onClick={refresh}
              className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-white/10 px-6 text-base font-semibold hover:bg-white/15"
            >
              Refresh now
            </button>
            {error && (
              <div className="mt-4 rounded-lg border border-red-400/40 bg-red-500/10 p-2 text-sm text-red-200">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ------------- Derived for "My Orders" -------------
  const visibleOrders = orders.slice(0, visibleCount);
  const hasMore = visibleCount < orders.length;

  return (
    <div className="min-h-screen bg-[#0b1220] text-white">
      {/* Sticky mobile CTA */}
      <div className="md:hidden fixed bottom-4 inset-x-4 z-40">
        <a
          href="/order"
          aria-disabled={!canOrder}
          className={cx(
            "block text-center rounded-xl py-3 font-semibold shadow-lg",
            canOrder
              ? "bg-yellow-500 text-[#041F3E]"
              : "bg-white/10 text-white/60 cursor-not-allowed"
          )}
        >
          Order Fuel
        </a>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-4 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <a
            href="https://fuelflow.co.uk"
            aria-label="FuelFlow website"
            className="shrink-0"
          >
            <img src="/logo-email.png" alt="FuelFlow" className="h-7 w-auto" />
          </a>

          <div className="hidden sm:block text-sm text-white/70">
            Welcome back, <span className="font-medium">{userEmail}</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2">
              <a
                href="/order"
                aria-disabled={!canOrder}
                className={cx(
                  "h-9 inline-flex items-center rounded-lg px-3 text-sm font-semibold bg-yellow-500 text-[#041F3E] hover:bg-yellow-400",
                  !canOrder &&
                    "opacity-50 cursor-not-allowed pointer-events-none"
                )}
              >
                Order Fuel
              </a>
              <a
                href="/documents"
                className="h-9 inline-flex items-center rounded-lg bg-white/10 px-3 text-sm hover:bg-white/15"
              >
                Documents
              </a>
              <button
                onClick={() => loadAll()}
                className="h-9 inline-flex items-center rounded-lg bg_WHITE/10 px-3 text-sm hover:bg-white/15"
              >
                Refresh
              </button>
            </div>

            <button
              onClick={logout}
              className="h-9 inline-flex items-center rounded-lg bg-yellow-500 px-3 text-sm font-semibold text-[#041F3E] hover:bg-yellow-400"
            >
              Log out
            </button>
          </div>
        </div>

        {/* Top cards: Prices + Documents + AI Assistant */}
        <section className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <Card title="Petrol (95)">
            <div className="text-3xl font-bold">
              {petrolPrice != null ? gbp.format(petrolPrice) : "—"}
              <span className="text-base font-normal text-gray-300">
                {" "}
                / litre
              </span>
            </div>
            <div className="mt-1 text-xs text-white/60">
              Refreshed: {formatShortDMY(refreshedAt)}
            </div>
          </Card>

          <Card title="Diesel">
            <div className="text-3xl font-bold">
              {dieselPrice != null ? gbp.format(dieselPrice) : "—"}
              <span className="text-base font-normal text-gray-300">
                {" "}
                / litre
              </span>
            </div>
            <div className="mt-1 text-xs text-white/60">
              Refreshed: {formatShortDMY(refreshedAt)}
            </div>
          </Card>

          <div className="bg-gray-800 rounded-xl p-4 md:p-5">
            <p className="text-gray-400 mb-2">Documents</p>
            <a
              href="/documents"
              className="inline-flex items-center rounded-lg bg_WHITE/10 hover:bg-white/15 px-3 py-1.5 text-sm font-semibold"
            >
              Open documents
            </a>
          </div>

          <div className="bg-gray-800 rounded-xl p-3 md:p-4 flex flex-col">
            <p className="text-gray-400 mb-2 text-sm font-medium">
              AI Assistant
            </p>
            <div className="flex-1 min-h-[320px]">
              <OrderAIChat
                orders={orders.map((o) => ({
                  id: o.id,
                  created_at: o.created_at,
                  fuel: (o.fuel as string) ?? null,
                  litres: o.litres,
                  amount_gbp: o.amount_gbp,
                  fulfilment_status: o.fulfilment_status,
                }))}
                userEmail={userEmail}
              />
            </div>
          </div>
        </section>

        {/* Usage & Spend */}
        <section className="bg-gray-800/40 rounded-xl p-4 md:p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
            <h2 className="text-xl md:text-2xl font-semibold">
              Usage &amp; Spend
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-sm text-white/70">Year:</span>
              <div className="flex overflow-hidden rounded-lg bg_WHITE/10 text-sm">
                <button
                  onClick={() => setSelectedYear(currentYear - 1)}
                  disabled={selectedYear === currentYear - 1}
                  className={cx(
                    "px-3 py-1.5",
                    selectedYear === currentYear - 1
                      ? "bg-yellow-500 text-[#041F3E] font-semibold"
                      : "hover:bg-white/15"
                  )}
                >
                  {currentYear - 1}
                </button>
                <button
                  onClick={() => setSelectedYear(currentYear)}
                  disabled={selectedYear === currentYear}
                  className={cx(
                    "px-3 py-1.5",
                    selectedYear === currentYear
                      ? "bg-yellow-500 text-[#041F3E] font-semibold"
                      : "hover:bg-white/15"
                  )}
                >
                  {currentYear}
                </button>
              </div>
              <button
                onClick={() => setShowAllMonths((s) => !s)}
                className="ml-3 rounded-lg bg_WHITE/10 px-3 py-1.5 text-sm hover:bg-white/15"
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
                  <tr
                    key={`${selectedYear}-${r.monthIdx}`}
                    className="border-b border-gray-800/60"
                  >
                    <td className="py-2 pr-4">
                      {months[r.monthIdx]} {String(selectedYear).slice(2)}
                    </td>
                    <td className="py-2 pr-4 align-middle">
                      {Math.round(r.litres).toLocaleString()}
                      <div className="mt-1 h-1.5 w-full bg_WHITE/10 rounded">
                        <div
                          className="h-1.5 rounded bg-yellow-500/80"
                          style={{
                            width: `${(r.litres / maxLitres) * 100}%`,
                          }}
                        />
                      </div>
                    </td>
                    <td className="py-2 pr-4 align-middle">
                      {gbp.format(r.spend)}
                      <div className="mt-1 h-1.5 w-full bg_WHITE/10 rounded">
                        <div
                          className="h-1.5 rounded bg-white/40"
                          style={{
                            width: `${(r.spend / maxSpend) * 100}%`,
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

        {/* errors */}
        {error && (
          <div className="bg-red-800/60 border border-red-500 text-red-100 p-4 rounded">
            {error}
          </div>
        )}

        {/* My Orders */}
        <section className="bg-gray-800 rounded-xl p-4 md:p-6 mb-24 md:mb-0">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <h2 className="text-xl md:text-2xl font-semibold">
              My Orders{" "}
              <span className="text_WHITE/50 text-sm">({orders.length})</span>
            </h2>
            <div className="flex items-center gap-2">
              {orders.length > 20 && (
                <>
                  {!hasMore ? (
                    <button
                      onClick={() => setVisibleCount(20)}
                      className="h-9 inline-flex items-center rounded bg-gray-700 hover:bg-gray-600 px-3 text-sm"
                    >
                      Collapse to last 20
                    </button>
                  ) : (
                    <button
                      onClick={() =>
                        setVisibleCount((n) =>
                          Math.min(n + 20, orders.length)
                        )
                      }
                      className="h-9 inline-flex items-center rounded bg-gray-700 hover:bg-gray-600 px-3 text-sm"
                    >
                      Show 20 more
                    </button>
                  )}
                </>
              )}
              <button
                onClick={() => loadAll()}
                className="h-9 inline-flex items-center rounded bg-gray-700 hover:bg-gray-600 px-3 text-sm"
              >
                Refresh
              </button>
            </div>
          </div>

          {loading ? (
            <div className="text-gray-300">Loading…</div>
          ) : orders.length === 0 ? (
            <div className="text-gray-400">
              No orders yet. Your orders will appear here.
            </div>
          ) : (
            <>
              {/* Mobile: cards */}
              <div className="md:hidden space-y-3">
                {visibleOrders.map((o) => {
                  const payment =
                    (o.payment_status || "").toLowerCase() || "pending";
                  const fulfil =
                    (o.fulfilment_status || "pending").toLowerCase();

                  const paymentIsGood =
                    payment === "succeeded" || payment === "paid";
                  const paymentIsBad =
                    payment === "failed" ||
                    payment === "canceled" ||
                    payment === "cancelled";

                  const fulfilIsDelivered = fulfil === "delivered";
                  const fulfilIsMoving =
                    fulfil === "dispatched" ||
                    fulfil === "out_for_delivery" ||
                    fulfil === "ordered";

                  return (
                    <div
                      key={o.id}
                      className="rounded-xl border border-white/10 bg_WHITE/[0.03] p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text_WHITE/60">
                          {new Date(o.created_at).toLocaleString()}
                        </div>
                        <div className="text-sm font-medium">
                          {gbp.format(o.amount_gbp)}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <div className="capitalize">
                          {(o.fuel as string) || "—"}
                        </div>
                        <div className="text-xs text_WHITE/70">
                          {o.litres ?? "—"} L
                        </div>
                      </div>

                      <div className="mt-2 grid grid-cols-1 gap-1.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text_WHITE/60">Payment:</span>
                          <span
                            className={cx(
                              "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] capitalize",
                              paymentIsGood &&
                                "bg-green-500/80 text-[#041F3E] font-semibold",
                              paymentIsBad &&
                                "bg-rose-500/80 text-[#041F3E] font-semibold",
                              !paymentIsGood &&
                                !paymentIsBad &&
                                "bg_WHITE/10 text_WHITE/80"
                            )}
                          >
                            {payment}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text_WHITE/60">Delivery:</span>
                          <span
                            className={cx(
                              "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] capitalize",
                              fulfilIsDelivered &&
                                "bg-green-500/80 text-[#041F3E] font-semibold",
                              fulfilIsMoving &&
                                !fulfilIsDelivered &&
                                "bg-yellow-500/80 text-[#041F3E] font-semibold",
                              !fulfilIsDelivered &&
                                !fulfilIsMoving &&
                                "bg_WHITE/10 text_WHITE/80"
                            )}
                          >
                            {fulfil}
                          </span>
                        </div>
                      </div>

                      {o.fulfilment_notes && (
                        <div className="mt-2 rounded-lg bg_WHITE/5 border border_WHITE/10 p-2">
                          <div className="text-[11px] text_WHITE/60 mb-0.5">
                            Message from FuelFlow:
                          </div>
                          <div className="text-xs leading-5 text_WHITE/90">
                            {o.fulfilment_notes}
                          </div>
                        </div>
                      )}

                      <div className="text-[10px] text_WHITE/40 mt-1">
                        Order ID: {o.id}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop: table */}
              <div className="hidden md:block overflow-x-auto">
                <div className="md:max-h-none max-h-[60vh] overflow-auto rounded-lg">
                  <table className="w-full text-left text-sm">
                    <thead className="text-gray-300 sticky top-0 bg-gray-800">
                      <tr className="border-b border-gray-700">
                        <th className="py-2 pr-4">Date</th>
                        <th className="py-2 pr-4">Product</th>
                        <th className="py-2 pr-4">Litres</th>
                        <th className="py-2 pr-4">Amount</th>
                        <th className="py-2 pr-4">Payment</th>
                        <th className="py-2 pr-4">Delivery</th>
                        <th className="py-2 pr-4">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleOrders.map((o) => {
                        const payment =
                          (o.payment_status || "").toLowerCase() || "pending";
                        const fulfil =
                          (o.fulfilment_status || "pending").toLowerCase();

                        const paymentIsGood =
                          payment === "succeeded" || payment === "paid";
                        const paymentIsBad =
                          payment === "failed" ||
                          payment === "canceled" ||
                          payment === "cancelled";

                        const fulfilIsDelivered = fulfil === "delivered";
                        const fulfilIsMoving =
                          fulfil === "dispatched" ||
                          fulfil === "out_for_delivery" ||
                          fulfil === "ordered";

                        return (
                          <tr key={o.id} className="border-b border-gray-800">
                            <td className="py-2 pr-4 whitespace-nowrap">
                              {new Date(o.created_at).toLocaleString()}
                            </td>
                            <td className="py-2 pr-4 capitalize">
                              {(o.fuel as string) || "—"}
                            </td>
                            <td className="py-2 pr-4">{o.litres ?? "—"}</td>
                            <td className="py-2 pr-4">
                              {gbp.format(o.amount_gbp)}
                            </td>
                            <td className="py-2 pr-4">
                              <span
                                className={cx(
                                  "inline-flex items-center rounded px-2 py-0.5 text-xs capitalize",
                                  paymentIsGood &&
                                    "bg-green-600/80 text-[#041F3E] font-semibold",
                                  paymentIsBad &&
                                    "bg-rose-500/80 text-[#041F3E] font-semibold",
                                  !paymentIsGood &&
                                    !paymentIsBad &&
                                    "bg-gray-600/70"
                                )}
                              >
                                {payment}
                              </span>
                            </td>
                            <td className="py-2 pr-4">
                              <span
                                className={cx(
                                  "inline-flex items-center rounded px-2 py-0.5 text-xs capitalize",
                                  fulfilIsDelivered &&
                                    "bg-green-600/80 text-[#041F3E] font-semibold",
                                  fulfilIsMoving &&
                                    !fulfilIsDelivered &&
                                    "bg-yellow-500/80 text-[#041F3E] font-semibold",
                                  !fulfilIsDelivered &&
                                    !fulfilIsMoving &&
                                    "bg-gray-600/70"
                                )}
                              >
                                {fulfil}
                              </span>
                            </td>
                            <td className="py-2 pr-4 max-w-xs">
                              {o.fulfilment_notes ? (
                                <span
                                  className="text-xs text_WHITE/80"
                                  title={o.fulfilment_notes}
                                >
                                  {truncate(o.fulfilment_notes, 70)}
                                </span>
                              ) : (
                                <span className="text-xs text_WHITE/40">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {orders.length > 20 && (
                  <div className="mt-3 flex items-center justify-center gap-2">
                    {hasMore ? (
                      <button
                        onClick={() =>
                          setVisibleCount((n) =>
                            Math.min(n + 20, orders.length)
                          )
                        }
                        className="rounded-lg bg_WHITE/10 px-4 py-2 text-sm hover:bg-white/15"
                      >
                        Show 20 more
                      </button>
                    ) : (
                      <button
                        onClick={() => setVisibleCount(20)}
                        className="rounded-lg bg_WHITE/10 px-4 py-2 text-sm hover:bg-white/15"
                      >
                        Collapse to last 20
                      </button>
                    )}
                    <div className="text-xs text_WHITE/60">
                      Showing{" "}
                      <b>{Math.min(visibleCount, orders.length)}</b> of{" "}
                      <b>{orders.length}</b>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {/* bottom refresh date */}
        <div className="text-center text-xs text_WHITE/50">
          Refreshed: {formatShortDMY(refreshedAt)}
        </div>
      </div>
    </div>
  );
}

/* =========================
   Server-side guard
   ========================= */

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const supabase = getServerSupabase(ctx);

  const { data: userRes, error: userErr } = await supabase.auth.getUser();

  if (userErr || !userRes?.user?.email) {
    return {
      redirect: { destination: "/login", permanent: false },
    };
  }

  const email = userRes.user.email.toLowerCase();

  // Blocked?
  try {
    const { data: blockedRows, error: blockedErr } = await supabase
      .from("blocked_users")
      .select("email")
      .eq("email", email)
      .limit(1);

    if (!blockedErr && blockedRows && blockedRows.length > 0) {
      return { redirect: { destination: "/blocked", permanent: false } };
    }
  } catch {
    // fall through
  }

  // Allowlist?
  try {
    const { data: allowRows, error: allowErr } = await supabase
      .from("email_allowlist")
      .select("email")
      .eq("email", email)
      .limit(1);

    if (!allowErr && (!allowRows || allowRows.length === 0)) {
      return { redirect: { destination: "/pending", permanent: false } };
    }
  } catch {
    // fall through
  }

  return { props: {} };
};

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

