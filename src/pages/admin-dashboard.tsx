// src/pages/admin-dashboard.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient, type User } from "@supabase/supabase-js";

/* =========================================
   Setup
   ========================================= */

const ADMIN_EMAIL = "fuelflow.queries@gmail.com"; // change if needed

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

// Shared UI bits
function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}
const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

/* =========================================
   Types
   ========================================= */

// Orders
type OrderRow = {
  id: string;
  created_at: string;
  user_email: string | null;
  fuel: string | null;
  litres: number | null;
  unit_price_pence: number | null;
  total_pence: number | null;
  status: string | null;
};

// Payments (+ join to orders)
type PaymentRow = {
  id?: string;
  created_at?: string | null;
  pi_id?: string | null;
  cs_id?: string | null;
  order_id?: string | null;
  email?: string | null;
  amount?: number | null;  // pence
  currency?: string | null;
  status?: string | null;
  orders?: {
    created_at?: string | null;
    fuel?: string | null;
    litres?: number | null;
    user_email?: string | null;
  } | null;
};

// Storage list entry (Supabase Storage JS SDK)
type StorageEntry = {
  id?: string;              // present for files, undefined for folders
  name: string;             // name or folder name
  created_at?: string;
  updated_at?: string;
  last_accessed_at?: string;
  metadata?: {
    size?: number;
    mimetype?: string;
    cacheControl?: string;
    eTag?: string;
    lastModified?: string;
    contentLength?: number;
    httpStatusCode?: number;
  } | null;
};

// Canonical invoice record for table
type InvoiceItem = {
  path: string;           // full path (email/yyyy/mm/file.pdf)
  email: string;          // email folder
  year: string;           // "2025"
  month: string;          // "01".."12"
  file: string;           // filename.pdf
  sizeKB: number;         // approx KB
  updated_at?: string;    // from storage metadata
  invoiceNo?: string;     // derived from filename (INV-...*.pdf)
};

/* =========================================
   Page
   ========================================= */

