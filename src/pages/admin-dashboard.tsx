// src/pages/admin-dashboard.tsx
// src/pages/admin-dashboard.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* =========================
   Supabase
   ========================= */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

type Fuel = "diesel" | "petrol" | string;

type OrderRow = {
  id: string;
  created_at: string;
  user_email: string | null;
  fuel: Fuel | null;
  litres: number | null;
  unit_price_pence: number | null;
  total_pence: number | null;
  status: string | null;
};

type PaymentRow = {
  id?: string;
  order_id: string | null;
  amount: number | null; // pence
  currency: string | null;
  status: string | null;
  email: string | null;
  cs_id?: string | null; // checkout session
  pi_id?: string | null; // payment intent
  created_at?: string | null;
};

/* =========================
   Helpers
   ========================= */

const gbpFmt = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}
function toGBP(pence?: number | null) {
  if (pence == null) return 0;
  return pence / 100;
}
function startOfYear(d = new Date()) {
  return new Date(d.getFullYear(), 0, 1);
}
function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function labelForRange(r: "month" | "90d" | "ytd" | "all") {
  switch (r) {
    case "month":
      return "This month";
    case "90d":
      return "Last 90 days";
    case "ytd":
      return "Year to date";
    default:
      return "All time";
  }
}
function dateRange(r: "month" | "90d" | "ytd" | "all") {
  switch (r) {
    case "month":
      return { from: startOfMonth(), to: null as Date | null };
    case "90d":
      return { from: daysAgo(90), to: null as Date | null };
    case "ytd":
      return { from: startOfYear(), to: null as Date | null };
    case "all":
    default:
      return { from: null as Date | null, to: null as Date | null };
  }
}

/* =========================
   Page
   ========================= */

