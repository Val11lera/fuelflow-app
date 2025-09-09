// src/pages/client-dashboard.tsx
// src/pages/client-dashboard.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* ===============================================
   Client Dashboard — Polished + Documents button
   =============================================== */

type Fuel = "petrol" | "diesel";
type ContractStatus = "draft" | "signed" | "approved" | "cancelled";
type TankOption = "buy" | "rent";

const TERMS_VERSION = "v1.1";
const INACTIVITY_MS =
  Number(process.env.NEXT_PUBLIC_IDLE_LOGOUT_MS ?? "") || 15 * 60 * 1000;

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

function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export default function ClientDashboard() {
  const [userEmail, setUserEmail] = useState<string>("");

  // prices
  const [petrolPrice, setPetrolPrice] = useState<number | null>(null);
  const [dieselPrice, setDieselPrice] = useState<number | null>(null);
  const [priceDate, setPriceDate] = useState<string | null>(null);
  const pricesAreToday = isToday(priceDate);

  // orders
  const [orders, setOrders] = useState<
    (OrderRow & { amountGBP: number; paymentStatus?: string })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // documents state (for quick summary + Documents button)
  const [termsAcceptedAt, setTermsAcceptedAt] = useState<string | null>(null);
  const [buyContract, setBuyContract] = useState<ContractRow | null>(null);
  const [rentContract, setRentContract] = useState<ContractRow | null>(null);

  // usage UI
  const currentYear = new Date().getFullYear();
  const currentMonthIdx = new Date().getMonth(); // 0..11
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [showAllMonths, setShowAllMonths] = useState<boolean>(false);

  // Auto logout
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
    const winEvents: (keyof WindowEventMap)[] = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
    ];
    winEvents.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    const onVisibility = () => reset();
    document.addEventListener("visibilitychange", onVisibility, { passive: true });
    reset();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      winEvents.forEach((e) => window.removeEventListener(e, reset));
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Load data
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

        // Prices
        await loadLatestPrices();

        // Terms
        await loadTerms(emailLower);

        // Contracts
        await loadContracts(emailLower);

        // Orders
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
          return { ...o, amountGBP, paymentStatus: payMap.get(o.id || "")?.status };
        });

        setOrders(withTotals);
      } catch (e: any) {
        setError(e?.message || "Failed to load dashboard.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadTerms(emailLower: string) {
    const { data } = await supabase
      .from("terms_acceptances")
      .select("accepted_at,version")
      .eq("email", emailLower)
      .eq("version", TERMS_VERSION)
      .order("accepted_at", { ascending: false })
      .limit(1);
    setTermsAcceptedAt(data?.[0]?.accepted_at ?? null);
  }

  async function loadContracts(emailLower: string) {
    const { data } = await supabase
      .from("contracts")
      .select("id,tank_option,status,signed_at,approved_at,created_at,email,pdf_url,pdf_storage_path")
      .eq("email", emailLower)
      .order("created_at", { ascending: false });
    const rows = (data || []) as ContractRow[];

    const latestBuy =
      rows.find((r) => r.tank_option === "buy" && (r.status === "approved" || r.status === "signed")) ??
      rows.find((r) => r.tank_option === "buy") ??
      null;

    const latestRent =
      rows.find((r) => r.tank_option === "rent" && (r.status === "approved" || r.status === "signed")) ??
      rows.find((r) => r.tank_option === "rent") ??
      null;

    setBuyContract(latestBuy);
    setRentContract(latestRent);
  }

  async function loadLatestPrices() {
    setPetrolPrice(null);
    setDieselPrice(null);
    setPriceDate(null);
    try {
      const { data } = await supabase
        .from("latest_prices")
        .select("fuel,total_price,price_date");
      if (data && data.length) {
        applyPriceRows(data as any[]);
        return;
      }
    } catch {}
    try {
      const { data } = await supabase
        .from("latest_fuel_prices_view")
        .select("fuel,total_price,price_date");
      if (data && data.length) {
        applyPriceRows(data as any[]);
        return;
      }
    } catch {}
    try {
      const { data } = await supabase
        .from("latest_prices_view")
        .select("fuel,total_price,price_date");
      if (data && data.length) {
        applyPriceRows(data as any[]);
        return;
      }
    } catch {}
    try {
      const { data } = await supabase
        .from("daily_prices")
        .select("fuel,total_price,price_date")
        .order("price_date", { ascending: false })
        .limit(200);
      if (data && data.length) {
        const seen = new Map<string, any>();
        for (const r of data) {
          const key = String(r.fuel).toLowerCase();
          if (!seen.has(key)) seen.set(key, r);
        }
        applyPriceRows(Array.from(seen.values()));
      }
    } catch {}
  }

  function applyPriceRows(
    rows: { fuel: string; total_price: number; price_date?: string | null }[]
  ) {
    let latest: string | null = null;
    rows.forEach((r) => {
      const f = String(r.fuel).toLowerCase();
      if (f === "petrol") setPetrolPrice(Number(r.total_price));
      if (f === "diesel") setDieselPrice(Number(r.total_price));
      if (r.price_date) {
        if (!latest || new Date(r.price_date) > new Date(latest)) latest = r.price_date;
      }
    });
    if (latest) setPriceDate(latest);
  }

  function refresh() {
    window.location.reload();
  }
  async function logout() {
    try {
      await supabase.auth.signOut();
    } finally {
      window.location.href = "/login";
    }
  }

  // Usage & spend
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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

  const ytd = usageByMonth.reduce(
    (acc, m) => ({ litres: acc.litres + m.litres, spend: acc.spend + m.spend }),
    { litres: 0, spend: 0 }
  );
  const maxL = Math.max(1, ...usageByMonth.map((x) => x.litres));
  const maxS = Math.max(1, ...usageByMonth.map((x) => x.spend));
  const rowsToShow = showAllMonths
    ? usageByMonth
    : usageByMonth.filter((r) => r.monthIdx === currentMonthIdx);

  const canOrder = pricesAreToday && petrolPrice != null && dieselPrice != null;

  const docSummary = [
    termsAcceptedAt ? "Terms accepted" : "Terms pending",
    buyContract
      ? buyContract.status === "approved"
        ? "Buy active"
        : "Buy signed"
      : "Buy not signed",
    rentContract
      ? rentContract.status === "approved"
        ? "Rent active"
        : "Rent signed"
      : "Rent not signed",
  ].join(" · ");

  return (
    <div className="min-h-screen bg-[#0a0f1c] text-white">
      {/* subtle glow */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-x-0 -top-36 h-72 bg-gradient-to-b from-yellow-500/10 via-transparent to-transparent blur-3xl" />
      </div>

      {/* Sticky mobile CTA */}
      <div className="md:hidden fixed bottom-4 inset-x-4 z-40">
        <a
          href="/order"
          aria-disabled={!canOrder}
          className={cx(
            "block text-center rounded-2xl py-3 font-semibold shadow-2xl",
            canOrder ? "bg-yellow-400 text-[#0a0f1c]" : "bg-white/10 text-white/60 cursor-not-allowed"
          )}
        >
          Order fuel
        </a>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-5 md:py-8 space-y-6">
        {/* Header */}
        <header className="flex items-center gap-3">
          <img src="/logo-email.png" alt="FuelFlow" className="h-7 w-auto" />
          <span className="text-sm text-white/70 truncate">
            Welcome back, <b className="font-semibold text-white">{userEmail}</b>
          </span>
          <div className="ml-auto hidden md:flex gap-2">
            <a
              href="/order"
              aria-disabled={!canOrder}
              className={cx(
                "rounded-xl px-4 py-2 text-sm font-semibold transition",
                canOrder ? "bg-yellow-400 text-[#0a0f1c] hover:bg-yellow-300" : "bg-white/10 text-white/60 cursor-not-allowed"
              )}
            >
              Order fuel
            </a>
            <a
              href="/documents"
              className="rounded-xl px-4 py-2 text-sm font-semibold transition bg-white/10 hover:bg-white/15"
            >
              Documents
            </a>
            <button onClick={refresh} className="rounded-xl bg-white/10 px-4 py-2 text-sm hover:bg-white/15">Refresh</button>
            <button onClick={logout} className="rounded-xl bg-white/10 px-4 py-2 text-sm hover:bg-white/15">Log out</button>
          </div>
        </header>

        {/* KPI strip */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="YTD LITRES" value={ytd.litres ? ytd.litres.toLocaleString() : "—"} />
          <StatCard label="YTD SPEND" value={gbp.format(ytd.spend || 0)} />
          <StatCard label="LATEST PETROL" value={petrolPrice != null ? `${gbp.format(petrolPrice)}/L` : "—"} hint={priceDate ? `As of ${new Date(priceDate).toLocaleDateString()}` : undefined} />
          <StatCard label="LATEST DIESEL" value={dieselPrice != null ? `${gbp.format(dieselPrice)}/L` : "—"} hint={priceDate ? `As of ${new Date(priceDate).toLocaleDateString()}` : undefined} />
        </section>

        {/* Prices + “Documents” button */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <PriceCard title="Petrol (95)" price={petrolPrice} priceDate={priceDate} />
          <PriceCard title="Diesel" price={dieselPrice} priceDate={priceDate} />
          <div className="rounded-2xl bg-[#0e1627] p-5 ring-1 ring-white/10 flex flex-col justify-between">
            <div>
              <p className="text-white/70 text-sm">Documents</p>
              <div className="mt-1 text-sm text-white/80">{docSummary}</div>
            </div>
            <div className="mt-4">
              <a
                href="/documents"
                className="inline-flex items-center rounded-xl bg-white/10 hover:bg-white/15 px-4 py-2 font-semibold"
              >
                Open documents
              </a>
            </div>
          </div>
        </section>

        {/* Usage */}
        <section className="rounded-2xl bg-white/[0.04] p-4 md:p-6 ring-1 ring-white/10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
            <h2 className="text-xl md:text-2xl font-semibold">Usage & Spend</h2>
            <div className="flex items-center gap-2">
              <span className="text-sm text-white/70">Year</span>
              <div className="flex overflow-hidden rounded-xl bg-white/10 text-sm">
                <button
                  onClick={() => setSelectedYear(currentYear - 1)}
                  disabled={selectedYear === currentYear - 1}
                  className={cx("px-3 py-1.5", selectedYear === currentYear - 1 ? "bg-yellow-400 text-[#0a0f1c] font-semibold" : "hover:bg-white/15")}
                >
                  {currentYear - 1}
                </button>
                <button
                  onClick={() => setSelectedYear(currentYear)}
                  disabled={selectedYear === currentYear}
                  className={cx("px-3 py-1.5", selectedYear === currentYear ? "bg-yellow-400 text-[#0a0f1c] font-semibold" : "hover:bg-white/15")}
                >
                  {currentYear}
                </button>
              </div>
              <button onClick={() => setShowAllMonths((s) => !s)} className="ml-1 rounded-xl bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15">
                {showAllMonths ? "Show current" : "Show 12 months"}
              </button>
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
                {(showAllMonths ? usageByMonth : rowsToShow).map((r) => (
                  <tr key={`${selectedYear}-${r.monthIdx}`} className="border-b border-white/5">
                    <td className="py-2 pr-4">{r.monthLabel} {String(selectedYear).slice(2)}</td>
                    <td className="py-2 pr-4 align-middle">
                      {Math.round(r.litres).toLocaleString()}
                      <div className="mt-1 h-2 w-full rounded bg-white/10">
                        <div className="h-2 rounded bg-yellow-400/80" style={{ width: `${(r.litres / Math.max(1, ...usageByMonth.map(x=>x.litres))) * 100}%` }} />
                      </div>
                    </td>
                    <td className="py-2 pr-4 align-middle">
                      {gbp.format(r.spend)}
                      <div className="mt-1 h-2 w-full rounded bg-white/10">
                        <div className="h-2 rounded bg-white/40" style={{ width: `${(r.spend / Math.max(1, ...usageByMonth.map(x=>x.spend))) * 100}%` }} />
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
          <div role="alert" className="rounded-2xl bg-red-600/15 border border-red-500/30 text-red-200 p-4">
            {error}
          </div>
        )}

        {/* Recent Orders */}
        <section className="rounded-2xl bg-[#0e1627] p-4 md:p-6 ring-1 ring-white/10 mb-24 md:mb-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl md:text-2xl font-semibold">Recent orders</h2>
            <button onClick={refresh} className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-sm">Refresh</button>
          </div>

          {loading ? (
            <SkeletonTable />
          ) : orders.length === 0 ? (
            <EmptyState
              title="No orders yet"
              subtitle="Your recent orders will appear here once you place an order."
              action={{ label: "Place your first order", href: "/order" }}
            />
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
                      <td className="py-2 pr-4 whitespace-nowrap">{new Date(o.created_at).toLocaleString()}</td>
                      <td className="py-2 pr-4 capitalize">{(o.fuel as string) || "—"}</td>
                      <td className="py-2 pr-4">{o.litres?.toLocaleString() ?? "—"}</td>
                      <td className="py-2 pr-4">{gbp.format(o.amountGBP)}</td>
                      <td className="py-2 pr-4">
                        <span
                          className={cx(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                            (o.status || "").toLowerCase() === "paid"
                              ? "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/20"
                              : "bg-white/10 text-white/80 ring-1 ring-white/10"
                          )}
                        >
                          <span
                            className={cx(
                              "h-1.5 w-1.5 rounded-full",
                              (o.status || "").toLowerCase() === "paid" ? "bg-emerald-400" : "bg-white/50"
                            )}
                          />
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

function StatCard({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] p-3 md:p-4 ring-1 ring-white/10">
      <div className="text-xs uppercase tracking-wide text-white/60">{label}</div>
      <div className="mt-1 text-lg md:text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-white/50">{hint}</div>}
    </div>
  );
}

function PriceCard({ title, price, priceDate }: { title: string; price: number | null; priceDate: string | null }) {
  return (
    <div className="rounded-2xl bg-[#0e1627] p-4 md:p-5 ring-1 ring-white/10">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white/70 text-sm">{title}</p>
          <div className="mt-1 text-3xl font-bold">
            {price != null ? gbp.format(price) : "—"}
            <span className="text-base font-normal text-white/60"> / L</span>
          </div>
          <div className="mt-1 text-xs text-white/60">
            {priceDate ? `As of ${new Date(priceDate).toLocaleDateString()}` : "As of —"}
          </div>
        </div>
        <div aria-hidden className="h-12 w-12 rounded-xl bg-yellow-400/10 ring-1 ring-yellow-400/20 flex items-center justify-center">
          <span className="text-yellow-300">£</span>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, subtitle, action }: { title: string; subtitle?: string; action?: { label: string; href: string } }) {
  return (
    <div className="rounded-2xl border border-white/10 p-6 text-center text-white/80">
      <div className="mx-auto mb-2 h-10 w-10 rounded-full bg-white/10 flex items-center justify-center">🛢️</div>
      <h3 className="font-semibold">{title}</h3>
      {subtitle && <p className="text-sm mt-1 text-white/70">{subtitle}</p>}
      {action && (
        <a href={action.href} className="mt-3 inline-flex rounded-xl bg-yellow-400 text-[#0a0f1c] px-4 py-2 text-sm font-semibold">
          {action.label}
        </a>
      )}
    </div>
  );
}

function SkeletonTable() {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-9 w-full animate-pulse rounded bg-white/5" />
      ))}
    </div>
  );
}

