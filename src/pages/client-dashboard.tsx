// src/pages/client-dashboard.tsx
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
  cs_id?: string | null;
  pi_id?: string | null;
  created_at?: string | null;
};

type AdminRow = { email: string };

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

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* =========================
   Page
   ========================= */

export default function AdminDashboard() {
  const [me, setMe] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  // Filters
  type Range = "month" | "90d" | "ytd" | "all";
  const [range, setRange] = useState<Range>("month");
  const [search, setSearch] = useState<string>("");

  // Orders & Payments
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination (orders)
  const PAGE = 50;
  const [page, setPage] = useState<number>(1);
  const visibleOrders = useMemo(() => orders.slice(0, page * PAGE), [orders, page]);

  // Invoice browser (by customer email)
  const [invEmail, setInvEmail] = useState<string>("");
  const [invYear, setInvYear] = useState<string>("");
  const [invMonth, setInvMonth] = useState<string>("");
  const [invYears, setInvYears] = useState<string[]>([]);
  const [invMonths, setInvMonths] = useState<string[]>([]);
  const [invFiles, setInvFiles] = useState<{ name: string; path: string; last_modified?: string; size?: number }[]>([]);
  const [invLoading, setInvLoading] = useState<boolean>(false);

  // ------------- Auth + admin check -------------
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const email = (auth?.user?.email || "").toLowerCase();
      if (!email) {
        window.location.href = "/login";
        return;
      }
      setMe(email);

      // Check admin table
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

  // ------------- Load business data -------------
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
        setPage(1);
      } catch (e: any) {
        setError(e?.message || "Failed to load admin data");
      } finally {
        setLoading(false);
      }
    })();
  }, [isAdmin, range]);

  // ------------- Derived KPIs -------------
  const filteredOrders = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return orders;
    return orders.filter((o) => {
      return (
        (o.user_email || "").toLowerCase().includes(s) ||
        (o.fuel || "").toLowerCase().includes(s) ||
        (o.status || "").toLowerCase().includes(s) ||
        (o.id || "").toLowerCase().includes(s)
      );
    });
  }, [orders, search]);

  const sumLitres = filteredOrders.reduce((a, b) => a + (b.litres || 0), 0);
  const sumRevenue = filteredOrders.reduce((a, b) => a + toGBP(b.total_pence), 0);
  const paidCount = filteredOrders.filter((o) => (o.status || "").toLowerCase() === "paid").length;

  // ------------- Invoice browser helpers -------------
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
      // List e.g. "customer@email/" -> returns year "folders" as prefixes via names that have "/" inside
      const { data, error } = await supabase.storage.from("invoices").list(`${email}`, {
        limit: 1000,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw error;
      const years = (data || [])
        .filter((x) => x.name.match(/^\d{4}$/)) // 2025
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
      const months = (data || [])
        .filter((x) => x.name.match(/^(0[1-9]|1[0-2])$/))
        .map((x) => x.name);
      setInvMonths(months);
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

  async function getPublicUrl(path: string) {
    // If your bucket is private (recommended), create a signed URL:
    const { data, error } = await supabase.storage.from("invoices").createSignedUrl(path, 60 * 10); // 10 min
    if (error) throw error;
    return data.signedUrl;
  }

  /* =========================
     Render
     ========================= */

  if (isAdmin === null) {
    return blankShell("Checking admin…");
  }
  if (isAdmin === false) {
    return blankShell("You don’t have access to the admin dashboard.");
  }

  return (
    <div className="min-h-screen bg-[#0b1220] text-white">
      {/* Header */}
      <div className="sticky top-0 z-30 border-b border-white/10 bg-[#0b1220]/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">
          <img src="/logo-email.png" alt="FuelFlow" className="h-7 w-auto" />
          <div className="text-sm text-white/70">Signed in as <span className="font-medium">{me}</span></div>
          <div className="ml-auto flex items-center gap-2">
            <a href="/client-dashboard" className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15">Client view</a>
            <button
              onClick={async () => { await supabase.auth.signOut(); window.location.href = "/login"; }}
              className="rounded-lg bg-yellow-500 px-3 py-1.5 text-sm font-semibold text-[#041F3E] hover:bg-yellow-400"
            >
              Log out
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-5 space-y-6">
        {/* Top: KPIs & controls */}
        <section className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <KpiCard label="Revenue" value={gbpFmt.format(sumRevenue)} />
          <KpiCard label="Litres" value={Math.round(sumLitres).toLocaleString()} />
          <KpiCard label="Orders" value={filteredOrders.length.toLocaleString()} />
          <KpiCard label="Paid Orders" value={paidCount.toLocaleString()} />
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-lg bg-white/5 p-1">
            {(["month","90d","ytd","all"] as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cx(
                  "px-3 py-1.5 text-sm rounded-md",
                  range === r ? "bg-yellow-500 text-[#041F3E] font-semibold" : "hover:bg-white/10"
                )}
              >
                {labelForRange(r)}
              </button>
            ))}
          </div>
          <div className="relative ml-auto w-full sm:w-80">
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

        {/* Orders */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg md:text-xl font-semibold">Orders</h2>
            <div className="text-xs text-white/70">
              Showing {visibleOrders.length} of {orders.length}
            </div>
          </div>

          {loading ? (
            <div className="text-white/70">Loading…</div>
          ) : error ? (
            <div className="rounded border border-rose-400/40 bg-rose-500/10 p-3 text-rose-200 text-sm">{error}</div>
          ) : (
            <>
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
                    {visibleOrders
                      .filter((o) => filteredOrders.includes(o))
                      .map((o) => (
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
                          <td className="py-2 pr-4 font-mono text-xs">{o.id}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {visibleOrders.length < orders.length && (
                <div className="mt-3 text-center">
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
                  >
                    Load more
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* Payments */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg md:text-xl font-semibold">Payments</h2>
            <div className="text-xs text-white/70">{payments.length} rows</div>
          </div>
          <div className="overflow-x-auto">
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
                {payments.map((p, i) => (
                  <tr key={i} className="border-b border-white/5">
                    <td className="py-2 pr-4 whitespace-nowrap">{p.created_at ? new Date(p.created_at).toLocaleString() : "—"}</td>
                    <td className="py-2 pr-4">{p.email || "—"}</td>
                    <td className="py-2 pr-4">{gbpFmt.format(toGBP(p.amount))}</td>
                    <td className="py-2 pr-4">
                      <span className={cx("inline-flex items-center rounded px-2 py-0.5 text-xs", p.status === "succeeded" || p.status === "paid" ? "bg-green-600/70" : "bg-gray-600/70")}>
                        {(p.status || "—").toLowerCase()}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">{p.order_id || "—"}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{p.pi_id || "—"}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{p.cs_id || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Invoice browser (per customer email) */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg md:text-xl font-semibold">Invoice Browser</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-white/70 mb-1">Customer email</label>
              <div className="flex gap-2">
                <input
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:ring focus:ring-yellow-500/30"
                  placeholder="name@company.com"
                  value={invEmail}
                  onChange={(e) => setInvEmail(e.target.value)}
                />
                <button
                  onClick={loadYears}
                  className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
                >
                  Load
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs text-white/70 mb-1">Year</label>
              <div className="flex gap-2">
                <select
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                  value={invYear}
                  onChange={(e) => loadMonths(e.target.value)}
                >
                  <option value="">—</option>
                  {invYears.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-white/70 mb-1">Month</label>
              <div className="flex gap-2">
                <select
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                  value={invMonth}
                  onChange={(e) => loadFiles(e.target.value)}
                >
                  <option value="">—</option>
                  {invMonths.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="mt-4">
            {invLoading ? (
              <div className="text-white/70">Loading…</div>
            ) : invFiles.length === 0 ? (
              <div className="text-white/60 text-sm">No invoices to show.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
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
                        <td className="py-2 pr-4">{f.last_modified ? new Date(f.last_modified).toLocaleString() : "—"}</td>
                        <td className="py-2 pr-4">{f.size ? `${Math.round(f.size/1024)} KB` : "—"}</td>
                        <td className="py-2 pr-4">
                          <button
                            className="rounded bg-yellow-500 text-[#041F3E] font-semibold text-xs px-2 py-1 hover:bg-yellow-400"
                            onClick={async () => {
                              try {
                                const url = await getPublicUrl(f.path);
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
              </div>
            )}
          </div>
        </section>

        <footer className="py-6 text-center text-xs text-white/50">
          FuelFlow Admin • {new Date().getFullYear()}
        </footer>
      </div>
    </div>
  );
}

/* =========================
   Components & utils
   ========================= */

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
      <div className="text-sm text-white/70">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function blankShell(text: string) {
  return (
    <div className="min-h-screen grid place-items-center bg-[#0b1220] text-white">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-6 py-4 text-white/80">
        {text}
      </div>
    </div>
  );
}

function labelForRange(r: "month" | "90d" | "ytd" | "all") {
  switch (r) {
    case "month": return "This month";
    case "90d": return "Last 90 days";
    case "ytd": return "Year to date";
    default: return "All time";
  }
}

function dateRange(r: "month" | "90d" | "ytd" | "all") {
  switch (r) {
    case "month": return { from: startOfMonth(), to: null as Date | null };
    case "90d":  return { from: daysAgo(90), to: null as Date | null };
    case "ytd":  return { from: startOfYear(), to: null as Date | null };
    case "all":
    default:     return { from: null as Date | null, to: null as Date | null };
  }
}