export default function AdminDashboard() {
  const [me, setMe] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  // Date/search filters
  type Range = "month" | "90d" | "ytd" | "all";
  const [range, setRange] = useState<Range>("month");
  const [search, setSearch] = useState<string>("");

  // NEW: customer filter (email)
  const [customerFilter, setCustomerFilter] = useState<string>("all");

  // Orders & Payments
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Collapsible sections
  const [openOrders, setOpenOrders] = useState(true);
  const [openPayments, setOpenPayments] = useState(false);
  const [openInvoices, setOpenInvoices] = useState(false);

  // Pagination (orders)
  const ORDERS_STEP = 20;
  const [ordersShown, setOrdersShown] = useState<number>(ORDERS_STEP);

  // Status filters
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("all");

  // Invoice browser (by customer email)
  const [invEmail, setInvEmail] = useState<string>("");
  const [invYear, setInvYear] = useState<string>("");
  const [invMonth, setInvMonth] = useState<string>("");
  const [invYears, setInvYears] = useState<string[]>([]);
  const [invMonths, setInvMonths] = useState<string[]>([]);
  const [invFiles, setInvFiles] = useState<{ name: string; path: string; last_modified?: string; size?: number }[]>([]);
  const [invLoading, setInvLoading] = useState<boolean>(false);

  // ---------- Auth + admin check ----------
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const email = (auth?.user?.email || "").toLowerCase();
      if (!email) {
        window.location.href = "/login";
        return;
      }
      setMe(email);

      const { data, error } = await supabase
        .from("admins")
        .select("email")
        .eq("email", email)
        .maybeSingle();

      if (error) {
        setError(error.message);
        setIsAdmin(false);
        return;
      }
      setIsAdmin(!!data?.email);
    })();
  }, []);

  // Redirect non-admins cleanly
  useEffect(() => {
    if (isAdmin === false && typeof window !== "undefined") {
      window.location.replace("/client-dashboard");
    }
  }, [isAdmin]);

  // ---------- Load business data ----------
  useEffect(() => {
    if (isAdmin !== true) return;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const { from, to } = dateRange(range);

        // Orders
        let oq = supabase
          .from("orders")
          .select("id, created_at, user_email, fuel, litres, unit_price_pence, total_pence, status")
          .order("created_at", { ascending: false })
          .limit(1000);
        if (from) oq = oq.gte("created_at", from.toISOString());
        if (to) oq = oq.lte("created_at", to.toISOString());
        const { data: od, error: oe } = await oq;
        if (oe) throw oe;

        // Payments
        let pq = supabase
          .from("payments")
          .select("order_id, amount, currency, status, email, cs_id, pi_id, created_at")
          .order("created_at", { ascending: false })
          .limit(1000);
        if (from) pq = pq.gte("created_at", from.toISOString());
        if (to) pq = pq.lte("created_at", to.toISOString());
        const { data: pd, error: pe } = await pq;
        if (pe) throw pe;

        setOrders((od || []) as OrderRow[]);
        setPayments((pd || []) as PaymentRow[]);
        setOrdersShown(ORDERS_STEP);
      } catch (e: any) {
        setError(e?.message || "Failed to load admin data");
      } finally {
        setLoading(false);
      }
    })();
  }, [isAdmin, range]);

  // ---------- Customer list for dropdown ----------
  const customerOptions = useMemo(() => {
    const s = new Set<string>();
    orders.forEach((o) => (o.user_email ? s.add(o.user_email.toLowerCase()) : null));
    payments.forEach((p) => (p.email ? s.add(p.email.toLowerCase()) : null));
    return ["all", ...Array.from(s).sort((a, b) => a.localeCompare(b))];
  }, [orders, payments]);

  // ---------- Derived KPIs + status options ----------
  const orderStatusOptions = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => {
      const s = (o.status || "").toLowerCase();
      if (s) set.add(s);
    });
    return ["all", ...Array.from(set).sort()];
  }, [orders]);

  const paymentStatusOptions = useMemo(() => {
    const set = new Set<string>();
    payments.forEach((p) => {
      const s = (p.status || "").toLowerCase();
      if (s) set.add(s);
    });
    return ["all", ...Array.from(set).sort()];
  }, [payments]);

  // Apply filters to Orders
  const filteredOrders = useMemo(() => {
    const s = search.trim().toLowerCase();
    return orders.filter((o) => {
      const statusOk = orderStatusFilter === "all" || (o.status || "").toLowerCase() === orderStatusFilter;
      if (!statusOk) return false;

      const customerOk =
        customerFilter === "all" ||
        (o.user_email || "").toLowerCase() === customerFilter;

      if (!customerOk) return false;

      if (!s) return true;
      return (
        (o.user_email || "").toLowerCase().includes(s) ||
        (o.fuel || "").toLowerCase().includes(s) ||
        (o.status || "").toLowerCase().includes(s) ||
        (o.id || "").toLowerCase().includes(s)
      );
    });
  }, [orders, search, orderStatusFilter, customerFilter]);
  const visibleOrders = useMemo(
    () => filteredOrders.slice(0, ordersShown),
    [filteredOrders, ordersShown]
  );

  // Apply filters to Payments
  const filteredPayments = useMemo(() => {
    const s = search.trim().toLowerCase();
    return payments.filter((p) => {
      const statusOk = paymentStatusFilter === "all" || (p.status || "").toLowerCase() === paymentStatusFilter;
      if (!statusOk) return false;

      const customerOk = customerFilter === "all" || (p.email || "").toLowerCase() === customerFilter;
      if (!customerOk) return false;

      if (!s) return true;
      return (
        (p.email || "").toLowerCase().includes(s) ||
        (p.order_id || "").toLowerCase().includes(s) ||
        (p.pi_id || "").toLowerCase().includes(s) ||
        (p.cs_id || "").toLowerCase().includes(s)
      );
    });
  }, [payments, search, paymentStatusFilter, customerFilter]);

  const sumLitres = filteredOrders.reduce((a, b) => a + (b.litres || 0), 0);
  const sumRevenue = filteredOrders.reduce((a, b) => a + toGBP(b.total_pence), 0);
  const paidCount = filteredOrders.filter((o) => (o.status || "").toLowerCase() === "paid").length;

  /* ===== Usage & Spend (yearly view with progress bars) ===== */

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];
  const currentYear = new Date().getFullYear();
  const currentMonthIdx = new Date().getMonth();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [showAllMonths, setShowAllMonths] = useState<boolean>(false);

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
      base[m].spend += toGBP(o.total_pence);
    });
    return base;
  }, [orders, selectedYear]);

  const rowsToShow = showAllMonths
    ? usageByMonth
    : usageByMonth.filter((r) => r.monthIdx === currentMonthIdx);

  const maxL = Math.max(1, ...usageByMonth.map((x) => x.litres));
  const maxS = Math.max(1, ...usageByMonth.map((x) => x.spend));

  // ---------- Invoice browser helpers ----------
  function resetInvoiceBrowser() {
    setInvYears([]);
    setInvMonths([]);
    setInvFiles([]);
    setInvYear("");
    setInvMonth("");
  }
  async function loadYears() {
    resetInvoiceBrowser();
    if (!invEmail) return;
    setInvLoading(true);
    try {
      const email = invEmail.toLowerCase();
      const { data, error } = await supabase.storage.from("invoices").list(`${email}`, {
        limit: 1000,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw error;
      const years = (data || [])
        .filter((x) => x.name.match(/^\d{4}$/))
        .map((x) => x.name);
      setInvYears(years);
    } catch (e: any) {
      setError(e?.message || "Failed to list years");
    } finally {
      setInvLoading(false);
    }
  }
  async function loadMonths(year: string) {
    setInvYear(year);
    setInvMonths([]);
    setInvFiles([]);
    if (!invEmail || !year) return;
    setInvLoading(true);
    try {
      const email = invEmail.toLowerCase();
      const { data, error } = await supabase.storage.from("invoices").list(`${email}/${year}`, {
        limit: 1000,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw error;
      const monthsList = (data || [])
        .filter((x) => x.name.match(/^(0[1-9]|1[0-2])$/))
        .map((x) => x.name);
      setInvMonths(monthsList);
    } catch (e: any) {
      setError(e?.message || "Failed to list months");
    } finally {
      setInvLoading(false);
    }
  }
  async function loadFiles(month: string) {
    setInvMonth(month);
    setInvFiles([]);
    if (!invEmail || !invYear || !month) return;
    setInvLoading(true);
    try {
      const email = invEmail.toLowerCase();
      const prefix = `${email}/${invYear}/${month}`;
      const { data, error } = await supabase.storage.from("invoices").list(prefix, {
        limit: 1000,
        sortBy: { column: "name", order: "desc" },
      });
      if (error) throw error;
      const files =
        (data || [])
          .filter((x) => x.name.toLowerCase().endsWith(".pdf"))
          .map((x) => ({
            name: x.name,
            path: `${prefix}/${x.name}`,
            last_modified: (x as any).updated_at || undefined,
            size: x.metadata?.size,
          })) || [];
      setInvFiles(files);
    } catch (e: any) {
      setError(e?.message || "Failed to list invoices");
    } finally {
      setInvLoading(false);
    }
  }
  async function getSignedUrl(path: string) {
    const { data, error } = await supabase.storage.from("invoices").createSignedUrl(path, 60 * 10);
    if (error) throw error;
    return data.signedUrl;
  }

  /* =========================
     Render
     ========================= */

  if (isAdmin === null) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#0b1220] text-white">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-6 py-4 text-white/80">Checking admin…</div>
      </div>
    );
  }
  if (isAdmin === false) return null;

  return (
    <div className="min-h-screen bg-[#0b1220] text-white overflow-x-hidden">
      {/* Header */}
      <div className="sticky top-0 z-30 border-b border-white/10 bg-[#0b1220]/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">
          <img src="/logo-email.png" alt="FuelFlow" className="h-7 w-auto" />
          <div className="hidden sm:block text-sm text-white/70">
            Signed in as <span className="font-medium">{me}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <a href="/client-dashboard" className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15">
              Client view
            </a>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = "/login";
              }}
              className="rounded-lg bg-yellow-500 px-3 py-1.5 text-sm font-semibold text-[#041F3E] hover:bg-yellow-400"
            >
              Log out
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-5 space-y-6">
        {/* KPIs */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <KpiCard label="Revenue" value={gbpFmt.format(sumRevenue)} />
          <KpiCard label="Litres" value={Math.round(sumLitres).toLocaleString()} />
          <KpiCard label="Orders" value={filteredOrders.length.toLocaleString()} />
          <KpiCard label="Paid Orders" value={paidCount.toLocaleString()} />
        </section>

        {/* Controls */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="rounded-lg bg-white/5 p-1 w-full sm:w-auto">
            {(["month", "90d", "ytd", "all"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cx(
                  "px-3 py-1.5 text-sm rounded-md w-1/2 sm:w-auto",
                  range === r ? "bg-yellow-500 text-[#041F3E] font-semibold" : "hover:bg-white/10"
                )}
              >
                {labelForRange(r)}
              </button>
            ))}
          </div>

          {/* NEW: Customer dropdown */}
          <div className="flex gap-2 w-full sm:w-auto">
            <label className="flex-1 sm:flex-none inline-flex items-center gap-2 text-sm">
              <span className="text-white/70">Customer:</span>
              <select
                value={customerFilter}
                onChange={(e) => setCustomerFilter(e.target.value)}
                className="min-w-[12rem] max-w-[18rem] flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm outline-none focus:ring focus:ring-yellow-500/30"
              >
                {customerOptions.map((email) => (
                  <option key={email} value={email}>
                    {email === "all" ? "All customers" : email}
                  </option>
                ))}
              </select>
            </label>

            {/* Convenience: push selected customer into the invoice browser */}
            <button
              type="button"
              disabled={customerFilter === "all"}
              onClick={() => {
                if (customerFilter !== "all") {
                  setInvEmail(customerFilter);
                  loadYears();
                  setOpenInvoices(true);
                }
              }}
              className={cx(
                "rounded-lg px-3 py-1.5 text-sm",
                customerFilter === "all"
                  ? "bg-white/10 text-white/60 cursor-not-allowed"
                  : "bg-white/10 hover:bg-white/15"
              )}
              title="Open the invoice browser for this customer"
            >
              Use in Invoice Browser
            </button>
          </div>

          <div className="relative sm:ml-auto w-full sm:w-80">
            <input
              placeholder="Search email, product, status, order id"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:ring focus:ring-yellow-500/30"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {!!search && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 text-xs"
                onClick={() => setSearch("")}
              >
                clear
              </button>
            )}
          </div>
        </div>

        {/* Usage & Spend */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-6">
          <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="text-2xl font-semibold">Usage &amp; Spend</h2>
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
                className="ml-2 rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
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
                      {months[r.monthIdx]} {String(selectedYear).slice(2)}
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
                      {gbpFmt.format(r.spend)}
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

        {/* Orders */}
        <Accordion
          title="Orders"
          subtitle={`${visibleOrders.length} of ${filteredOrders.length}`}
          open={openOrders}
          onToggle={() => setOpenOrders((s) => !s)}
          loading={loading}
          error={error}
          right={
            <StatusSelect
              value={orderStatusFilter}
              onChange={setOrderStatusFilter}
              options={orderStatusOptions}
              label="Status"
            />
          }
        >
          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {visibleOrders.map((o) => (
              <div key={o.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{(o.fuel || "—").toString().toUpperCase()}</div>
                  <span
                    className={cx(
                      "ml-2 inline-flex items-center rounded px-2 py-0.5 text-[11px]",
                      (o.status || "").toLowerCase() === "paid" ? "bg-green-600/70" : "bg-gray-600/70"
                    )}
                  >
                    {(o.status || "pending").toLowerCase()}
                  </span>
                </div>
                <div className="mt-1 text-[13px] text-white/80">{o.user_email || "—"}</div>
                <div className="mt-2 flex flex-wrap gap-3 text-sm">
                  <Badge label="Litres" value={String(o.litres ?? "—")} />
                  <Badge label="Amount" value={gbpFmt.format(toGBP(o.total_pence))} />
                  <Badge label="Date" value={new Date(o.created_at).toLocaleString()} />
                </div>
                <div className="mt-2 grid grid-cols-1 gap-1">
                  <CodeRow label="Order" value={o.id} />
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-white/70">
                <tr className="border-b border-white/10">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Product</th>
                  <th className="py-2 pr-4">Litres</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Order ID</th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((o) => (
                  <tr key={o.id} className="border-b border-white/5">
                    <td className="py-2 pr-4 whitespace-nowrap">{new Date(o.created_at).toLocaleString()}</td>
                    <td className="py-2 pr-4">{o.user_email}</td>
                    <td className="py-2 pr-4 capitalize">{o.fuel || "—"}</td>
                    <td className="py-2 pr-4">{o.litres ?? "—"}</td>
                    <td className="py-2 pr-4">{gbpFmt.format(toGBP(o.total_pence))}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={cx(
                          "inline-flex items-center rounded px-2 py-0.5 text-xs",
                          (o.status || "").toLowerCase() === "paid" ? "bg-green-600/70" : "bg-gray-600/70"
                        )}
                      >
                        {(o.status || "pending").toLowerCase()}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-mono text-[11px] break-all">{o.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {visibleOrders.length < filteredOrders.length && (
            <div className="mt-3 text-center">
              <button
                onClick={() => setOrdersShown((n) => n + ORDERS_STEP)}
                className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
              >
                Load 20 more
              </button>
            </div>
          )}
        </Accordion>

        {/* Payments */}
        <Accordion
          title="Payments"
          subtitle={`${filteredPayments.length} rows`}
          open={openPayments}
          onToggle={() => setOpenPayments((s) => !s)}
          right={
            <StatusSelect
              value={paymentStatusFilter}
              onChange={setPaymentStatusFilter}
              options={paymentStatusOptions}
              label="Status"
            />
          }
        >
          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {filteredPayments.length === 0 ? (
              <div className="text-white/60 text-sm">No rows.</div>
            ) : (
              filteredPayments.map((p, i) => (
                <div key={i} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{gbpFmt.format(toGBP(p.amount))}</div>
                    <span
                      className={cx(
                        "inline-flex items-center rounded px-2 py-0.5 text-[11px]",
                        p.status === "succeeded" || p.status === "paid" ? "bg-green-600/70" : "bg-gray-600/70"
                      )}
                    >
                      {(p.status || "—").toLowerCase()}
                    </span>
                  </div>
                  <div className="mt-1 text-[13px] text-white/80">{p.email || "—"}</div>

                  <div className="mt-2 flex flex-wrap gap-3 text-sm">
                    <Badge label="Date" value={p.created_at ? new Date(p.created_at).toLocaleString() : "—"} />
                    <Badge label="Order" value={p.order_id || "—"} />
                  </div>

                  <div className="mt-2 grid grid-cols-1 gap-1">
                    <CodeRow label="PI" value={p.pi_id || "—"} />
                    <CodeRow label="Session" value={p.cs_id || "—"} />
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-white/70">
                <tr className="border-b border-white/10">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Order ID</th>
                  <th className="py-2 pr-4">PI</th>
                  <th className="py-2 pr-4">Session</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-3 text-white/60">
                      No rows.
                    </td>
                  </tr>
                ) : (
                  filteredPayments.map((p, i) => (
                    <tr key={i} className="border-b border-white/5">
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {p.created_at ? new Date(p.created_at).toLocaleString() : "—"}
                      </td>
                      <td className="py-2 pr-4">{p.email || "—"}</td>
                      <td className="py-2 pr-4">{gbpFmt.format(toGBP(p.amount))}</td>
                      <td className="py-2 pr-4">
                        <span
                          className={cx(
                            "inline-flex items-center rounded px-2 py-0.5 text-xs",
                            p.status === "succeeded" || p.status === "paid" ? "bg-green-600/70" : "bg-gray-600/70"
                          )}
                        >
                          {(p.status || "—").toLowerCase()}
                        </span>
                      </td>
                      <td className="py-2 pr-4 font-mono text-[11px] break-all">{p.order_id || "—"}</td>
                      <td className="py-2 pr-4 font-mono text-[11px] break-all">{p.pi_id || "—"}</td>
                      <td className="py-2 pr-4 font-mono text-[11px] break-all">{p.cs_id || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Accordion>

        {/* Invoice browser */}
        <Accordion
          title="Invoice Browser"
          subtitle="Pick email → year → month"
          open={openInvoices}
          onToggle={() => setOpenInvoices((s) => !s)}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-white/70 mb-1">Customer email</label>
              <div className="flex gap-2">
                <input
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:ring focus:ring-yellow-500/30"
                  placeholder="name@company.com"
                  value={invEmail}
                  onChange={(e) => setInvEmail(e.target.value)}
                  list="all-customers"
                />
                <datalist id="all-customers">
                  {customerOptions
                    .filter((e) => e !== "all")
                    .map((email) => (
                      <option key={email} value={email} />
                    ))}
                </datalist>
                <button onClick={loadYears} className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15">
                  Load
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs text-white/70 mb-1">Year</label>
              <select
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                value={invYear}
                onChange={(e) => loadMonths(e.target.value)}
              >
                <option value="">—</option>
                {invYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-white/70 mb-1">Month</label>
              <select
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                value={invMonth}
                onChange={(e) => loadFiles(e.target.value)}
              >
                <option value="">—</option>
                {invMonths.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            {invLoading ? (
              <div className="text-white/70">Loading…</div>
            ) : invFiles.length === 0 ? (
              <div className="text-white/60 text-sm">No invoices to show.</div>
            ) : (
              <table className="w-full text-left text-sm min-w-[520px]">
                <thead className="text-white/70">
                  <tr className="border-b border-white/10">
                    <th className="py-2 pr-4">Invoice PDF</th>
                    <th className="py-2 pr-4">Last modified</th>
                    <th className="py-2 pr-4">Size</th>
                    <th className="py-2 pr-4">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {invFiles.map((f) => (
                    <tr key={f.path} className="border-b border-white/5">
                      <td className="py-2 pr-4">{f.name}</td>
                      <td className="py-2 pr-4">
                        {f.last_modified ? new Date(f.last_modified).toLocaleString() : "—"}
                      </td>
                      <td className="py-2 pr-4">{f.size ? `${Math.round(f.size / 1024)} KB` : "—"}</td>
                      <td className="py-2 pr-4">
                        <button
                          className="rounded bg-yellow-500 text-[#041F3E] font-semibold text-xs px-2 py-1 hover:bg-yellow-400"
                          onClick={async () => {
                            try {
                              const url = await getSignedUrl(f.path);
                              window.open(url, "_blank");
                            } catch (e: any) {
                              setError(e?.message || "Failed to open");
                            }
                          }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Accordion>

        <footer className="py-6 text-center text-xs text-white/50">
          FuelFlow Admin • {new Date().getFullYear()}
        </footer>

        {error && (
          <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 p-2 text-sm text-rose-200">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================
   Components
   ========================= */

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cx("h-5 w-5 transition-transform", open ? "rotate-90" : "rotate-0")}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M8 5l8 7-8 7" />
    </svg>
  );
}

function Accordion({
  title,
  subtitle,
  right,
  open,
  onToggle,
  loading,
  error,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  loading?: boolean;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03]">
      <div className="w-full flex flex-col gap-2 px-4 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <button onClick={onToggle} className="flex items-center gap-3 text-left" aria-expanded={open}>
          <Chevron open={open} />
          <div className="font-semibold">{title}</div>
          {subtitle && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/80">{subtitle}</span>
          )}
        </button>
        {right && <div className="pb-3 sm:pb-0">{right}</div>}
      </div>
      {open && (
        <div className="px-3 pb-3">
          {loading ? (
            <div className="px-1 py-2 text-white/70">Loading…</div>
          ) : error ? (
            <div className="mx-1 rounded border border-rose-400/40 bg-rose-500/10 p-3 text-rose-200 text-sm">
              {error}
            </div>
          ) : (
            children
          )}
        </div>
      )}
    </section>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 sm:p-4">
      <div className="text-xs sm:text-sm text-white/70">{label}</div>
      <div className="mt-1 text-xl sm:text-2xl font-semibold">{value}</div>
    </div>
  );
}

function Badge({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-white/5 px-2.5 py-1 text-[12px]">
      <span className="text-white/60">{label}: </span>
      <span>{value}</span>
    </div>
  );
}

/** Small select used for status filters */
function StatusSelect({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-white/70">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm outline-none focus:ring focus:ring-yellow-500/30"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A mobile-friendly code line with copy button that wraps safely */
function CodeRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0 text-xs text-white/60">{label}:</span>
      <div className="min-w-0 flex-1 rounded bg-white/5 px-2 py-1">
        <code className="block font-mono text-[11px] break-all leading-5">{value}</code>
      </div>
      <button
        onClick={copy}
        className="shrink-0 rounded bg-white/10 px-2 py-1 text-[11px] hover:bg-white/15"
        aria-label={`Copy ${label}`}
        title={`Copy ${label}`}
      >
        {copied ? "✓" : "Copy"}
      </button>
    </div>
  );
}

