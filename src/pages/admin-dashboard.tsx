// src/pages/admin-dashboard.tsx
// src/pages/admin-dashboard.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/* ========================================
   Supabase
======================================== */
const supabase =
  typeof window !== "undefined"
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || "",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
      )
    : (null as any);

/* ========================================
   Types
======================================== */
type Fuel = "petrol" | "diesel";

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

/** What Supabase Storage `list()` returns for each entry */
type StorageListObject = {
  name: string;
  id: string | null; // folders have id === null
  created_at?: string | null;
  updated_at?: string | null;
  last_modified?: string | null;
  metadata?: { size?: number } | null;
  size?: number | null; // sometimes present on files
};

type InvoiceFile = {
  path: string;       // invoices/{email}/{year}/{month}/{file}
  email: string;
  year: string;
  month: string;      // 01..12
  name: string;       // INV-XXXX.pdf
  created_at?: string | null;
  updated_at?: string | null;
  last_modified?: string | null;
  size?: number | null;
};

type CustomerAgg = {
  email: string;
  orders: number;
  litres: number;
  spend: number;      // GBP
  lastOrderAt: string | null;
};

/* ========================================
   Helpers
======================================== */
const gbpFmt = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const monthsNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}
function shortDT(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}
function bytes(n?: number | null) {
  if (!n && n !== 0) return "—";
  const units = ["B","KB","MB","GB"];
  let x = n as number, i = 0;
  while (x >= 1024 && i < units.length-1) { x /= 1024; i++; }
  return `${x.toFixed(x >= 10 ? 0 : 1)} ${units[i]}`;
}

