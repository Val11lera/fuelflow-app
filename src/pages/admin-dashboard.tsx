// src/pages/admin-dashboard.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* =========================================================
   Setup
   ========================================================= */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

// Allow multiple admins via comma-separated env (lowercased), always include the primary
const DEFAULT_ADMINS = ["fuelflow.queries@gmail.com"];
const EXTRA = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const ADMIN_EMAILS = Array.from(new Set([...DEFAULT_ADMINS, ...EXTRA]));

/* =========================================================
   Types
   ========================================================= */

type Fuel = "petrol" | "diesel" | string;

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
  cs_id?: string | null;
  pi_id?: string | null;
  email?: string | null;
  order_id?: string | null;
  amount?: number | null; // pence
  currency?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type InvoiceRow = {
  id: string;
  email: string;
  invoice_number: string;
  created_at: string;
  year: number;
  month: number; // 1-12
  path: string;  // storage path
  size_bytes?: number | null;
};

type CustomerAgg = {
  email: string;
  orders: number;
  litres: number;
  spend_pence: number;
  last_order_at: string | null;
};

/* =========================================================
   UI helpers
   ========================================================= */

function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}
const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const fmtDMYTime = (v?: string | null) =>
  v ? new Date(v).toLocaleString() : "—";
const penceToGBP = (n?: number | null) =>
  gbp.format(((n ?? 0) as number) / 100);

/* =========================================================
   Page
   ========================================================= */

