// src/pages/client-dashboard.tsx
// src/pages/client-dashboard.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type Fuel = "petrol" | "diesel";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

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
  amount: number; // pence from webhook (amount_received)
  currency: string;
  status: string;
};

function displayAmount(row: any) {
  if (typeof row.total_pence === "number") return (row.total_pence / 100).toFixed(2);
  if (typeof row.unit_price_pence === "number" && typeof row.litres === "number") {
    return ((row.unit_price_pence * row.litres) / 100).toFixed(2);
  }
  return "0.00";
}

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

const INACTIVITY_MS =
  Number(process.env.NEXT_PUBLIC_IDLE_LOGOUT_MS ?? "") || 15 * 60 * 1000; // 15m

export default function ClientDashboard() {
  const [userEmail, setUserEmail] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // prices
  const [petrolPrice, setPetrolPrice] = useState<number | null>(null);
  const [dieselPrice, setDieselPrice] = useState<number | null>(null);
  const [priceDate, setPriceDate] = useState<string | null>(null); // from daily_prices max(date)
  const pricesAreToday = isToday(priceDate);

  // orders
  const [orders, setOrders] = useState<
    (OrderRow & { amountGBP: number; paymentStatus?: string })[]
  >([]);

  // usage / spend year toggle
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  // ----------------- auto logout on inactivity -----------------
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
    reset();
    const evts: (keyof WindowEventMap)[] = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "visibilitychange",
    ];
    evts.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      evts.forEach((e) => window.removeEventListener(e, reset));
    };
  }, []);

  // ---------- load profile + prices + orders ----------
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);

        // Auth
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) {
          window.location.href = "/login";
          return;
        }
        const emailLower = (auth.user.email || "").toLowerCase();
        setUserEmail(emailLower);

        // Prices (keep your original sources that worked)
        let { data: lp, error: lpErr } = await supabase
          .from("latest_prices")
          .select("fuel,total_price");
        if (lpErr) lp = null;

        if (!lp?.length) {
          const { data: dp } = await supabase
            .from("latest_daily_prices")
            .select("fuel,total_price");
          if (dp?.length) lp = dp as any;
        }

        if (lp?.length) {
          // reset
          setPetrolPrice(null);
          setDieselPrice(null);
          (lp as { fuel: Fuel | string; total_price: number }[]).forEach((r) => {
            const f = String(r.fuel).toLowerCase();
            if (f === "petrol") setPetrolPrice(Number(r.total_price));
            if (f === "diesel") setDieselPrice(Number(r.total_price));
          });
        }

        // Get the latest price date from daily_prices (no updated_at used)
        // If RLS prevents it, we just leave date null and skip the banner disabling.
        try {
          const { data: maxRow } = await supabase
            .from("daily_prices")
            .select("price_date")
            .order("price_date", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (maxRow?.price_date) setPriceDate(maxRow.price_date);
        } catch {
          // ignore; date will remain null
        }

        // Orders (new fields first)
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

        // Map Stripe payments by order_id (for exact fallback)
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

  // quick refresh handler (simple)
  async function refresh() {
    window.location.reload();
  }

  async function logout() {
    try {
      await supabase.auth.signOut();
    } finally {
      window.location.href = "/login";
    }
  }

  // ---------- Usage & Spend (12 months, selected year / prev year only) ----------
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];

  type MonthAgg = { monthIdx: number; monthLabel: string; litres: number; spend: number };
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
      base[m].spend += o.amountGBP ?? 0;
    });
    return base;
  }, [orders, selectedYear]);

  const maxL = Math.max(1, ...usageByMonth.map((x) => x.litres));
  const maxS = Math.max(1, ...usageByMonth.map((x) => x.spend));

  return (
    <div className="min-h-screen bg-[#0b1220] text-white">
      <div className="max-w-6xl mx-auto px-4 py-4 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <img src="/logo-email.png" alt="FuelFlow" className="h-7 w-auto" />
          <div className="text-sm text-white/70">
            Welcome back, <span className="font-medium">{userEmail}</span>
          </div>
          <div className="ml-auto flex gap-2">
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
              onClick={refresh}
              className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
            >
              Refresh
            </button>
            <button
              onClick={logout}
              className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
            >
              Log out
            </button>
          </div>
        </div>

        {/* Prices out-of-date banner */}
        {!pricesAreToday && (
          <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-200">
            <div className="font-semibold mb-1">Prices are out of date</div>
            <div>
              Today’s prices haven’t been loaded yet. Click{" "}
              <button className="underline decoration-yellow-400 underline-offset-2" onClick={refresh}>
                Refresh
              </button>{" "}
              to update. Ordering is disabled until today’s prices are available.
            </div>
          </div>
        )}

        {/* prices */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card title="Petrol (95)">
            <div className="text-3xl font-bold">
              {petrolPrice != null ? gbp.format(petrolPrice) : "—"}
              <span className="text-base font-normal text-gray-300"> / litre</span>
            </div>
            <div className="mt-1 text-xs text-white/60">
              {priceDate ? `As of ${new Date(priceDate).toLocaleDateString()}` : "As of —"}
            </div>
          </Card>
          <Card title="Diesel">
            <div className="text-3xl font-bold">
              {dieselPrice != null ? gbp.format(dieselPrice) : "—"}
              <span className="text-base font-normal text-gray-300"> / litre</span>
            </div>
            <div className="mt-1 text-xs text-white/60">
              {priceDate ? `As of ${new Date(priceDate).toLocaleDateString()}` : "As of —"}
            </div>
          </Card>
          <Card title="Contracts">
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
          </Card>
        </section>

        {/* Usage & Spend */}
        <section className="bg-gray-800/40 rounded-xl p-4 md:p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
            <h2 className="text-xl md:text-2xl font-semibold">Usage & Spend</h2>
            <div className="flex items-center gap-2">
              <span className="text-sm text-white/70">Year:</span>
              <div className="flex overflow-hidden rounded-lg bg-white/10 text-sm">
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
              <thead className="text-gray-300">
                <tr className="border-b border-gray-700/60">
                  <th className="py-2 pr-4">Month</th>
                  <th className="py-2 pr-4">Litres</th>
                  <th className="py-2 pr-4">Spend</th>
                </tr>
              </thead>
              <tbody>
                {usageByMonth.map((r) => (
                  <tr key={r.monthIdx} className="border-b border-gray-800/60">
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
        <section className="bg-gray-800 rounded-xl p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl md:text-2xl font-semibold">Recent Orders</h2>
            <button
              onClick={refresh}
              className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-sm"
            >
              Refresh
            </button>
          </div>

          {loading ? (
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
                      <td className="py-2 pr-4">
                        {new Date(o.created_at).toLocaleString()}
                      </td>
                      <td className="py-2 pr-4 capitalize">
                        {(o.fuel as string) || "—"}
                      </td>
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
      </div>
    </div>
  );
}

function Card(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-800 rounded-xl p-4 md:p-5">
      <p className="text-gray-400">{props.title}</p>
      <div className="mt-2">{props.children}</div>
    </div>
  );
}


