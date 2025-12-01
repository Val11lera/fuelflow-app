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
type UsageReminder = {
  showReminder: boolean;
  message?: string;
  percentFull?: number;
  daysSinceLastDelivery?: number;
  estimatedLitresLeft?: number;
  contractTankSize?: number | null;
  contractMonthlyConsumption?: number | null;
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

  // smart usage reminder
  const [reminder, setReminder] = useState<UsageReminder | null>(null);
  const [reminderExpanded, setReminderExpanded] = useState(false);

   
  // orders (all fetched, then sliced for table)
  const [orders, setOrders] = useState<OrderWithExtras[]>([]);
  const [visibleCount, setVisibleCount] = useState<number>(20);
  const [error, setError] = useState<string | null>(null);

  // usage UI
  const currentYear = new Date().getFullYear();
  const currentMonthIdx = new Date().getMonth();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [showAllMonths, setShowAllMonths] = useState<boolean>(false);

  // support modal
  const [supportOpen, setSupportOpen] = useState(false);

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

            await Promise.all([
        loadLatestPrices(),
        loadOrders(lower),
        loadUsageReminder(lower),
      ]);


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

    // payments
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
      const payment_status = pay?.status ?? o.status ?? null;

      return {
        ...o,
        amount_gbp,
        payment_status,
      };
    });

    setOrders(withTotals);
    setVisibleCount(20);
  }

  // ------------ Latest prices ------------
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
      const v = n > 10 ? n / 100 : n;
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

     // ---------- Usage reminder (AI-style hint) ----------
  // ---------- Usage reminder (AI-style hint, calculated here) ----------
  async function loadUsageReminder(emailLower: string) {
    try {
      // 1) Find relevant contracts for this email
      const { data: contractsData, error: contractsError } = await supabase
        .from("contracts")
        .select(
          "id, email, customer_name, company_name, contact_name, tank_size_l, monthly_consumption_l, status, signed_at"
        )
        .in("status", ["signed", "approved"])
        .not("signed_at", "is", null)
        .eq("email", emailLower)
        .gt("tank_size_l", 0)
        .gt("monthly_consumption_l", 0)
        .limit(10);

      if (contractsError) throw contractsError;

      const contracts = (contractsData || []) as any[];

      if (!contracts.length) {
        setReminder(null);
        return;
      }

      // Pick the newest contract (by signed_at)
      const contract = [...contracts].sort((a, b) => {
        const da = a.signed_at ? new Date(a.signed_at).getTime() : 0;
        const db = b.signed_at ? new Date(b.signed_at).getTime() : 0;
        return db - da;
      })[0];

      const tankSize: number | null = contract.tank_size_l;
      const monthly: number | null = contract.monthly_consumption_l;

      if (!tankSize || !monthly) {
        setReminder(null);
        return;
      }

      // 2) Latest delivered order for this email
      const { data: ordersData, error: ordersError } = await supabase
        .from("orders")
        .select(
          "id, created_at, delivered_at, litres, fulfilment_status, status"
        )
        .eq("user_email", emailLower)
        .eq("fulfilment_status", "delivered")
        .not("delivered_at", "is", null)
        .order("delivered_at", { ascending: false })
        .limit(1);

      if (ordersError) throw ordersError;

      const last = (ordersData || [])[0] as any | undefined;

      if (!last) {
        setReminder(null);
        return;
      }

      // 3) Estimate current level
      const lastDeliveryDate = new Date(
        last.delivered_at || last.created_at
      );
      if (isNaN(lastDeliveryDate.getTime())) {
        setReminder(null);
        return;
      }

      const now = new Date();
      const msPerDay = 1000 * 60 * 60 * 24;
      const daysSince =
        (now.getTime() - lastDeliveryDate.getTime()) / msPerDay;

      const dailyUsage = monthly / 30; // rough approximation
      const litresUsed = dailyUsage * daysSince;
      const litresLeft = tankSize - litresUsed;

      // percentFull is 0–1 (the UI multiplies by 100)
      const percentFull = Math.max(
        0,
        Math.min(1, litresLeft / tankSize)
      );

      // Only show reminder if we think they are below ~30% full
      if (percentFull > 0.3) {
        setReminder(null);
        return;
      }

      const displayName: string =
        contract.customer_name ||
        contract.company_name ||
        contract.contact_name ||
        emailLower;

      const message = `Based on your contract tank size of ${tankSize.toLocaleString()}L and estimated usage of ${monthly.toLocaleString()}L/month, it looks like your tank may be around ${Math.round(
        percentFull * 100
      )}% full. If you’d like us to arrange a top-up delivery, you can place an order or contact our team.`;

      setReminder({
        showReminder: true,
        message,
        percentFull,
        daysSinceLastDelivery: Math.round(daysSince),
        estimatedLitresLeft: litresLeft,
        contractTankSize: tankSize,
        contractMonthlyConsumption: monthly,
      });
    } catch {
      // fail silently – this is just a hint, never block dashboard
      setReminder(null);
    }
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

  // ---------- Usage & Spend ----------
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
          <div className="mt-16 rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
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
      {/* Sticky mobile CTA for ordering */}
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
                className="h-9 inline-flex items-center rounded-lg bg-white/10 px-3 text-sm hover:bg-white/15"
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

        {/* Top cards: Prices + Documents */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

          <div className="bg-gray-800 rounded-xl p-4 md:p-5 flex flex-col justify-between">
            <div>
              <p className="text-gray-400 mb-2">Documents</p>
              <p className="text-xs text-white/60 mb-3">
                Invoices, receipts and other documents for your account.
              </p>
            </div>
            <a
              href="/documents"
              className="inline-flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/15 px-3 py-1.5 text-sm font-semibold"
            >
              Open documents
            </a>
          </div>
        </section>

              {/* Smart usage reminder card */}
        {reminder && (
          <section className="rounded-xl border border-yellow-400/40 bg-yellow-500/10 p-4 md:p-5">
            <div className="flex items-start gap-3">
              {/* Icon bubble */}
              <div className="mt-0.5 h-7 w-7 rounded-full bg-yellow-400 flex items-center justify-center text-[#041F3E] text-sm font-bold">
                !
              </div>

              <div className="flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm md:text-base font-semibold text-yellow-100">
                      Smart usage reminder
                    </h2>
                    <p className="mt-1 text-xs md:text-sm text-yellow-50/90">
                      We monitor your tank size and typical usage. When we think
                      you may be getting low, we&apos;ll gently suggest
                      scheduling a top-up — no pressure, just a helpful nudge.
                    </p>
                  </div>
                  {/* Close only hides this session – shows again next login */}
                  <button
                    onClick={() => setReminder(null)}
                    className="ml-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-yellow-400/90 text-[#041F3E] text-sm font-semibold hover:bg-yellow-300"
                    aria-label="Hide reminder"
                  >
                    ✕
                  </button>
                </div>

                {reminder.message && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setReminderExpanded((s) => !s)}
                      className="inline-flex items-center rounded-lg bg-yellow-400/90 px-3 py-1.5 text-xs md:text-sm font-semibold text-[#041F3E] hover:bg-yellow-300"
                    >
                      {reminderExpanded
                        ? "Hide our latest estimate"
                        : "View our latest estimate"}
                    </button>

                    {typeof reminder.percentFull === "number" && (
                      <span className="text-[11px] md:text-xs text-yellow-100/90">
                        Estimated tank level:{" "}
                        <strong>
                          {Math.round(reminder.percentFull * 100)}%
                        </strong>
                      </span>
                    )}

                    {typeof reminder.daysSinceLastDelivery === "number" && (
                      <span className="text-[11px] md:text-xs text-yellow-100/90">
                        Last delivery: ~
                        <strong>{reminder.daysSinceLastDelivery}</strong> days
                        ago
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {reminder.message && reminderExpanded && (
              <div className="mt-3 rounded-lg border border-yellow-400/50 bg-[#0b1220]/70 p-3 text-xs md:text-sm text-yellow-50/95">
                <p>{reminder.message}</p>

                {typeof reminder.estimatedLitresLeft === "number" &&
                  reminder.contractTankSize && (
                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 text-[11px] md:text-xs">
                      <div>
                        <div className="text-yellow-100/80">
                          Estimated litres remaining
                        </div>
                        <div className="font-semibold">
                          {reminder.estimatedLitresLeft.toLocaleString()} L
                        </div>
                      </div>
                      <div>
                        <div className="text-yellow-100/80">
                          Contract tank size
                        </div>
                        <div className="font-semibold">
                          {reminder.contractTankSize.toLocaleString()} L
                        </div>
                      </div>
                    </div>
                  )}
              </div>
            )}
          </section>
        )}

         
        {/* Usage & Spend */}
        <section className="bg-gray-800/40 rounded-xl p-4 md:p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
            <h2 className="text-xl md:text-2xl font-semibold">
              Usage &amp; Spend
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-sm text-white/70">Year:</span>
              <div className="flex overflow-hidden rounded-lg bg-white/10 text-sm">
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
                  <tr
                    key={`${selectedYear}-${r.monthIdx}`}
                    className="border-b border-gray-800/60"
                  >
                    <td className="py-2 pr-4">
                      {months[r.monthIdx]} {String(selectedYear).slice(2)}
                    </td>
                    <td className="py-2 pr-4 align-middle">
                      {Math.round(r.litres).toLocaleString()}
                      <div className="mt-1 h-1.5 w-full bg-white/10 rounded">
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
                      <div className="mt-1 h-1.5 w-full bg-white/10 rounded">
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
              <span className="text-white/50 text-sm">({orders.length})</span>
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
                      className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-white/60">
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
                        <div className="text-xs text-white/70">
                          {o.litres ?? "—"} L
                        </div>
                      </div>

                      <div className="mt-2 grid grid-cols-1 gap-1.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-white/60">Payment:</span>
                          <span
                            className={cx(
                              "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] capitalize",
                              paymentIsGood &&
                                "bg-green-500/80 text-[#041F3E] font-semibold",
                              paymentIsBad &&
                                "bg-rose-500/80 text-[#041F3E] font-semibold",
                              !paymentIsGood &&
                                !paymentIsBad &&
                                "bg-white/10 text-white/80"
                            )}
                          >
                            {payment}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-white/60">Delivery:</span>
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
                                "bg-white/10 text-white/80"
                            )}
                          >
                            {fulfil}
                          </span>
                        </div>
                      </div>

                      {o.fulfilment_notes && (
                        <div className="mt-2 rounded-lg bg-white/5 border border-white/10 p-2">
                          <div className="text-[11px] text-white/60 mb-0.5">
                            Message from FuelFlow:
                          </div>
                          <div className="text-xs leading-5 text-white/90">
                            {o.fulfilment_notes}
                          </div>
                        </div>
                      )}

                      <div className="text-[10px] text-white/40 mt-1">
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
                                  className="text-xs text-white/80"
                                  title={o.fulfilment_notes}
                                >
                                  {truncate(o.fulfilment_notes, 70)}
                                </span>
                              ) : (
                                <span className="text-xs text-white/40">—</span>
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
                        className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
                      >
                        Show 20 more
                      </button>
                    ) : (
                      <button
                        onClick={() => setVisibleCount(20)}
                        className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
                      >
                        Collapse to last 20
                      </button>
                    )}
                    <div className="text-xs text-white/60">
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
        <div className="text-center text-xs text-white/50">
          Refreshed: {formatShortDMY(refreshedAt)}
        </div>
      </div>

      {/* Floating "Need help?" button – bright & attention-grabbing */}
      <button
        onClick={() => setSupportOpen(true)}
        className="
          fixed
          z-50
          right-4
          bottom-24
          md:right-6
          md:bottom-6
          inline-flex items-center gap-2
          rounded-full
          bg-yellow-500
          px-4 py-2
          shadow-xl shadow-yellow-900/50
          text-sm font-semibold text-[#041F3E]
          hover:bg-yellow-400
          focus:outline-none focus:ring-2 focus:ring-yellow-300
          animate-bounce
        "
      >
        <span className="hidden md:inline">Need help?</span>
        <span className="md:hidden">Help</span>
      </button>

      {/* Support modal – larger for readability */}
      {supportOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center px-3 md:px-6">
          {/* backdrop */}
          <button
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSupportOpen(false)}
            aria-label="Close support"
          />
          {/* panel */}
          <div className="relative z-10 w-full max-w-3xl md:max-w-4xl w-[96%] md:w-[90%] max-h-[90vh] rounded-2xl bg-slate-900 border border-white/10 shadow-2xl flex flex-col">
            {/* drag handle */}
            <div className="flex items-center justify-center pt-3">
              <div className="h-1 w-16 rounded-full bg-white/25" />
            </div>

            <div className="flex items-center justify-between px-5 pt-3 pb-2">
              <div>
                <h2 className="text-base md:text-lg font-semibold text-white">
                  Need help with your account?
                </h2>
                <p className="text-xs md:text-sm text-white/65">
                  Ask a question and our assistant will reply instantly. If you
                  need a person to step in, just say so and our team can review
                  this thread.
                </p>
              </div>
              <button
                onClick={() => setSupportOpen(false)}
                className="ml-3 inline-flex h-8 items-center justify-center rounded-full bg-white/10 px-3 text-xs md:text-sm text-white hover:bg-white/20"
              >
                Close
              </button>
            </div>

            <div className="flex-1 px-4 pb-4">
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
        </div>
      )}
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