export default function AdminDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // metrics
  const [metrics, setMetrics] = useState({
    revenue: 0,
    litres: 0,
    orders: 0,
    paidOrders: 0,
  });

  // search (client-side filter)
  const [q, setQ] = useState("");

  // tab
  type Tab = "orders" | "payments" | "invoices" | "customers";
  const [tab, setTab] = useState<Tab>("invoices");

  // pagination state (very simple page-based)
  const PAGE_SIZE = 50;

  // data
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ordersLoadedAll, setOrdersLoadedAll] = useState(false);
  const ordersPage = useRef(0);

  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [paymentsLoadedAll, setPaymentsLoadedAll] = useState(false);
  const paymentsPage = useRef(0);

  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [invoicesLoadedAll, setInvoicesLoadedAll] = useState(false);
  const invoicesCursor = useRef<{ stage: "emails" | "years" | "months" | "files"; emailIdx: number; yearIdx: number; monthIdx: number; fileOffset: number; emailList: string[]; yearList: string[]; monthList: string[] }>({
    stage: "emails",
    emailIdx: 0,
    yearIdx: 0,
    monthIdx: 0,
    fileOffset: 0,
    emailList: [],
    yearList: [],
    monthList: [],
  });

  // customers aggregation (derived from orders/payments)
  const customersAgg = useMemo(() => {
    const map = new Map<
      string,
      { orders: number; litres: number; spendPence: number; lastOrder?: Date }
    >();
    orders.forEach((o) => {
      const email = (o.user_email || "").toLowerCase();
      if (!email) return;
      const cur = map.get(email) || { orders: 0, litres: 0, spendPence: 0, lastOrder: undefined };
      cur.orders += 1;
      cur.litres += o.litres || 0;
      cur.spendPence += o.total_pence || 0;
      const d = new Date(o.created_at);
      if (!cur.lastOrder || d > cur.lastOrder) cur.lastOrder = d;
      map.set(email, cur);
    });
    return Array.from(map.entries()).map(([email, v]) => ({
      email,
      ...v,
    }));
  }, [orders]);

  // ---------- init ----------
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data: auth } = await supabase.auth.getUser();
        const u = auth?.user || null;
        setUser(u);
        const email = (u?.email || "").toLowerCase();
        const admin = email === ADMIN_EMAIL;
        setIsAdmin(admin);
        if (!admin) {
          setLoading(false);
          return;
        }

        await Promise.all([loadMetrics(), resetOrders(), resetPayments(), resetInvoices()]);
      } catch (e: any) {
        setError(e?.message || "Failed to load admin dashboard.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* =========================================
     Loaders
     ========================================= */

  async function loadMetrics() {
    // Revenue/litres/orders/paidOrders from DB (simple approximate)
    // We’ll read many rows anyway for tables; but fetch lightweight aggregates to display fast.
    const { data: ord } = await supabase
      .from("orders")
      .select("total_pence, litres, status")
      .limit(10000); // generous cap; if you need larger, move metrics to a SQL view

    let revenue = 0;
    let litres = 0;
    let orders = 0;
    let paidOrders = 0;

    (ord || []).forEach((o: any) => {
      orders += 1;
      litres += Number(o.litres || 0);
      if ((o.status || "").toLowerCase() === "paid") {
        paidOrders += 1;
        revenue += Number(o.total_pence || 0) / 100;
      }
    });

    setMetrics({ revenue, litres, orders, paidOrders });
  }

  // ----- Orders -----
  async function resetOrders() {
    ordersPage.current = 0;
    setOrders([]);
    setOrdersLoadedAll(false);
    await loadMoreOrders();
  }
  async function loadMoreOrders() {
    if (ordersLoadedAll) return;
    const from = ordersPage.current * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("orders")
      .select("id, created_at, user_email, fuel, litres, unit_price_pence, total_pence, status")
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) {
      setError(error.message);
      return;
    }
    const rows = (data || []) as OrderRow[];
    setOrders((cur) => cur.concat(rows));
    if (rows.length < PAGE_SIZE) setOrdersLoadedAll(true);
    ordersPage.current += 1;
  }

  // ----- Payments -----
  async function resetPayments() {
    paymentsPage.current = 0;
    setPayments([]);
    setPaymentsLoadedAll(false);
    await loadMorePayments();
  }
  async function loadMorePayments() {
    if (paymentsLoadedAll) return;
    const from = paymentsPage.current * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from("payments")
      .select("id, created_at, pi_id, cs_id, order_id, email, amount, currency, status, orders:order_id(created_at, fuel, litres, user_email)")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      setError(error.message);
      return;
    }
    const rows = (data || []) as PaymentRow[];
    setPayments((cur) => cur.concat(rows));
    if (rows.length < PAGE_SIZE) setPaymentsLoadedAll(true);
    paymentsPage.current += 1;
  }

  // ----- Invoices (Storage) -----
  async function resetInvoices() {
    invoicesCursor.current = {
      stage: "emails",
      emailIdx: 0,
      yearIdx: 0,
      monthIdx: 0,
      fileOffset: 0,
      emailList: [],
      yearList: [],
      monthList: [],
    };
    setInvoices([]);
    setInvoicesLoadedAll(false);
    await loadMoreInvoices();
  }

  // list folder utility
  async function listFolder(path: string, limit = 100, offset = 0): Promise<StorageEntry[]> {
    const { data, error } = await supabase
      .storage
      .from("invoices")
      .list(path, { limit, offset, sortBy: { column: "name", order: "desc" } });

    if (error) throw error;
    return (data || []) as StorageEntry[];
  }

  function isFolder(e: StorageEntry) {
    // Supabase storage folders have no id (id undefined)
    return !e.id;
  }

  async function ensureEmailList() {
    if (invoicesCursor.current.emailList.length) return;
    const root = await listFolder(""); // emails
    const emailDirs = root.filter((e) => isFolder(e)).map((e) => e.name).sort((a, b) => a.localeCompare(b));
    invoicesCursor.current.emailList = emailDirs;
  }

  async function ensureYearList(email: string) {
    const ys = await listFolder(`${email}`);
    const years = ys.filter((e) => isFolder(e) && /^\d{4}$/.test(e.name)).map((e) => e.name).sort().reverse();
    invoicesCursor.current.yearList = years;
  }

  async function ensureMonthList(email: string, year: string) {
    const ms = await listFolder(`${email}/${year}`);
    const months = ms
      .filter((e) => isFolder(e))
      .map((e) => e.name)
      .sort()
      .reverse();
    invoicesCursor.current.monthList = months;
  }

  async function loadMoreInvoices() {
    if (invoicesLoadedAll) return;

    const CUR_FETCH_TARGET = 50; // number of files to fetch per "load more"
    const out: InvoiceItem[] = [];

    await ensureEmailList();

    const cur = invoicesCursor.current;
    const emails = cur.emailList;

    while (cur.emailIdx < emails.length && out.length < CUR_FETCH_TARGET) {
      const email = emails[cur.emailIdx];

      // years
      if (cur.stage === "emails") {
        await ensureYearList(email);
        cur.stage = "years";
        cur.yearIdx = 0;
      }

      while (cur.yearIdx < cur.yearList.length && out.length < CUR_FETCH_TARGET) {
        const year = cur.yearList[cur.yearIdx];

        if (cur.stage === "years") {
          await ensureMonthList(email, year);
          cur.stage = "months";
          cur.monthIdx = 0;
        }

        while (cur.monthIdx < cur.monthList.length && out.length < CUR_FETCH_TARGET) {
          const month = cur.monthList[cur.monthIdx];

          // files
          const path = `${email}/${year}/${month}`;
          const files = await listFolder(path, CUR_FETCH_TARGET, 0);
          const pdfs = files.filter((e) => !isFolder(e) && e.name.toLowerCase().endsWith(".pdf"));

          pdfs.forEach((f) => {
            const sizeBytes = f.metadata?.size ?? f.metadata?.contentLength ?? 0;
            const sizeKB = Math.round((Number(sizeBytes) / 1024) * 10) / 10;
            const item: InvoiceItem = {
              path: `${path}/${f.name}`,
              email,
              year,
              month,
              file: f.name,
              sizeKB,
              updated_at: f.updated_at,
              invoiceNo: f.name.replace(/\.pdf$/i, ""),
            };
            out.push(item);
          });

          cur.monthIdx += 1;
        }

        if (cur.monthIdx >= cur.monthList.length) {
          cur.yearIdx += 1;
          cur.stage = "years";
        }
      }

      if (cur.yearIdx >= cur.yearList.length) {
        cur.emailIdx += 1;
        cur.stage = "emails";
      }
    }

    setInvoices((curList) => curList.concat(out));
    if (out.length < CUR_FETCH_TARGET && invoicesCursor.current.emailIdx >= invoicesCursor.current.emailList.length) {
      setInvoicesLoadedAll(true);
    }
  }

  /* =========================================
     Filters / derived
     ========================================= */

  const qNorm = q.trim().toLowerCase();

  const filteredOrders = useMemo(() => {
    if (!qNorm) return orders;
    return orders.filter((o) => {
      const parts = [
        o.id,
        o.user_email,
        o.fuel,
        o.status,
        new Date(o.created_at).toLocaleDateString(),
      ]
        .join(" ")
        .toLowerCase();
      return parts.includes(qNorm);
    });
  }, [orders, qNorm]);

  const filteredPayments = useMemo(() => {
    if (!qNorm) return payments;
    return payments.filter((p) => {
      const parts = [
        p.email,
        p.order_id,
        p.status,
        p.pi_id,
        p.cs_id,
        p.orders?.fuel,
        p.orders?.user_email,
        p.orders?.litres?.toString() || "",
        p.created_at ? new Date(p.created_at).toLocaleString() : "",
      ]
        .join(" ")
        .toLowerCase();
      return parts.includes(qNorm);
    });
  }, [payments, qNorm]);

  const filteredInvoices = useMemo(() => {
    if (!qNorm) return invoices;
    return invoices.filter((i) => {
      const parts = [i.email, i.year, i.month, i.file, i.invoiceNo, i.path].join(" ").toLowerCase();
      return parts.includes(qNorm);
    });
  }, [invoices, qNorm]);

  /* =========================================
     UI
     ========================================= */

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b1220] text-white grid place-items-center">
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">Loading…</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#0b1220] text-white grid place-items-center">
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          You don’t have access to the admin dashboard.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b1220] text-white">
      {/* Top bar */}
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
        <img src="/logo-email.png" alt="FuelFlow" className="h-7 w-auto" />
        <div className="text-white/80">Signed in as {user?.email}</div>
        <div className="ml-auto flex items-center gap-2">
          <a href="/client-dashboard" className="rounded-lg bg-white/10 hover:bg-white/15 px-3 py-1.5 text-sm">Client view</a>
          <button
            className="rounded-lg bg-yellow-500 hover:bg-yellow-400 px-3 py-1.5 text-sm font-semibold text-[#041F3E]"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "https://fuelflow.co.uk";
            }}
          >
            Log out
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="max-w-6xl mx-auto px-4 grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label="REVENUE" value={gbp.format(metrics.revenue)} />
        <MetricCard label="LITRES" value={metrics.litres.toLocaleString()} />
        <MetricCard label="ORDERS" value={metrics.orders.toLocaleString()} />
        <MetricCard label="PAID ORDERS" value={metrics.paidOrders.toLocaleString()} />
      </div>

      {/* Tabs & Search */}
      <div className="max-w-6xl mx-auto px-4 mt-4 flex flex-wrap items-center gap-2">
        <button className={tabBtn(tab === "orders")} onClick={() => setTab("orders")}>Orders</button>
        <button className={tabBtn(tab === "payments")} onClick={() => setTab("payments")}>Payments</button>
        <button className={tabBtn(tab === "invoices")} onClick={() => setTab("invoices")}>Invoices</button>
        <button className={tabBtn(tab === "customers")} onClick={() => setTab("customers")}>Customers</button>

        <div className="ml-auto w-full sm:w-96">
          <input
            placeholder="Search email, product, status, order id, invoice…"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm placeholder-white/40 outline-none focus:ring-2 focus:ring-yellow-400"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {/* Body */}
      <div className="max-w-6xl mx-auto px-4 pb-24 mt-4 space-y-4">
        {tab === "orders" && (
          <Section
            title="Orders"
            right={
              ordersLoadedAll ? (
                <Badge>All loaded</Badge>
              ) : (
                <button className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15" onClick={loadMoreOrders}>
                  Load more
                </button>
              )
            }
          >
            <Table
              head={["Date", "Email", "Product", "Litres", "Amount", "Status"]}
              rows={filteredOrders.map((o) => [
                new Date(o.created_at).toLocaleString(),
                o.user_email || "—",
                (o.fuel || "—").toString(),
                (o.litres ?? 0).toLocaleString(),
                gbp.format((o.total_pence ?? 0) / 100),
                (o.status || "—").toString(),
              ])}
            />
          </Section>
        )}

        {tab === "payments" && (
          <Section
            title="Payments"
            right={
              paymentsLoadedAll ? (
                <Badge>All loaded</Badge>
              ) : (
                <button className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15" onClick={loadMorePayments}>
                  Load more
                </button>
              )
            }
          >
            <Table
              head={["Date", "Email", "Fuel", "Litres", "Amount", "Status", "Order #", "PI", "Session"]}
              rows={filteredPayments.map((p) => [
                p.created_at ? new Date(p.created_at).toLocaleString() : "—",
                p.orders?.user_email || p.email || "—",
                p.orders?.fuel || "—",
                p.orders?.litres ?? "—",
                p.amount != null ? gbp.format((p.amount as number) / 100) : "—",
                p.status || "—",
                p.order_id || "—",
                p.pi_id || "—",
                p.cs_id || "—",
              ])}
            />
          </Section>
        )}

        {tab === "invoices" && (
          <Section
            title="Invoices"
            right={
              invoicesLoadedAll ? (
                <Badge>All loaded</Badge>
              ) : (
                <button className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15" onClick={loadMoreInvoices}>
                  Load more
                </button>
              )
            }
          >
            <Table
              head={["Date", "Email", "Invoice #", "Folder", "File", "Size", "Open"]}
              rows={filteredInvoices.map((i) => [
                i.updated_at ? new Date(i.updated_at).toLocaleString() : "—",
                i.email,
                i.invoiceNo || i.file.replace(/\.pdf$/i, ""),
                `${i.email}/${i.year}/${i.month}`,
                i.file,
                `${i.sizeKB.toLocaleString()} KB`,
                <a
                  key={i.path}
                  className="inline-flex items-center rounded bg-yellow-500 px-2 py-1 text-xs font-semibold text-[#041F3E] hover:bg-yellow-400"
                  href={supabase.storage.from("invoices").getPublicUrl(i.path).data.publicUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  View
                </a>,
              ])}
            />
          </Section>
        )}

        {tab === "customers" && (
          <Section
            title="Customers"
            right={<Badge>{customersAgg.length.toLocaleString()} total</Badge>}
          >
            <Table
              head={["Customer", "Orders", "Litres", "Spend", "Last order"]}
              rows={customersAgg
                .sort((a, b) => (b.spendPence - a.spendPence))
                .map((c) => [
                  c.email,
                  c.orders.toLocaleString(),
                  Math.round(c.litres).toLocaleString(),
                  gbp.format(c.spendPence / 100),
                  c.lastOrder ? c.lastOrder.toLocaleString() : "—",
                ])}
            />
          </Section>
        )}

        {/* Footer stamp */}
        <div className="text-center text-xs text-white/50">
          Admin · Refreshed {new Date().toLocaleString()}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 p-2 text-sm text-rose-200">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================
   Small components
   ========================================= */

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-4">
      <div className="text-sm text-white/60">{label}</div>
      <div className="mt-1 text-3xl font-bold">{value}</div>
    </div>
  );
}

function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="font-semibold">{title}</div>
        <div>{right}</div>
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function Table({ head, rows }: { head: (string | React.ReactNode)[]; rows: (React.ReactNode[])[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-white/70">
          <tr className="border-b border-white/10">
            {head.map((h, i) => (
              <th key={i} className="py-2 pr-4">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={head.length} className="py-4 text-white/60">No rows.</td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i} className="border-b border-white/5">
                {r.map((c, j) => (
                  <td key={j} className="py-2 pr-4 align-middle">{c}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/80">
      {children}
    </span>
  );
}

function tabBtn(active: boolean) {
  return cx(
    "rounded-lg px-3 py-1.5 text-sm",
    active ? "bg-yellow-500 text-[#041F3E] font-semibold" : "bg-white/10 hover:bg-white/15"
  );
}

