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

  const rowsToShow = showAllMonths
    ? usageByMonth
    : usageByMonth.filter((r) => r.monthIdx === currentMonthIdx);

  /* =========================
     Render
     ========================= */

  const canOrder = pricesAreToday && petrolPrice != null && dieselPrice != null;

  return (
    <div className="min-h-screen bg-[#0b1220] text-white">
      {/* Sticky mobile CTA */}
      <div className="md:hidden fixed bottom-4 inset-x-4 z-40">
        <a
          href="/order"
          aria-disabled={!canOrder}
          className={cx(
            "block text-center rounded-xl py-3 font-semibold shadow-lg",
            canOrder ? "bg-yellow-500 text-[#041F3E]" : "bg-white/10 text-white/60 cursor-not-allowed"
          )}
        >
          Order Fuel
        </a>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-4 space-y-6">
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
                "rounded-lg px-3 py-2 text-sm font-semibold",
                canOrder ? "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400" : "bg-white/10 text-white/60 cursor-not-allowed"
              )}
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
        {(!pricesAreToday || petrolPrice == null || dieselPrice == null) && (
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

        {/* Top cards: Prices + Documents Hub */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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

          <DocumentsHub
            termsAcceptedAt={termsAcceptedAt}
            buy={buyContract}
            rent={rentContract}
          />
        </section>

        {/* Usage & Spend (condensed by default) */}
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
                {rowsToShow.map((r) => (
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
                          className={cx(
                            "inline-flex items-center rounded px-2 py-0.5 text-xs",
                            (o.status || "").toLowerCase() === "paid"
                              ? "bg-green-600/70"
                              : "bg-gray-600/70"
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

function StatusDot({ color = "gray" }: { color?: "green" | "yellow" | "red" | "gray" }) {
  const map = {
    green: "bg-emerald-400",
    yellow: "bg-yellow-400",
    red: "bg-red-400",
    gray: "bg-white/40",
  } as const;
  return <span className={cx("inline-block h-2.5 w-2.5 rounded-full", map[color])} />;
}

function DocTile({
  icon,
  title,
  subtitle,
  status,
  ctaLabel,
  href,
  muted,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  status:
    | { tone: "ok"; label: string }
    | { tone: "warn"; label: string }
    | { tone: "missing"; label: string };
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
    <div
      className={cx(
        "rounded-xl border p-4 backdrop-blur",
        muted ? "border-white/10 bg-white/[0.03]" : "border-white/10 bg-white/[0.06]"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold">{title}</h4>
            <span className={cx("text-xs rounded-full px-2 py-0.5", tone.badge)}>{status.label}</span>
            <StatusDot color={tone.dot as any} />
          </div>
          {subtitle && <div className="text-xs text-white/60 mt-0.5">{subtitle}</div>}
          <a
            href={href}
            className="mt-3 inline-flex items-center rounded-lg bg-white/10 hover:bg-white/15 px-3 py-1.5 text-sm"
          >
            {ctaLabel}
          </a>
        </div>
      </div>
    </div>
  );
}

function DocumentsHub({
  termsAcceptedAt,
  buy,
  rent,
}: {
  termsAcceptedAt: string | null;
  buy: ContractRow | null;
  rent: ContractRow | null;
}) {
  // Terms
  const termsStatus = termsAcceptedAt
    ? ({ tone: "ok", label: "Accepted" } as const)
    : ({ tone: "missing", label: "Missing" } as const);

  // Buy
  const buyStatus = !buy
    ? ({ tone: "missing", label: "Not signed" } as const)
    : buy.status === "approved"
    ? ({ tone: "ok", label: "Active" } as const)
    : buy.status === "signed"
    ? ({ tone: "warn", label: "Signed" } as const)
    : ({ tone: "missing", label: "Not signed" } as const);

  // Rent
  const rentStatus = !rent
    ? ({ tone: "missing", label: "Not signed" } as const)
    : rent.status === "approved"
    ? ({ tone: "ok", label: "Active" } as const)
    : rent.status === "signed"
    ? ({ tone: "warn", label: "Signed" } as const)
    : ({ tone: "missing", label: "Not signed" } as const);

  return (
    <div className="bg-gray-800 rounded-xl p-4 md:p-5">
      <p className="text-gray-400 mb-2">Documents</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Terms */}
        <DocTile
          icon={<DocIcon />}
          title="Terms & Conditions"
          subtitle={termsAcceptedAt ? `Accepted · ${shortDate(termsAcceptedAt)}` : "You must accept before ordering"}
          status={termsStatus}
          ctaLabel={termsAcceptedAt ? "View" : "Read & accept"}
          href={termsAcceptedAt ? "/terms" : "/terms?return=/order"}
        />

        {/* Buy */}
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

        {/* Rent */}
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

/* =========================
   Tiny inline icons
   ========================= */

function DocIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className="text-white/80">
      <path
        fill="currentColor"
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm0 0v6h6"
        opacity=".6"
      />
      <path
        fill="currentColor"
        d="M8 13h8v2H8zm0-4h5v2H8zm0 8h8v2H8z"
      />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className="text-white/80">
      <path
        fill="currentColor"
        d="M12 2l7 4v6c0 5-3.5 9-7 10c-3.5-1-7-5-7-10V6z"
        opacity=".6"
      />
      <path
        fill="currentColor"
        d="M12 6l4 2v3c0 3.5-2.3 6.3-4 7c-1.7-.7-4-3.5-4-7V8z"
      />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className="text-white/80">
      <path
        fill="currentColor"
        d="M3 21V7l9-4l9 4v14h-7v-5h-4v5z"
        opacity=".6"
      />
      <path
        fill="currentColor"
        d="M9 11h2v2H9zm4 0h2v2h-2zM9 15h2v2H9zm4 0h2v2h-2z"
      />
    </svg>
  );
}