/* ========================================
   Page
======================================== */
export default function AdminDashboard() {
  const [adminEmail, setAdminEmail] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // KPIs
  const [kpiRevenue, setKpiRevenue] = useState<number>(0);
  const [kpiLitres, setKpiLitres] = useState<number>(0);
  const [kpiOrders, setKpiOrders] = useState<number>(0);
  const [kpiPaid, setKpiPaid] = useState<number>(0);

  // Filters / UI
  type RangeKey = "month" | "qtr" | "ytd" | "all";
  const [range, setRange] = useState<RangeKey>("all");
  type Tab = "orders" | "payments" | "invoices" | "customers";
  const [tab, setTab] = useState<Tab>("invoices");
  const [search, setSearch] = useState("");

  // Data
  const [orders, setOrders] = useState<(OrderRow & { amountGBP: number; paymentStatus?: string })[]>([]);
  const [invoices, setInvoices] = useState<InvoiceFile[]>([]);
  const [customers, setCustomers] = useState<CustomerAgg[]>([]);

  // Pagination
  const [showOrders, setShowOrders] = useState(25);
  const [showInvoices, setShowInvoices] = useState(25);
  const [showCustomers, setShowCustomers] = useState(25);

  // Collapsible
  const [openInvoices, setOpenInvoices] = useState(true);
  const [openCustomers, setOpenCustomers] = useState(true);
  const [openOrders, setOpenOrders] = useState(false);

  /* ---------- bootstrap ---------- */
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user?.email) {
          window.location.href = "/login";
          return;
        }
        setAdminEmail((auth.user.email || "").toLowerCase());

        await Promise.all([loadOrdersAgg(), loadInvoicesRecent(), loadCustomersAgg()]);
      } catch (e: any) {
        setError(e?.message || "Failed to load admin dashboard.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ---------- load orders (for KPIs + orders tab) ---------- */
  async function loadOrdersAgg() {
    const { data, error } = await supabase
      .from("orders")
      .select("id, created_at, user_email, fuel, litres, unit_price_pence, total_pence, status")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) throw error;

    const arr = (data || []) as OrderRow[];

    const rows = arr.map((o) => {
      let totalPence =
        o.total_pence ??
        (o.unit_price_pence != null && o.litres != null ? Math.round(o.unit_price_pence * o.litres) : null);
      const amountGBP = totalPence != null ? totalPence / 100 : 0;
      return { ...o, amountGBP };
    });

    setKpiOrders(rows.length);
    setKpiPaid(rows.filter((r) => (r.status || "").toLowerCase() === "paid").length);
    setKpiLitres(rows.reduce((s, r) => s + (r.litres || 0), 0));
    setKpiRevenue(rows.reduce((s, r) => s + (r.amountGBP || 0), 0));

    setOrders(rows);
  }

  /* ---------- load invoices (storage) ---------- */
  async function listFolder(path: string): Promise<StorageListObject[]> {
    const { data, error } = await supabase.storage
      .from("invoices")
      .list(path, { limit: 1000, sortBy: { column: "name", order: "desc" } });
    if (error) throw error;
    return (data || []) as unknown as StorageListObject[];
  }

  async function loadInvoicesRecent() {
    const all: InvoiceFile[] = [];

    const top: StorageListObject[] = await listFolder(""); // emails level
    const emailDirs: StorageListObject[] = top.filter((e: StorageListObject) => e.id == null);

    for (const e of emailDirs) {
      const email = e.name;
      const years: StorageListObject[] = await listFolder(email);
      const yearDirs: StorageListObject[] = years.filter((y: StorageListObject) => y.id == null);

      for (const y of yearDirs) {
        const year = y.name;
        const months: StorageListObject[] = await listFolder(`${email}/${year}`);
        const monthDirs: StorageListObject[] = months.filter((m: StorageListObject) => m.id == null);

        for (const m of monthDirs) {
          const month = m.name; // 01..12
          const files: StorageListObject[] = await listFolder(`${email}/${year}/${month}`);

          for (const f of files) {
            const fname = f.name || "";
            if (!fname.toLowerCase().endsWith(".pdf")) continue;
            all.push({
              path: `${email}/${year}/${month}/${fname}`,
              email,
              year,
              month,
              name: fname,
              created_at: f.created_at ?? null,
              updated_at: f.updated_at ?? null,
              last_modified: f.last_modified ?? null,
              size: (f.metadata?.size as number | undefined) ?? (f.size ?? null),
            });
          }
        }
      }
    }

    all.sort((a, b) => {
      const as = Date.parse(a.updated_at || a.created_at || a.last_modified || "1970-01-01");
      const bs = Date.parse(b.updated_at || b.created_at || b.last_modified || "1970-01-01");
      return bs - as;
    });

    setInvoices(all);
  }

  /* ---------- customers aggregation (from orders) ---------- */
  async function loadCustomersAgg() {
    const { data, error } = await supabase
      .from("orders")
      .select("id, created_at, user_email, litres, total_pence, unit_price_pence")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) throw error;

    const map = new Map<string, CustomerAgg>();
    for (const o of (data || []) as OrderRow[]) {
      const email = (o.user_email || "").toLowerCase();
      if (!email) continue;

      const totalPence =
        o.total_pence ??
        (o.unit_price_pence != null && o.litres != null ? Math.round(o.unit_price_pence * o.litres) : 0);

      const cur = map.get(email) || {
        email,
        orders: 0,
        litres: 0,
        spend: 0,
        lastOrderAt: null as string | null,
      };
      cur.orders += 1;
      cur.litres += o.litres || 0;
      cur.spend += (totalPence || 0) / 100;
      if (!cur.lastOrderAt || new Date(o.created_at) > new Date(cur.lastOrderAt)) cur.lastOrderAt = o.created_at;

      map.set(email, cur);
    }

    const list = Array.from(map.values()).sort((a, b) => (b.spend || 0) - (a.spend || 0));
    setCustomers(list);
  }

  /* ---------- filters ---------- */
  const queryLower = search.trim().toLowerCase();
  const filteredInvoices = useMemo(() => {
    if (!queryLower) return invoices;
    return invoices.filter((i) =>
      [i.email, i.year, i.month, i.name, i.path].some((f) => f.toLowerCase().includes(queryLower))
    );
  }, [invoices, queryLower]);

  const filteredCustomers = useMemo(() => {
    if (!queryLower) return customers;
    return customers.filter((c) => c.email.toLowerCase().includes(queryLower));
  }, [customers, queryLower]);

  const filteredOrders = useMemo(() => {
    if (!queryLower) return orders;
    return orders.filter((o) =>
      [
        o.user_email,
        o.fuel || "",
        o.status || "",
        o.id,
        new Date(o.created_at).toLocaleDateString(),
        new Date(o.created_at).toLocaleString(),
      ]
        .join(" ")
        .toLowerCase()
        .includes(queryLower)
    );
  }, [orders, queryLower]);

  /* ---------- UI actions ---------- */
  async function openInvoice(i: InvoiceFile) {
    try {
      const { data, error } = await supabase.storage
        .from("invoices")
        .createSignedUrl(i.path, 60);
      if (error) throw error;
      window.open(data.signedUrl, "_blank");
    } catch (e: any) {
      alert("Could not open invoice: " + (e?.message || "Unknown"));
    }
  }

  function logout() {
    supabase.auth.signOut().finally(() => (window.location.href = "/login"));
  }

  /* ========================================
     Render
  ======================================== */
  return (
    <div className="min-h-screen bg-[#0b1220] text-white">
      {/* Top bar */}
      <div className="mx-auto max-w-7xl px-4 py-4">
        <div className="flex items-center gap-3">
          <a href="/client-dashboard" className="inline-flex items-center gap-2">
            <img src="/logo-email.png" className="h-7 w-auto" alt="FuelFlow" />
            <span className="text-white/70 hidden sm:inline">Signed in as {adminEmail}</span>
          </a>
          <div className="ml-auto flex items-center gap-2">
            <a href="/client-dashboard" className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15">
              Client view
            </a>
            <button
              onClick={logout}
              className="rounded-lg bg-yellow-500 px-3 py-1.5 text-sm font-semibold text-[#041F3E] hover:bg-yellow-400"
            >
              Log out
            </button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="mx-auto max-w-7xl px-4 grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard label="REVENUE" value={gbpFmt.format(kpiRevenue)} />
        <KpiCard label="LITRES" value={kpiLitres.toLocaleString()} />
        <KpiCard label="ORDERS" value={kpiOrders.toLocaleString()} />
        <KpiCard label="PAID ORDERS" value={kpiPaid.toLocaleString()} />
      </div>

      {/* Range + Tabs + Search */}
      <div className="mx-auto max-w-7xl px-4 mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          {([
            ["This month", "month"],
            ["Last 90 days", "qtr"],
            ["Year to date", "ytd"],
            ["All time", "all"],
          ] as [string, RangeKey][]).map(([label, key]) => (
            <button
              key={key}
              onClick={() => setRange(key)}
              className={cx(
                "rounded-lg px-3 py-1.5 text-sm",
                range === key ? "bg-yellow-500 text-[#041F3E] font-semibold" : "bg-white/10 hover:bg-white/15"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {(["orders", "payments", "invoices", "customers"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cx(
                "rounded-lg px-3 py-1.5 text-sm capitalize",
                tab === t ? "bg-white/20" : "bg-white/10 hover:bg-white/15"
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 md:max-w-md md:ml-auto">
          <input
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm placeholder-white/40 outline-none focus:ring focus:ring-yellow-500/30"
            placeholder="Search email, product, status, order id, invoice…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-4 py-5 space-y-6">
        {/* INVOICES */}
        {tab === "invoices" && (
          <Section
            title="Invoices"
            open={openInvoices}
            onToggle={() => setOpenInvoices((s) => !s)}
            actionRight={
              <button
                className="rounded-md bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
                onClick={() => setShowInvoices((n) => n + 25)}
                disabled={showInvoices >= filteredInvoices.length}
              >
                {showInvoices >= filteredInvoices.length ? "All loaded" : "Load more"}
              </button>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-white/70">
                  <tr className="border-b border-white/10">
                    <th className="py-2 pr-4 text-left">Date</th>
                    <th className="py-2 pr-4 text-left">Email</th>
                    <th className="py-2 pr-4 text-left">Invoice #</th>
                    <th className="py-2 pr-4 text-left">Folder</th>
                    <th className="py-2 pr-4 text-left">File</th>
                    <th className="py-2 pr-4 text-left">Size</th>
                    <th className="py-2 pr-4 text-left">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.slice(0, showInvoices).map((f) => (
                    <tr key={f.path} className="border-b border-white/10">
                      <td className="py-2 pr-4">{shortDT(f.updated_at || f.created_at || f.last_modified)}</td>
                      <td className="py-2 pr-4">{f.email}</td>
                      <td className="py-2 pr-4">{f.name.replace(".pdf", "")}</td>
                      <td className="py-2 pr-4">
                        {`${f.email}/${f.year}/${f.month} (${monthsNames[Math.max(0, (parseInt(f.month, 10) || 1) - 1)]})`}
                      </td>
                      <td className="py-2 pr-4">{f.name}</td>
                      <td className="py-2 pr-4">{bytes(f.size)}</td>
                      <td className="py-2 pr-4">
                        <button
                          onClick={() => openInvoice(f)}
                          className="rounded bg-yellow-500/90 px-2 py-1 text-xs font-semibold text-[#041F3E] hover:bg-yellow-400"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredInvoices.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-4 text-white/60">
                        No invoices found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* CUSTOMERS */}
        {tab === "customers" && (
          <Section
            title="Customers"
            open={openCustomers}
            onToggle={() => setOpenCustomers((s) => !s)}
            actionRight={
              <button
                className="rounded-md bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
                onClick={() => setShowCustomers((n) => n + 25)}
                disabled={showCustomers >= filteredCustomers.length}
              >
                {showCustomers >= filteredCustomers.length ? "All loaded" : "Load more"}
              </button>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-white/70">
                  <tr className="border-b border-white/10">
                    <th className="py-2 pr-4 text-left">Customer</th>
                    <th className="py-2 pr-4 text-left">Orders</th>
                    <th className="py-2 pr-4 text-left">Litres</th>
                    <th className="py-2 pr-4 text-left">Spend</th>
                    <th className="py-2 pr-4 text-left">Last order</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.slice(0, showCustomers).map((c) => (
                    <tr key={c.email} className="border-b border-white/10">
                      <td className="py-2 pr-4">{c.email}</td>
                      <td className="py-2 pr-4">{c.orders.toLocaleString()}</td>
                      <td className="py-2 pr-4">{Math.round(c.litres).toLocaleString()}</td>
                      <td className="py-2 pr-4">{gbpFmt.format(c.spend)}</td>
                      <td className="py-2 pr-4">{shortDT(c.lastOrderAt)}</td>
                    </tr>
                  ))}
                  {filteredCustomers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-white/60">
                        No customers yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* ORDERS */}
        {tab === "orders" && (
          <Section
            title="Orders"
            open={openOrders}
            onToggle={() => setOpenOrders((s) => !s)}
            actionRight={
              <button
                className="rounded-md bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
                onClick={() => setShowOrders((n) => n + 25)}
                disabled={showOrders >= filteredOrders.length}
              >
                {showOrders >= filteredOrders.length ? "All loaded" : "Load more"}
              </button>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-white/70">
                  <tr className="border-b border-white/10">
                    <th className="py-2 pr-4 text-left">Date</th>
                    <th className="py-2 pr-4 text-left">Email</th>
                    <th className="py-2 pr-4 text-left">Product</th>
                    <th className="py-2 pr-4 text-left">Litres</th>
                    <th className="py-2 pr-4 text-left">Amount</th>
                    <th className="py-2 pr-4 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.slice(0, showOrders).map((o) => (
                    <tr key={o.id} className="border-b border-white/10">
                      <td className="py-2 pr-4">{shortDT(o.created_at)}</td>
                      <td className="py-2 pr-4">{o.user_email}</td>
                      <td className="py-2 pr-4 capitalize">{o.fuel || "—"}</td>
                      <td className="py-2 pr-4">{o.litres ?? "—"}</td>
                      <td className="py-2 pr-4">{gbpFmt.format(o.amountGBP)}</td>
                      <td className="py-2 pr-4">
                        <span
                          className={cx(
                            "inline-flex items-center rounded px-2 py-0.5 text-xs",
                            (o.status || "").toLowerCase() === "paid" ? "bg-emerald-600/70" : "bg-gray-600/70"
                          )}
                        >
                          {(o.status || o.paymentStatus || "pending").toLowerCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredOrders.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-4 text-white/60">
                        No orders in range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        <div className="text-center text-xs text-white/50">
          Admin · Refreshed {new Date().toLocaleString()}
        </div>
      </div>
    </div>
  );
}

/* ========================================
   Small components
======================================== */
function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.06] p-4 ring-1 ring-inset ring-white/10">
      <div className="text-xs text-white/60">{label}</div>
      <div className="mt-1 text-3xl font-bold">{value}</div>
    </div>
  );
}

function Section({
  title,
  children,
  open,
  onToggle,
  actionRight,
}: {
  title: string;
  children: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  actionRight?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04]">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={onToggle}
          className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" className={cx("transition", open ? "rotate-90" : "")}>
            <path d="M9 18l6-6-6-6" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
          <span className="font-semibold">{title}</span>
        </button>
        <div>{actionRight}</div>
      </div>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

