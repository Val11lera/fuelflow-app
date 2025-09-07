"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

type Fuel = "petrol" | "diesel";

const supabase: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

type PriceRow = {
  fuel: Fuel | string;
  total_price: number;           // £/litre (numeric)
  price_date?: string | null;    // 'YYYY-MM-DD' if available
  updated_at?: string | null;    // timestamptz if available
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

const todayStr = () => new Date().toISOString().slice(0, 10);
function fmtDateTime(s?: string | null) {
  if (!s) return "—";
  try { return new Date(s).toLocaleString(); } catch { return "—"; }
}

export default function ClientDashboard() {
  const [userEmail, setUserEmail] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [prices, setPrices] = useState<Record<Fuel, PriceRow | null>>({
    petrol: null,
    diesel: null,
  });
  const [priceSourceTried, setPriceSourceTried] = useState<string[]>([]); // NEW: diagnostics

  const [orders, setOrders] = useState<
    (OrderRow & { amountGBP: number; paymentStatus?: string })[]
  >([]);

  // NEW: usage/spend view tab
  const [usageTab, setUsageTab] = useState<"month" | "year">("month");

  // auto-logout
  const LOGOUT_AFTER_MIN = 15;
  const logoutTimer = useRef<number | undefined>(undefined);
  function scheduleAutoLogout() {
    clearAutoLogout();
    logoutTimer.current = window.setTimeout(async () => {
      await supabase.auth.signOut();
      window.location.href = "/login";
    }, LOGOUT_AFTER_MIN * 60 * 1000);
  }
  function clearAutoLogout() { if (logoutTimer.current) window.clearTimeout(logoutTimer.current); }
  function wireInactivityResetters() {
    const reset = () => scheduleAutoLogout();
    ["click","keydown","scroll","mousemove","touchstart"].forEach((ev) =>
      window.addEventListener(ev, reset, { passive: true })
    );
    return () => ["click","keydown","scroll","mousemove","touchstart"].forEach((ev) =>
      window.removeEventListener(ev, reset)
    );
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
    if (dates.length < 2) return false;
    return dates.every((d) => d === t);
  }, [priceDates]);

  const orderDisabled = !arePricesToday;

  // loaders
  async function loadAuth() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) { window.location.href = "/login"; return null; }
    const emailLower = (auth.user.email || "").toLowerCase();
    setUserEmail(emailLower);
    return emailLower;
  }

  // ---- very defensive price loader (tries 4 sources) ----
  async function loadPrices() {
    const tried: string[] = [];
    let got: PriceRow[] = [];

    // 1) preferred: latest_daily_prices
    tried.push("latest_daily_prices");
    let r1 = await supabase
      .from("latest_daily_prices")
      .select("fuel,total_price,price_date,updated_at");
    if (r1.data && r1.data.length) got = r1.data as PriceRow[];

    // 2) latest_fuel_prices_view (your earlier script)
    if (!got.length) {
      tried.push("latest_fuel_prices_view");
      const r2 = await supabase
        .from("latest_fuel_prices_view")
        .select("fuel,total_price,price_date,updated_at");
      if (r2.data && r2.data.length) got = r2.data as PriceRow[];
    }

    // 3) latest_prices (if you created it)
    if (!got.length) {
      tried.push("latest_prices");
      const r3 = await supabase
        .from("latest_prices")
        .select("fuel,total_price,price_date,updated_at");
      if (r3.data && r3.data.length) got = r3.data as PriceRow[];
    }

    // 4) daily_prices max(price_date)
    if (!got.length) {
      tried.push("daily_prices(max price_date)");
      const { data: maxDate } = await supabase
        .from("daily_prices")
        .select("price_date")
        .order("price_date", { ascending: false })
        .limit(1);
      const d = maxDate?.[0]?.price_date;
      if (d) {
        const { data: rows } = await supabase
          .from("daily_prices")
          .select("fuel,total_price,price_date,updated_at")
          .eq("price_date", d);
        if (rows && rows.length) got = rows as PriceRow[];
      }
    }

    setPriceSourceTried(tried);

    const next: Record<Fuel, PriceRow | null> = { petrol: null, diesel: null };
    for (const r of got) {
      const f = String(r.fuel).toLowerCase() as Fuel;
      if (f === "petrol" || f === "diesel") next[f] = r;
    }
    setPrices(next);
  }

  async function loadOrders(emailLower: string) {
    const { data: rawOrders, error: ordErr } = await supabase
      .from("orders")
      .select("id,created_at,user_email,fuel,litres,unit_price_pence,total_pence,status")
      .eq("user_email", emailLower)
      .order("created_at", { ascending: false })
      .limit(200); // bump to have enough history for charts

    if (ordErr) throw ordErr;

    const ordersArr = (rawOrders || []) as OrderRow[];
    const ids = ordersArr.map((o) => o.id).filter(Boolean);

    // payments
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
      return { ...o, amountGBP, paymentStatus: payMap.get(o.id || "")?.status };
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

  useEffect(() => {
    loadAll();
    scheduleAutoLogout();
    const unWire = wireInactivityResetters();

    // realtime update when new daily_prices rows inserted
    const channel = supabase
      .channel("prices-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "daily_prices" }, () => loadPrices())
      .subscribe();

    return () => {
      clearAutoLogout();
      unWire();
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRefresh() { await loadAll(); }
  async function handleLogout() { await supabase.auth.signOut(); window.location.href = "/login"; }

  // --------- NEW: Usage & Spend data (client-side aggregates) ----------
  type Point = { label: string; litres: number; spend: number };

  const monthly: Point[] = useMemo(() => {
    // last 12 months inclusive
    const map = new Map<string, Point>();
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      map.set(key, { label: d.toLocaleString("en-GB", { month: "short" }), litres: 0, spend: 0 });
    }
    for (const o of orders) {
      const d = new Date(o.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      const row = map.get(key);
      if (row) {
        row.litres += o.litres ?? 0;
        row.spend += o.amountGBP ?? 0;
      }
    }
    return Array.from(map.values());
  }, [orders]);

  const yearly: Point[] = useMemo(() => {
    // last 4 years
    const map = new Map<number, Point>();
    const nowY = new Date().getFullYear();
    for (let y = nowY - 3; y <= nowY; y++) map.set(y, { label: String(y), litres: 0, spend: 0 });
    for (const o of orders) {
      const y = new Date(o.created_at).getFullYear();
      const row = map.get(y);
      if (row) { row.litres += o.litres ?? 0; row.spend += o.amountGBP ?? 0; }
    }
    return Array.from(map.entries()).sort((a,b)=>Number(a[0])-Number(b[0])).map(([,v])=>v);
  }, [orders]);

  const usageData = usageTab === "month" ? monthly : yearly;
  const maxLitres = Math.max(1, ...usageData.map(p => p.litres));
  const maxSpend  = Math.max(1, ...usageData.map(p => p.spend));

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
                orderDisabled ? "bg-gray-700 text-gray-300 cursor-not-allowed"
                               : "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400"
              }`}
            >
              Order Fuel
            </a>
            <button onClick={handleRefresh} className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15">
              Refresh
            </button>
            <button onClick={handleLogout} className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15">
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
            {/* tiny diagnostic helper when blank */}
            {!prices.petrol && !prices.diesel && (
              <div className="mt-2 text-xs text-red-300/80">
                Tried sources: {priceSourceTried.join(" → ")}.  
                If still blank, check RLS/grants on <code>daily_prices</code> and your views.
              </div>
            )}
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
              Last update: {prices.petrol?.updated_at ? fmtDateTime(prices.petrol.updated_at)
                : prices.petrol?.price_date || "—"}
            </div>
          </Card>

          <Card title="Diesel">
            <div className="text-3xl font-bold">
              {prices.diesel ? gbp.format(prices.diesel.total_price) : "—"}
              <span className="text-base font-normal text-white/70"> / litre</span>
            </div>
            <div className="mt-1 text-xs text-white/60">
              Last update: {prices.diesel?.updated_at ? fmtDateTime(prices.diesel.updated_at)
                : prices.diesel?.price_date || "—"}
            </div>
          </Card>

          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 md:p-5">
            <p className="text-white/80">Contracts</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <a href="/order#contracts" className="rounded-lg bg-white/10 px-3 py-2 text-center text-sm hover:bg-white/15">
                View / Start
              </a>
              <a href="/terms" className="rounded-lg bg-white/10 px-3 py-2 text-center text-sm hover:bg-white/15">
                Terms
              </a>
            </div>
          </div>
        </div>

        {/* NEW: Usage & Spend */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.05] p-4 md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl md:text-2xl font-semibold">Usage & Spend</h2>
            <div className="flex rounded-lg bg-white/10 text-sm">
              <button
                onClick={() => setUsageTab("month")}
                className={`px-3 py-1.5 rounded-l-lg ${usageTab==="month" ? "bg-yellow-500 text-[#041F3E] font-semibold" : "hover:bg-white/15"}`}
              >
                Month
              </button>
              <button
                onClick={() => setUsageTab("year")}
                className={`px-3 py-1.5 rounded-r-lg ${usageTab==="year" ? "bg-yellow-500 text-[#041F3E] font-semibold" : "hover:bg-white/15"}`}
              >
                Year
              </button>
            </div>
          </div>

          {usageData.every(p => p.litres===0 && p.spend===0) ? (
            <div className="text-white/70">No data yet.</div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {/* simple bar charts (no external libs) */}
              <div>
                <div className="mb-2 text-sm text-white/70">Litres</div>
                <div className="flex items-end gap-2 h-40">
                  {usageData.map((p, i) => (
                    <div key={i} className="flex-1">
                      <div
                        className="w-full rounded-t bg-yellow-500/80"
                        style={{ height: `${(p.litres / maxLitres) * 100 || 0}%` }}
                        title={`${p.label}: ${Math.round(p.litres).toLocaleString()} L`}
                      />
                      <div className="mt-1 text-center text-[11px] text-white/70">{p.label}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-sm text-white/70">Spend</div>
                <div className="flex items-end gap-2 h-40">
                  {usageData.map((p, i) => (
                    <div key={i} className="flex-1">
                      <div
                        className="w-full rounded-t bg-white/30"
                        style={{ height: `${(p.spend / maxSpend) * 100 || 0}%` }}
                        title={`${p.label}: ${gbp.format(p.spend)}`}
                      />
                      <div className="mt-1 text-center text-[11px] text-white/70">{p.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Orders */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.05] p-4 md:p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl md:text-2xl font-semibold">Recent Orders</h2>
            <button onClick={handleRefresh} className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15">
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
                            (o.status || "").toLowerCase() === "paid" ? "bg-green-600/70" : "bg-gray-600/70"
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