export default function AdminDashboard() {
  const [me, setMe] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  // global filters
  type RangeKey = "month" | "90" | "ytd" | "all";
  const [range, setRange] = useState<RangeKey>("month");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"orders" | "payments" | "invoices" | "customers">("orders");

  // KPIs
  const [kpiRevenuePence, setKpiRevenuePence] = useState<number>(0);
  const [kpiLitres, setKpiLitres] = useState<number>(0);
  const [kpiOrders, setKpiOrders] = useState<number>(0);
  const [kpiPaidOrders, setKpiPaidOrders] = useState<number>(0);
  const [loadingKpis, setLoadingKpis] = useState(false);

  // data stores (paged)
  const PAGE = 20;

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ordersHasMore, setOrdersHasMore] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [paymentsHasMore, setPaymentsHasMore] = useState(true);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [invoicesHasMore, setInvoicesHasMore] = useState(true);
  const [invoicesLoading, setInvoicesLoading] = useState(false);

  const [customers, setCustomers] = useState<CustomerAgg[]>([]);
  const [customersHasMore, setCustomersHasMore] = useState(true);
  const [customersLoading, setCustomersLoading] = useState(false);

  // drawers
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTitle, setDrawerTitle] = useState<string>("");
  const [drawerContent, setDrawerContent] = useState<React.ReactNode>(null);

  // Admin gate
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const email = (auth?.user?.email || "").toLowerCase();
      setMe(email);
      setIsAdmin(ADMIN_EMAILS.includes(email));
    })();
  }, []);

  // date range boundaries (UTC naive)
  const rangeBounds = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    let from: string | null = null;
    switch (range) {
      case "month": {
        start.setDate(1);
        from = start.toISOString();
        break;
      }
      case "90": {
        start.setDate(now.getDate() - 89);
        from = start.toISOString();
        break;
      }
      case "ytd": {
        start.setMonth(0, 1);
        start.setHours(0, 0, 0, 0);
        from = start.toISOString();
        break;
      }
      case "all":
      default:
        from = null;
    }
    return { fromISO: from, toISO: null };
  }, [range]);

  // Load KPIs whenever range changes
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        setLoadingKpis(true);

        // revenue & litres & orders count in range
        let q = supabase.from("orders").select("total_pence, litres, status, created_at", { count: "exact" });
        if (rangeBounds.fromISO) q = q.gte("created_at", rangeBounds.fromISO);
        const { data, count } = await q;

        const totPence = (data || []).reduce((s: number, r: any) => s + (r.total_pence ?? 0), 0);
        const totLitres = (data || []).reduce((s: number, r: any) => s + (Number(r.litres ?? 0)), 0);
        const paid = (data || []).filter((r: any) => String(r.status || "").toLowerCase() === "paid").length;

        setKpiRevenuePence(totPence);
        setKpiLitres(totLitres);
        setKpiOrders(count || 0);
        setKpiPaidOrders(paid);
      } finally {
        setLoadingKpis(false);
      }
    })();
  }, [isAdmin, rangeBounds]);

  // Reset lists when filters change
  useEffect(() => {
    if (!isAdmin) return;
    resetAndLoad("orders");
    resetAndLoad("payments");
    resetAndLoad("invoices");
    resetAndLoad("customers");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, rangeBounds, search]);

  function resetAndLoad(kind: "orders" | "payments" | "invoices" | "customers") {
    switch (kind) {
      case "orders":
        setOrders([]); setOrdersHasMore(true);
        void loadMoreOrders();
        break;
      case "payments":
        setPayments([]); setPaymentsHasMore(true);
        void loadMorePayments();
        break;
      case "invoices":
        setInvoices([]); setInvoicesHasMore(true);
        void loadMoreInvoices();
        break;
      case "customers":
        setCustomers([]); setCustomersHasMore(true);
        void loadMoreCustomers();
        break;
    }
  }

  /* -------------------- loaders (paged) -------------------- */

  async function loadMoreOrders() {
    if (ordersLoading || !ordersHasMore) return;
    try {
      setOrdersLoading(true);

      let q = supabase
        .from("orders")
        .select(
          "id, created_at, user_email, fuel, litres, unit_price_pence, total_pence, status"
        )
        .order("created_at", { ascending: false });

      if (rangeBounds.fromISO) q = q.gte("created_at", rangeBounds.fromISO);

      const offset = orders.length;
      q = q.range(offset, offset + PAGE - 1);

      if (search.trim()) {
        // small client-side filter after fetch to keep query simple across fields
        const { data } = await q;
        const s = search.trim().toLowerCase();
        const filtered = (data || []).filter((r: any) =>
          (r.user_email || "").toLowerCase().includes(s) ||
          (r.fuel || "").toLowerCase().includes(s) ||
          (r.status || "").toLowerCase().includes(s) ||
          (r.id || "").toLowerCase().includes(s)
        ) as OrderRow[];
        setOrders((cur) => [...cur, ...filtered]);
        if ((data || []).length < PAGE) setOrdersHasMore(false);
      } else {
        const { data } = await q;
        setOrders((cur) => [...cur, ...((data || []) as OrderRow[])]);
        if ((data || []).length < PAGE) setOrdersHasMore(false);
      }
    } finally {
      setOrdersLoading(false);
    }
  }

  async function loadMorePayments() {
    if (paymentsLoading || !paymentsHasMore) return;
    try {
      setPaymentsLoading(true);
      let q = supabase
        .from("payments")
        .select("id, cs_id, pi_id, email, order_id, amount, currency, status, created_at")
        .order("created_at", { ascending: false });

      if (rangeBounds.fromISO) q = q.gte("created_at", rangeBounds.fromISO);

      const offset = payments.length;
      q = q.range(offset, offset + PAGE - 1);

      if (search.trim()) {
        const { data } = await q;
        const s = search.trim().toLowerCase();
        const filtered = (data || []).filter((r: any) =>
          (r.email || "").toLowerCase().includes(s) ||
          (r.status || "").toLowerCase().includes(s) ||
          (r.order_id || "").toLowerCase().includes(s) ||
          (r.pi_id || "").toLowerCase().includes(s)
        ) as PaymentRow[];
        setPayments((cur) => [...cur, ...filtered]);
        if ((data || []).length < PAGE) setPaymentsHasMore(false);
      } else {
        const { data } = await q;
        setPayments((cur) => [...cur, ...((data || []) as PaymentRow[])]);
        if ((data || []).length < PAGE) setPaymentsHasMore(false);
      }
    } finally {
      setPaymentsLoading(false);
    }
  }

  async function loadMoreInvoices() {
    if (invoicesLoading || !invoicesHasMore) return;
    try {
      setInvoicesLoading(true);

      // invoices table from earlier steps (if you followed the storage logging)
      let q = supabase
        .from("invoices")
        .select("id, email, invoice_number, created_at, year, month, path, size_bytes")
        .order("created_at", { ascending: false });

      if (rangeBounds.fromISO) q = q.gte("created_at", rangeBounds.fromISO);

      const offset = invoices.length;
      q = q.range(offset, offset + PAGE - 1);

      if (search.trim()) {
        const { data } = await q;
        const s = search.trim().toLowerCase();
        const filtered = (data || []).filter((r: any) =>
          (r.email || "").toLowerCase().includes(s) ||
          (r.invoice_number || "").toLowerCase().includes(s) ||
          (r.path || "").toLowerCase().includes(s)
        ) as InvoiceRow[];
        setInvoices((cur) => [...cur, ...filtered]);
        if ((data || []).length < PAGE) setInvoicesHasMore(false);
      } else {
        const { data } = await q;
        setInvoices((cur) => [...cur, ...((data || []) as InvoiceRow[])]);
        if ((data || []).length < PAGE) setInvoicesHasMore(false);
      }
    } finally {
      setInvoicesLoading(false);
    }
  }

  async function loadMoreCustomers() {
    if (customersLoading || !customersHasMore) return;
    try {
      setCustomersLoading(true);

      // simple server query + client aggregate would be heavy; assume you created a view:
      // create view admin_customers_summary as
      //   select user_email as email,
      //          count(*) as orders,
      //          sum(litres) as litres,
      //          sum(total_pence) as spend_pence,
      //          max(created_at) as last_order_at
      //   from orders group by 1;

      let q = supabase
        .from("admin_customers_summary")
        .select("email, orders, litres, spend_pence, last_order_at")
        .order("spend_pence", { ascending: false });

      // range filter: do a crude filter on last_order_at
      if (rangeBounds.fromISO) q = q.gte("last_order_at", rangeBounds.fromISO);

      const offset = customers.length;
      q = q.range(offset, offset + PAGE - 1);

      if (search.trim()) {
        const { data } = await q;
        const s = search.trim().toLowerCase();
        const filtered = (data || []).filter((r: any) =>
          (r.email || "").toLowerCase().includes(s)
        ) as CustomerAgg[];
        setCustomers((cur) => [...cur, ...filtered]);
        if ((data || []).length < PAGE) setCustomersHasMore(false);
      } else {
        const { data } = await q;
        setCustomers((cur) => [...cur, ...((data || []) as CustomerAgg[])]);
        if ((data || []).length < PAGE) setCustomersHasMore(false);
      }
    } finally {
      setCustomersLoading(false);
    }
  }

  /* -------------------- drawer helpers -------------------- */

  function openDrawer(title: string, content: React.ReactNode) {
    setDrawerTitle(title);
    setDrawerContent(content);
    setDrawerOpen(true);
  }

  /* =========================================================
     Render
     ========================================================= */

  if (isAdmin === null) {
    return <div className="min-h-screen bg-[#0b1220] text-white grid place-items-center">Checking access…</div>;
  }
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#0b1220] text-white grid place-items-center">
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white/80">
          You don’t have access to the admin dashboard.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b1220] text-white">
      {/* Sticky header */}
      <div className="sticky top-0 z-40 border-b border-white/10 bg-[#0b1220]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <img src="/logo-email.png" alt="FuelFlow" className="h-6 w-auto" />
          <div className="text-sm text-white/70">Signed in as {me}</div>
          <div className="ml-auto flex items-center gap-2">
            <a href="/client-dashboard" className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15">Client view</a>
            <button
              onClick={async () => { await supabase.auth.signOut(); window.location.href = "https://fuelflow.co.uk"; }}
              className="rounded-lg bg-yellow-500 px-3 py-1.5 text-sm font-semibold text-[#041F3E] hover:bg-yellow-400"
            >
              Log out
            </button>
          </div>
        </div>

        {/* KPI row */}
        <div className="mx-auto max-w-6xl px-4 pb-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard title="Revenue" loading={loadingKpis}>{penceToGBP(kpiRevenuePence)}</KpiCard>
            <KpiCard title="Litres" loading={loadingKpis}>{(Math.round(kpiLitres)).toLocaleString()}</KpiCard>
            <KpiCard title="Orders" loading={loadingKpis}>{kpiOrders.toLocaleString()}</KpiCard>
            <KpiCard title="Paid Orders" loading={loadingKpis}>{kpiPaidOrders.toLocaleString()}</KpiCard>
          </div>

          {/* Filters */}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-1 rounded-lg bg-white/5 p-1">
              {([
                ["month", "This month"],
                ["90", "Last 90 days"],
                ["ytd", "Year to date"],
                ["all", "All time"],
              ] as [RangeKey, string][]).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setRange(k)}
                  className={cx(
                    "px-3 py-1.5 text-sm rounded-md",
                    range === k ? "bg-yellow-500 text-[#041F3E] font-semibold" : "hover:bg-white/10"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search email, product, status, order id, invoice no…"
                  className="w-80 max-w-[70vw] rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm placeholder-white/40 outline-none focus:border-white/20 focus:ring-2 focus:ring-yellow-500/30"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 opacity-70">
                  <SearchIcon className="h-4 w-4" />
                </span>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-3 flex gap-2">
            {([
              ["orders", "Orders"],
              ["payments", "Payments"],
              ["invoices", "Invoices"],
              ["customers", "Customers"],
            ] as [typeof activeTab, string][]).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setActiveTab(k)}
                className={cx(
                  "rounded-lg px-3 py-1.5 text-sm",
                  activeTab === k ? "bg-white/15" : "bg-white/5 hover:bg-white/10"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="mx-auto max-w-6xl px-4 py-4 space-y-6">
        {activeTab === "orders" && (
          <Section title="Orders" onMore={ordersHasMore ? loadMoreOrders : undefined} loading={ordersLoading}>
            <div className="overflow-x-auto">
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
                  {orders.map((o) => (
                    <tr
                      key={o.id}
                      className="border-b border-white/5 hover:bg-white/5 cursor-pointer"
                      onClick={() =>
                        openDrawer("Order", (
                          <OrderDrawer order={o} />
                        ))
                      }
                    >
                      <td className="py-2 pr-4">{fmtDMYTime(o.created_at)}</td>
                      <td className="py-2 pr-4">{o.user_email}</td>
                      <td className="py-2 pr-4 capitalize">{o.fuel || "—"}</td>
                      <td className="py-2 pr-4">{o.litres ?? "—"}</td>
                      <td className="py-2 pr-4">{penceToGBP(o.total_pence ?? null)}</td>
                      <td className="py-2 pr-4">
                        <span className={cx(
                          "inline-flex rounded px-2 py-0.5 text-xs",
                          String(o.status || "").toLowerCase() === "paid" ? "bg-emerald-600/70" : "bg-slate-600/70"
                        )}>
                          {(o.status || "pending").toLowerCase()}
                        </span>
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">{o.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {activeTab === "payments" && (
          <Section title="Payments" onMore={paymentsHasMore ? loadMorePayments : undefined} loading={paymentsLoading}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-white/70">
                  <tr className="border-b border-white/10">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">Amount</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Order ID</th>
                    <th className="py-2 pr-4">PI ID</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p, i) => (
                    <tr
                      key={(p.id || p.pi_id || p.cs_id || i.toString())}
                      className="border-b border-white/5 hover:bg-white/5 cursor-pointer"
                      onClick={() =>
                        openDrawer("Payment", (
                          <PaymentDrawer payment={p} />
                        ))
                      }
                    >
                      <td className="py-2 pr-4">{fmtDMYTime(p.created_at)}</td>
                      <td className="py-2 pr-4">{p.email || "—"}</td>
                      <td className="py-2 pr-4">{penceToGBP(p.amount ?? null)}</td>
                      <td className="py-2 pr-4">
                        <span className={cx(
                          "inline-flex rounded px-2 py-0.5 text-xs",
                          String(p.status || "").toLowerCase() === "succeeded" || String(p.status || "").toLowerCase() === "paid"
                            ? "bg-emerald-600/70" : "bg-slate-600/70"
                        )}>
                          {(p.status || "—").toLowerCase()}
                        </span>
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">{p.order_id || "—"}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{p.pi_id || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {activeTab === "invoices" && (
          <Section title="Invoices" onMore={invoicesHasMore ? loadMoreInvoices : undefined} loading={invoicesLoading}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-white/70">
                  <tr className="border-b border-white/10">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">Invoice #</th>
                    <th className="py-2 pr-4">Folder</th>
                    <th className="py-2 pr-4">File</th>
                    <th className="py-2 pr-4">Size</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className="border-b border-white/5 hover:bg-white/5 cursor-pointer"
                      onClick={() =>
                        openDrawer("Invoice", (
                          <InvoiceDrawer inv={inv} />
                        ))
                      }
                    >
                      <td className="py-2 pr-4">{fmtDMYTime(inv.created_at)}</td>
                      <td className="py-2 pr-4">{inv.email}</td>
                      <td className="py-2 pr-4 font-mono">{inv.invoice_number}</td>
                      <td className="py-2 pr-4">{`${inv.year}/${String(inv.month).padStart(2, "0")}`}</td>
                      <td className="py-2 pr-4 break-all font-mono text-xs">{inv.path}</td>
                      <td className="py-2 pr-4">{inv.size_bytes ? `${Math.round(inv.size_bytes/1024)} KB` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {activeTab === "customers" && (
          <Section title="Customers" onMore={customersHasMore ? loadMoreCustomers : undefined} loading={customersLoading}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-white/70">
                  <tr className="border-b border-white/10">
                    <th className="py-2 pr-4">Customer</th>
                    <th className="py-2 pr-4">Orders</th>
                    <th className="py-2 pr-4">Litres</th>
                    <th className="py-2 pr-4">Spend</th>
                    <th className="py-2 pr-4">Last order</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr
                      key={c.email}
                      className="border-b border-white/5 hover:bg-white/5 cursor-pointer"
                      onClick={() =>
                        openDrawer("Customer", (
                          <CustomerDrawer c={c} />
                        ))
                      }
                    >
                      <td className="py-2 pr-4">{c.email}</td>
                      <td className="py-2 pr-4">{c.orders.toLocaleString()}</td>
                      <td className="py-2 pr-4">{Math.round(c.litres).toLocaleString()}</td>
                      <td className="py-2 pr-4">{penceToGBP(c.spend_pence)}</td>
                      <td className="py-2 pr-4">{fmtDMYTime(c.last_order_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        <div className="pb-16 text-center text-xs text-white/50">
          Admin · Refreshed {new Date().toLocaleString()}
        </div>
      </div>

      {/* Drawer */}
      <div
        className={cx(
          "fixed inset-0 z-50 transition",
          drawerOpen ? "pointer-events-auto" : "pointer-events-none"
        )}
        aria-hidden={!drawerOpen}
      >
        <div
          className={cx(
            "absolute inset-0 bg-black/60 transition-opacity",
            drawerOpen ? "opacity-100" : "opacity-0"
          )}
          onClick={() => setDrawerOpen(false)}
        />
        <div
          className={cx(
            "absolute right-0 top-0 h-full w-full max-w-md bg-[#0f172a] border-l border-white/10 shadow-2xl",
            "transition-transform duration-300",
            drawerOpen ? "translate-x-0" : "translate-x-full"
          )}
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="text-sm font-semibold">{drawerTitle}</div>
            <button onClick={() => setDrawerOpen(false)} className="rounded-md bg-white/10 px-2 py-1 text-sm hover:bg-white/15">Close</button>
          </div>
          <div className="max-h-[calc(100vh-48px)] overflow-y-auto p-4 space-y-3">
            {drawerContent}
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   Small components
   ========================================================= */

function KpiCard(props: { title: string; children: React.ReactNode; loading?: boolean }) {
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <div className="text-xs uppercase tracking-wide text-white/70">{props.title}</div>
      <div className="mt-1 text-2xl font-semibold">
        {props.loading ? <span className="opacity-60">…</span> : props.children}
      </div>
    </div>
  );
}

function Section(props: {
  title: string;
  children: React.ReactNode;
  onMore?: () => void;
  loading?: boolean;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{props.title}</h2>
        {props.onMore && (
          <button
            onClick={props.onMore}
            className="rounded-md bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
            disabled={props.loading}
          >
            {props.loading ? "Loading…" : "Load more"}
          </button>
        )}
      </div>
      {props.children}
    </section>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

/* -------------------- Drawer bodies -------------------- */

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-sm">
      <div className="col-span-1 text-white/70">{k}</div>
      <div className="col-span-2 break-all">{v}</div>
    </div>
  );
}

function OrderDrawer({ order }: { order: OrderRow }) {
  return (
    <div className="space-y-2">
      <Row k="Order ID" v={<code>{order.id}</code>} />
      <Row k="Date" v={fmtDMYTime(order.created_at)} />
      <Row k="Email" v={order.user_email || "—"} />
      <Row k="Product" v={(order.fuel || "—").toString()} />
      <Row k="Litres" v={order.litres ?? "—"} />
      <Row k="Amount" v={penceToGBP(order.total_pence ?? null)} />
      <Row k="Unit price" v={order.unit_price_pence != null ? penceToGBP(order.unit_price_pence) + " / L" : "—"} />
      <Row k="Status" v={(order.status || "—").toString()} />
    </div>
  );
}

function PaymentDrawer({ payment }: { payment: PaymentRow }) {
  return (
    <div className="space-y-2">
      <Row k="PI ID" v={<code>{payment.pi_id || "—"}</code>} />
      <Row k="CS ID" v={<code>{payment.cs_id || "—"}</code>} />
      <Row k="Order ID" v={<code>{payment.order_id || "—"}</code>} />
      <Row k="Date" v={fmtDMYTime(payment.created_at)} />
      <Row k="Email" v={payment.email || "—"} />
      <Row k="Amount" v={penceToGBP(payment.amount ?? null)} />
      <Row k="Currency" v={(payment.currency || "GBP").toString().toUpperCase()} />
      <Row k="Status" v={(payment.status || "—").toString()} />
    </div>
  );
}

function InvoiceDrawer({ inv }: { inv: InvoiceRow }) {
  const monthStr = String(inv.month).padStart(2, "0");
  const folder = `${inv.year}/${monthStr}`;
  const publicNote = (
    <span className="text-white/60 text-xs">
      Files are private in the <code>invoices</code> bucket. Use a signed URL if you need to download.
    </span>
  );
  return (
    <div className="space-y-2">
      <Row k="Invoice #" v={<code>{inv.invoice_number}</code>} />
      <Row k="Date" v={fmtDMYTime(inv.created_at)} />
      <Row k="Email" v={inv.email} />
      <Row k="Folder" v={folder} />
      <Row k="Path" v={<code className="break-all">{inv.path}</code>} />
      <Row k="Size" v={inv.size_bytes ? `${Math.round(inv.size_bytes / 1024)} KB` : "—"} />
      <div className="pt-2">{publicNote}</div>
    </div>
  );
}

function CustomerDrawer({ c }: { c: CustomerAgg }) {
  return (
    <div className="space-y-2">
      <Row k="Customer" v={c.email} />
      <Row k="Orders" v={c.orders.toLocaleString()} />
      <Row k="Litres" v={Math.round(c.litres).toLocaleString()} />
      <Row k="Spend" v={penceToGBP(c.spend_pence)} />
      <Row k="Last order" v={fmtDMYTime(c.last_order_at)} />
      <div className="mt-2">
        <a
          className="rounded-md bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
          href={`/documents?email=${encodeURIComponent(c.email)}`}
        >
          Open customer documents
        </a>
      </div>
    </div>
  );
}
