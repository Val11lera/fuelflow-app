// src/pages/client-dashboard.tsx
// src/pages/client-dashboard.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* ===============================================
   Client Dashboard — Professional Remix
   - Crisp layout
   - Mobile‑first, keyboard & screen‑reader friendly
   - Clean cards, subtle glass, high contrast
   - Sticky mobile CTA
   - Lightweight (pure Tailwind) — no extra deps
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

type TermsRow = {
  id: string;
  email: string;
  accepted_at: string;
  version: string;
};

type ContractRow = {
  id: string;
  tank_option: TankOption;
  status: ContractStatus;
  signed_at: string | null;
  approved_at: string | null;
  created_at: string;
  email: string | null;
};

/* =========================
   Helpers
   ========================= */

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

function shortDate(d?: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return "—";
  }
}

function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

/* =========================
   Page
   ========================= */

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

  // documents state
  const [termsAcceptedAt, setTermsAcceptedAt] = useState<string | null>(null);
  const [buyContract, setBuyContract] = useState<ContractRow | null>(null);
  const [rentContract, setRentContract] = useState<ContractRow | null>(null);

  // usage UI
  const currentYear = new Date().getFullYear();
  const currentMonthIdx = new Date().getMonth(); // 0..11
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [showAllMonths, setShowAllMonths] = useState<boolean>(false);

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

  // ----------------- Data loading -----------------
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

        // PRICES — robust loader with multiple fallbacks
        await loadLatestPrices();

        // TERMS — latest acceptance for this version
        await loadTerms(emailLower);

        // CONTRACTS — latest signed/approved per option
        await loadContracts(emailLower);

        // ORDERS
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadTerms(emailLower: string) {
    const { data } = await supabase
      .from("terms_acceptances")
      .select("id,email,accepted_at,version")
      .eq("email", emailLower)
      .eq("version", TERMS_VERSION)
      .order("accepted_at", { ascending: false })
      .limit(1);
    setTermsAcceptedAt(data?.[0]?.accepted_at ?? null);
  }

  async function loadContracts(emailLower: string) {
    const { data } = await supabase
      .from("contracts")
      .select("id,tank_option,status,signed_at,approved_at,created_at,email")
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

  // Robust latest-price loader
  async function loadLatestPrices() {
    setPetrolPrice(null);
    setDieselPrice(null);
    setPriceDate(null);

    // Try 1: latest_prices
    try {
      const { data } = await supabase
        .from("latest_prices")
        .select("fuel,total_price,price_date");
      if (data && data.length) {
        applyPriceRows(data as any[]);
        return;
      }
    } catch {}

    // Try 2: latest_fuel_prices_view
    try {
      const { data } = await supabase
        .from("latest_fuel_prices_view")
        .select("fuel,total_price,price_date");
      if (data && data.length) {
        applyPriceRows(data as any[]);
        return;
      }
    } catch {}

    // Try 3: latest_prices_view
    try {
      const { data } = await supabase
        .from("latest_prices_view")
        .select("fuel,total_price,price_date");
      if (data && data.length) {
        applyPriceRows(data as any[]);
        return;
      }
    } catch {}

    // Try 4: daily_prices fallback
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
        return;
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

  // ---------- Usage & Spend (by month, year) ----------
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

  const ytd = usageByMonth.reduce(
    (acc, m) => ({ litres: acc.litres + m.litres, spend: acc.spend + m.spend }),
    { litres: 0, spend: 0 }
  );

  const maxL = Math.max(1, ...usageByMonth.map((x) => x.litres));
  const maxS = Math.max(1, ...usageByMonth.map((x) => x.spend));

  const rowsToShow = showAllMonths
    ? usageByMonth
    : usageByMonth.filter((r) => r.monthIdx === currentMonthIdx);

  /* =========================
     Render
     ========================= */

  const canOrder = pricesAreToday && petrolPrice != null && dieselPrice != null;

  return (
    <div className="min-h-screen bg-[#0a0f1c] text-white">
      {/* Accent gradient */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-x-0 -top-32 h-72 bg-gradient-to-b from-yellow-500/10 via-transparent to-transparent blur-3xl" />
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
          <span className="text-sm text-white/70 truncate">Welcome back, <b className="font-semibold text-white">{userEmail}</b></span>
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
            <button onClick={refresh} className="rounded-xl bg-white/10 px-4 py-2 text-sm hover:bg-white/15">Refresh</button>
            <button onClick={logout} className="rounded-xl bg-white/10 px-4 py-2 text-sm hover:bg-white/15">Log out</button>
          </div>
        </header>

        {/* Prices out-of-date banner */}
        {(!pricesAreToday || petrolPrice == null || dieselPrice == null) && (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 md:p-5 text-sm text-red-200">
            <div className="font-semibold mb-1">Prices are out of date</div>
            <p>
              Today’s prices haven’t been loaded yet. <button className="underline decoration-yellow-400 underline-offset-2" onClick={refresh}>Refresh</button> to update. Ordering is disabled until today’s prices are available.
            </p>
          </div>
        )}

        {/* KPI strip */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="YTD Litres" value={ytd.litres ? ytd.litres.toLocaleString() : "—"} />
          <StatCard label="YTD Spend" value={gbp.format(ytd.spend || 0)} />
          <StatCard label="Latest Petrol" value={petrolPrice != null ? `${gbp.format(petrolPrice)}/L` : "—"} hint={priceDate ? `As of ${new Date(priceDate).toLocaleDateString()}` : undefined} />
          <StatCard label="Latest Diesel" value={dieselPrice != null ? `${gbp.format(dieselPrice)}/L` : "—"} hint={priceDate ? `As of ${new Date(priceDate).toLocaleDateString()}` : undefined} />
        </section>

        {/* Prices + Docs */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <PriceCard title="Petrol (95)" price={petrolPrice} priceDate={priceDate} />
          <PriceCard title="Diesel" price={dieselPrice} priceDate={priceDate} />
          <DocumentsHub termsAcceptedAt={termsAcceptedAt} buy={buyContract} rent={rentContract} />
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
                  className={cx(
                    "px-3 py-1.5",
                    selectedYear === currentYear - 1 ? "bg-yellow-400 text-[#0a0f1c] font-semibold" : "hover:bg-white/15"
                  )}
                >
                  {currentYear - 1}
                </button>
                <button
                  onClick={() => setSelectedYear(currentYear)}
                  disabled={selectedYear === currentYear}
                  className={cx(
                    "px-3 py-1.5",
                    selectedYear === currentYear ? "bg-yellow-400 text-[#0a0f1c] font-semibold" : "hover:bg-white/15"
                  )}
                >
                  {currentYear}
                </button>
              </div>
              <button onClick={() => setShowAllMonths((s) => !s)} className="ml-1 rounded-xl bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15">
                {showAllMonths ? "Show current" : "Show 12 months"}
              </button>
            </div>
          </div>

          {/* Bars - responsive, touch friendly */}
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
                { (showAllMonths ? usageByMonth : rowsToShow).map((r) => (
                  <tr key={`${selectedYear}-${r.monthIdx}`} className="border-b border-white/5">
                    <td className="py-2 pr-4">{r.monthLabel} {String(selectedYear).slice(2)}</td>
                    <td className="py-2 pr-4 align-middle">
                      {Math.round(r.litres).toLocaleString()}
                      <div className="mt-1 h-2 w-full rounded bg-white/10">
                        <div className="h-2 rounded bg-yellow-400/80" style={{ width: `${(r.litres / maxL) * 100}%` }} />
                      </div>
                    </td>
                    <td className="py-2 pr-4 align-middle">
                      {gbp.format(r.spend)}
                      <div className="mt-1 h-2 w-full rounded bg-white/10">
                        <div className="h-2 rounded bg-white/40" style={{ width: `${(r.spend / maxS) * 100}%` }} />
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
                        <span className={cx(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                          (o.status || "").toLowerCase() === "paid" ? "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/20" : "bg-white/10 text-white/80 ring-1 ring-white/10"
                        )}>
                          <span className={cx(
                            "h-1.5 w-1.5 rounded-full",
                            (o.status || "").toLowerCase() === "paid" ? "bg-emerald-400" : "bg-white/50"
                          )} />
                          {(o.status || o.paymentStatus || "pending").toLowerCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile stacked cards */}
              <div className="md:hidden space-y-3 mt-4">
                {orders.map((o) => (
                  <div key={`${o.id}-m`} className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                    <div className="flex items-center justify-between text-sm">
                      <div className="font-medium capitalize">{(o.fuel as string) || "—"}</div>
                      <span className={cx(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                        (o.status || "").toLowerCase() === "paid" ? "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/20" : "bg-white/10 text-white/80 ring-1 ring-white/10"
                      )}>
                        {(o.status || o.paymentStatus || "pending").toLowerCase()}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-white/70">{new Date(o.created_at).toLocaleString()}</div>
                    <div className="mt-2 grid grid-cols-3 text-sm">
                      <div>
                        <div className="text-white/60">Litres</div>
                        <div className="font-medium">{o.litres?.toLocaleString() ?? "—"}</div>
                      </div>
                      <div>
                        <div className="text-white/60">Amount</div>
                        <div className="font-medium">{gbp.format(o.amountGBP)}</div>
                      </div>
                      <div className="text-right self-end">
                        <a href={`/orders/${o.id}`} className="underline underline-offset-2 text-white/80">Details</a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
          <div className="mt-1 text-xs text-white/60">{priceDate ? `As of ${new Date(priceDate).toLocaleDateString()}` : "As of —"}</div>
        </div>
        <div aria-hidden className="h-12 w-12 rounded-xl bg-yellow-400/10 ring-1 ring-yellow-400/20 flex items-center justify-center">
          <span className="text-yellow-300">£</span>
        </div>
      </div>
    </div>
  );
}

function StatusDot({ color = "gray" }: { color?: "green" | "yellow" | "red" | "gray" }) {
  const map = {
    green: "bg-emerald-400",
    yellow: "bg-yellow-400",
    red: "bg-red-400",
    gray: "bg-white/40",
  } as const;
  return <span className={cx("inline-block h-2.5 w-2.5 rounded-full", map[color])} />;
}

function DocTile({ icon, title, subtitle, status, ctaLabel, href, muted, }: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  status: { tone: "ok"; label: string } | { tone: "warn"; label: string } | { tone: "missing"; label: string };
  ctaLabel: string;
  href: string;
  muted?: boolean;
}) {
  const toneMap = {
    ok: { dot: "green", badge: "bg-emerald-500/15 text-emerald-300" },
    warn: { dot: "yellow", badge: "bg-yellow-500/15 text-yellow-300" },
    missing: { dot: "red", badge: "bg-red-500/15 text-red-300" },
  } as const;
  const tone = toneMap[status.tone];

  return (
    <div className={cx("rounded-2xl p-4 ring-1 backdrop-blur", muted ? "ring-white/10 bg-white/5" : "ring-white/10 bg-white/10")}> 
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold">{title}</h4>
            <span className={cx("text-xs rounded-full px-2 py-0.5", tone.badge)}>{status.label}</span>
            <StatusDot color={tone.dot as any} />
          </div>
          {subtitle && <div className="text-xs text-white/60 mt-0.5">{subtitle}</div>}
          <a href={href} className="mt-3 inline-flex items-center rounded-xl bg-white/10 hover:bg-white/15 px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400">
            {ctaLabel}
          </a>
        </div>
      </div>
    </div>
  );
}

function DocumentsHub({ termsAcceptedAt, buy, rent, }: { termsAcceptedAt: string | null; buy: ContractRow | null; rent: ContractRow | null; }) {
  const termsStatus = termsAcceptedAt ? ({ tone: "ok", label: "Accepted" } as const) : ({ tone: "missing", label: "Missing" } as const);

  const buyStatus = !buy
    ? ({ tone: "missing", label: "Not signed" } as const)
    : buy.status === "approved"
    ? ({ tone: "ok", label: "Active" } as const)
    : buy.status === "signed"
    ? ({ tone: "warn", label: "Signed" } as const)
    : ({ tone: "missing", label: "Not signed" } as const);

  const rentStatus = !rent
    ? ({ tone: "missing", label: "Not signed" } as const)
    : rent.status === "approved"
    ? ({ tone: "ok", label: "Active" } as const)
    : rent.status === "signed"
    ? ({ tone: "warn", label: "Signed" } as const)
    : ({ tone: "missing", label: "Not signed" } as const);

  return (
    <div className="rounded-2xl bg-[#0e1627] p-4 md:p-5 ring-1 ring-white/10">
      <p className="text-white/70 mb-2">Documents</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <DocTile
          icon={<DocIcon />}
          title="Terms & Conditions"
          subtitle={termsAcceptedAt ? `Accepted · ${shortDate(termsAcceptedAt)}` : "You must accept before ordering"}
          status={termsStatus}
          ctaLabel={termsAcceptedAt ? "View" : "Read & accept"}
          href={termsAcceptedAt ? "/terms" : "/terms?return=/order"}
        />
        <DocTile
          icon={<ShieldIcon />}
          title="Buy Contract"
          subtitle={
            buy
              ? buy.status === "approved"
                ? `Active · ${shortDate(buy.approved_at)}`
                : `Signed · ${shortDate(buy.signed_at)}`
              : "Sign once — then you can order anytime"
          }
          status={buyStatus}
          ctaLabel={buy ? "Manage" : "Start"}
          href="/order#contract"
          muted={!buy}
        />
        <DocTile
          icon={<BuildingIcon />}
          title="Rent Contract"
          subtitle={
            rent
              ? rent.status === "approved"
                ? `Active · ${shortDate(rent.approved_at)}`
                : "Signed · awaiting approval"
              : "Needs admin approval after signing"
          }
          status={rentStatus}
          ctaLabel={rent ? "Manage" : "Start"}
          href="/order#contract"
          muted={!rent}
        />
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

/* =========================
   Tiny inline icons
   ========================= */

function DocIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className="text-white/80">
      <path fill="currentColor" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm0 0v6h6" opacity=".6" />
      <path fill="currentColor" d="M8 13h8v2H8zm0-4h5v2H8zm0 8h8v2H8z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className="text-white/80">
      <path fill="currentColor" d="M12 2l7 4v6c0 5-3.5 9-7 10c-3.5-1-7-5-7-10V6z" opacity=".6" />
      <path fill="currentColor" d="M12 6l4 2v3c0 3.5-2.3 6.3-4 7c-1.7-.7-4-3.5-4-7V8z" />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className="text-white/80">
      <path fill="currentColor" d="M3 21V7l9-4l9 4v14h-7v-5h-4v5z" opacity=".6" />
      <path fill="currentColor" d="M9 11h2v2H9zm4 0h2v2h-2zM9 15h2v2H9zm4 0h2v2h-2z" />
    </svg>
  );
}


