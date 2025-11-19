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

/* =========================
   Types
   ========================= */
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
  // NEW: receipt visibility
  receipt_sent_at?: string | null;
  receipt_path?: string | null;
};

type AdminCustomerRow = {
  email: string;
  status: "pending" | "approved" | "blocked" | string;
  approved_at: string | null;
  blocked_at: string | null;
  block_reason: string | null;
  first_order_at: string | null;
  last_order_at: string | null;
};

/** Tickets */
type TicketListRow = {
  id: string;
  ticket_code: string;
  status: string | null; // 'open' | 'closed'
  created_at: string;
  last_msg_ts: string | null;
  last_msg_direction: string | null; // 'in' | 'out'
  last_msg_subject: string | null;
  last_msg_sender: string | null;
};

type TicketMessageRow = {
  ticket_id: string;
  ts: string;
  direction: "in" | "out" | string;
  sender_email: string | null;
  body_text: string | null;
  body_html: string | null;
};

/* =========================
   Helpers
   ========================= */
const gbpFmt = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

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

  // Customer filter for tables (orders/payments)
  const [customerFilter, setCustomerFilter] = useState<string>("all");

  // Orders & Payments
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Collapsible sections
  const [openApprovals, setOpenApprovals] = useState(true);
  const [openOrders, setOpenOrders] = useState(true);
  const [openPayments, setOpenPayments] = useState(false);
  const [openInvoices, setOpenInvoices] = useState(false);
  const [openTickets, setOpenTickets] = useState(true);

  // Pagination (orders)
  const ORDERS_STEP = 20;
  const [ordersShown, setOrdersShown] = useState<number>(ORDERS_STEP);

  // Status filters
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("all");

  /* ====== APPROVALS (admin_customers_v) ====== */
  type ApprovalsFilter = "all" | "pending" | "approved" | "blocked";
  const [approvalsFilter, setApprovalsFilter] =
    useState<ApprovalsFilter>("all");
  const [approvals, setApprovals] = useState<AdminCustomerRow[]>([]);
  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [approvalsError, setApprovalsError] = useState<string | null>(null);

  const approvalsCounts = useMemo(() => {
    let p = 0,
      a = 0,
      b = 0;
    approvals.forEach((r) => {
      const s = (r.status || "").toLowerCase();
      if (s === "pending") p++;
      else if (s === "approved") a++;
      else if (s === "blocked") b++;
    });
    return { pending: p, approved: a, blocked: b };
  }, [approvals]);

  // Invoice browser
  const [invEmail, setInvEmail] = useState<string>("");
  const [invYear, setInvYear] = useState<string>("");
  const [invMonth, setInvMonth] = useState<string>("");
  const [invYears, setInvYears] = useState<string[]>([]);
  const [invMonths, setInvMonths] = useState<string[]>([]);
  const [invFiles, setInvFiles] = useState<
    { name: string; path: string; last_modified?: string; size?: number }[]
  >([]);
  const [invLoading, setInvLoading] = useState<boolean>(false);

  /* =========================
     Auth / Admin check
     ========================= */
  useEffect(() => {
    (async () => {
      try {
        // wait up to ~4s for session to appear
        const deadline = Date.now() + 4000;
        while (Date.now() < deadline) {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session?.user?.email) break;
          await new Promise((r) => setTimeout(r, 150));
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();
        const email = session?.user?.email?.toLowerCase() || "";
        if (!email) {
          window.location.replace(
            "/login?reason=signin&next=/admin-dashboard"
          );
          return;
        }

        // blocked?
        try {
          const { data: blk } = await supabase
            .from("blocked_users")
            .select("email")
            .eq("email", email)
            .maybeSingle();
          if (blk?.email) {
            await supabase.auth.signOut();
            window.location.replace("/login?reason=blocked");
            return;
          }
        } catch {}

        // admin?
        const { data, error } = await supabase
          .from("admins")
          .select("email")
          .eq("email", email)
          .maybeSingle();
        if (error || !data?.email) {
          window.location.replace("/client-dashboard");
          return;
        }

        setMe(email);
        setIsAdmin(true);
      } catch {
        window.location.replace("/client-dashboard");
      }
    })();
  }, []);

  /* =========================
     Load Orders & Payments
     ========================= */
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
          .select(
            "id, created_at, user_email, fuel, litres, unit_price_pence, total_pence, status"
          )
          .order("created_at", { ascending: false })
          .limit(1000);
        if (from) oq = oq.gte("created_at", from.toISOString());
        if (to) oq = oq.lte("created_at", to.toISOString());
        const { data: od, error: oe } = await oq;
        if (oe) throw oe;

        // Payments (now also selecting receipt fields)
        let pq = supabase
          .from("payments")
          .select(
            "order_id, amount, currency, status, email, cs_id, pi_id, created_at, receipt_sent_at, receipt_path"
          )
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

  /* =========================
     Approvals (load + actions)
     ========================= */
  async function loadApprovals() {
    if (isAdmin !== true) return;
    setApprovalsLoading(true);
    setApprovalsError(null);
    try {
      let q = supabase
        .from("admin_customers_v")
        .select("*")
        .order("status", { ascending: true })
        .order("last_order_at", { ascending: false })
        .limit(1000);

      if (approvalsFilter !== "all") q = q.eq("status", approvalsFilter);

      const { data, error } = await q;
      if (error) throw error;
      setApprovals((data || []) as AdminCustomerRow[]);
    } catch (e: any) {
      setApprovalsError(e?.message || "Failed to load approvals");
    } finally {
      setApprovalsLoading(false);
    }
  }
  useEffect(() => {
    if (isAdmin === true) loadApprovals();
  }, [isAdmin, approvalsFilter]);

  // actions via API
  async function callApprovalAction(
    email: string,
    action: "approve" | "block" | "unblock",
    reason?: string | null
  ) {
    try {
      setApprovalsError(null);
      const { data: sessionRes } = await supabase.auth.getSession();
      const token = sessionRes.session?.access_token;
      if (!token) throw new Error("Missing session token");

      const res = await fetch("/api/admin/approvals/set", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email, action, reason: reason || null }),
      });

      if (!res.ok) throw new Error((await res.text()) || `Failed (${res.status})`);
      await loadApprovals();
    } catch (e: any) {
      setApprovalsError(e?.message || "Action failed");
    }
  }
  function onApprove(email: string) {
    callApprovalAction(email, "approve");
  }
  function onBlock(email: string) {
    const reason = window.prompt("Reason for blocking (optional):") || null;
    callApprovalAction(email, "block", reason);
  }
  function onUnblock(email: string) {
    callApprovalAction(email, "unblock");
  }

  /* =========================
     Customer dropdown options
     ========================= */
  const customerOptions = useMemo(() => {
    const s = new Set<string>();
    orders.forEach((o) =>
      o.user_email ? s.add(o.user_email.toLowerCase()) : null
    );
    payments.forEach((p) => (p.email ? s.add(p.email.toLowerCase()) : null));
    return ["all", ...Array.from(s).sort((a, b) => a.localeCompare(b))];
  }, [orders, payments]);

  /* =========================
     Derived KPIs & options
     ========================= */
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

  // Orders (filtered)
  const filteredOrders = useMemo(() => {
    const s = search.trim().toLowerCase();
    return orders.filter((o) => {
      const statusOk =
        orderStatusFilter === "all" ||
        (o.status || "").toLowerCase() === orderStatusFilter;
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

  // Payments (filtered)
  const filteredPayments = useMemo(() => {
    const s = search.trim().toLowerCase();
    return payments.filter((p) => {
      const statusOk =
        paymentStatusFilter === "all" ||
        (p.status || "").toLowerCase() === paymentStatusFilter;
      if (!statusOk) return false;
      const customerOk =
        customerFilter === "all" ||
        (p.email || "").toLowerCase() === customerFilter;
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
  const sumRevenue = filteredOrders.reduce(
    (a, b) => a + toGBP(b.total_pence),
    0
  );
  const paidCount = filteredOrders.filter(
    (o) => (o.status || "").toLowerCase() === "paid"
  ).length;

  /* ===== Usage & Spend (yearly view) ===== */
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
  const currentYear = new Date().getFullYear();
  const currentMonthIdx = new Date().getMonth();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [showAllMonths, setShowAllMonths] = useState<boolean>(false);

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
      base[m].spend += toGBP(o.total_pence);
    });
    return base;
  }, [orders, selectedYear]);

  const rowsToShow = showAllMonths
    ? usageByMonth
    : usageByMonth.filter((r) => r.monthIdx === currentMonthIdx);
  const maxL = Math.max(1, ...usageByMonth.map((x) => x.litres));
  const maxS = Math.max(1, ...usageByMonth.map((x) => x.spend));

  /* =========================
     Invoice Browser helpers
     ========================= */
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
      const { data, error } = await supabase.storage
        .from("invoices")
        .list(`${email}`, {
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
      const { data, error } = await supabase.storage
        .from("invoices")
        .list(`${email}/${year}`, {
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
      const { data, error } = await supabase.storage
        .from("invoices")
        .list(prefix, {
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
    const { data, error } = await supabase.storage
      .from("invoices")
      .createSignedUrl(path, 60 * 10);
    if (error) throw error;
    return data.signedUrl;
  }

  /* =========================
     TICKETS (list + thread)
     ========================= */
  const [ticketSearch, setTicketSearch] = useState("");
  const [ticketStatus, setTicketStatus] = useState<"all" | "open" | "closed">(
    "all"
  );

  // allow "all" sentinel as well as numeric days
  type TicketSinceDays = number | "all";
  const [ticketSinceDays, setTicketSinceDays] =
    useState<TicketSinceDays>(365); // default: last 12 months

  const [tickets, setTickets] = useState<TicketListRow[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<TicketListRow | null>(
    null
  );
  const [thread, setThread] = useState<TicketMessageRow[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);

  async function loadTickets() {
    if (isAdmin !== true) return;
    setTicketsLoading(true);
    setTicketsError(null);
    try {
      let q = supabase
        .from("v_ticket_admin_list")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      // Only apply date filter if ticketSinceDays is a number > 0
      if (ticketSinceDays !== "all" && ticketSinceDays > 0) {
        const from = new Date();
        from.setDate(from.getDate() - (ticketSinceDays - 1));
        from.setHours(0, 0, 0, 0);
        q = q.gte("created_at", from.toISOString());
      }

      if (ticketStatus !== "all") q = q.eq("status", ticketStatus);

      const { data, error } = await q;
      if (error) throw error;
      setTickets((data || []) as TicketListRow[]);
    } catch (e: any) {
      setTicketsError(e?.message || "Failed to load tickets");
    } finally {
      setTicketsLoading(false);
    }
  }

  async function loadThread(ticketId: string) {
    setThread([]);
    setThreadLoading(true);
    try {
      const { data, error } = await supabase
        .from("v_ticket_messages")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("ts", { ascending: true })
        .limit(200);
      if (error) throw error;
      setThread((data || []) as TicketMessageRow[]);
    } catch (e: any) {
      setTicketsError(e?.message || "Failed to load messages");
    } finally {
      setThreadLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin === true) loadTickets();
  }, [isAdmin, ticketStatus, ticketSinceDays]);

  const filteredTickets = useMemo(() => {
    const s = ticketSearch.trim().toLowerCase();
    if (!s) return tickets;
    return tickets.filter((t) =>
      [t.ticket_code, t.status || "", t.last_msg_subject || "", t.last_msg_sender || ""]
        .join(" ")
        .toLowerCase()
        .includes(s)
    );
  }, [tickets, ticketSearch]);

  async function closeSelectedTicket() {
    if (!selectedTicket) return;
    try {
      const { data: sessionRes } = await supabase.auth.getSession();
      const token = sessionRes.session?.access_token;
      if (!token) throw new Error("Missing session token");

      const res = await fetch(`/api/tickets/${selectedTicket.id}/close`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());

      await loadTickets();
      await loadThread(selectedTicket.id);
    } catch (e: any) {
      setTicketsError(e?.message || "Failed to close ticket");
    }
  }

  /* =========================
     Render
     ========================= */
  if (isAdmin === null) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#0b1220] text-white">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-6 py-4 text-white/80">
          Checking admin…
        </div>
      </div>
    );
  }
  if (isAdmin === false) return null;

  return (
    <div className="min-h-screen bg-[#0b1220] text-white overflow-x-hidden">
      {/* Header */}
      <div className="sticky top-0 z-30 border-b border-white/10 bg-[#0b1220]/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 h-14 flex items-center gap-3">
          <img src="/logo-email.png" alt="FuelFlow" className="h-6 sm:h-7 w-auto" />
          <div className="hidden sm:block text-sm text-white/70">
            Signed in as <span className="font-medium">{me}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <a
              href="/client-dashboard"
              className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs sm:text-sm hover:bg-white/15"
            >
              Client view
            </a>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = "/login";
              }}
              className="rounded-lg bg-yellow-500 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-semibold text-[#041F3E] hover:bg-yellow-400"
            >
              Log out
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-5 space-y-5 sm:space-y-6">
        {/* ====== Client Approvals ====== */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03]">
          <div className="w-full flex flex-col gap-2 px-3 sm:px-4 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              onClick={() => setOpenApprovals((s) => !s)}
              className="flex items-center gap-3 text-left"
              aria-expanded={openApprovals}
            >
              <Chevron open={openApprovals} />
              <div className="font-semibold">Client Approvals</div>
              <span className="rounded-full bg:white/10 bg-white/10 px-2 py-0.5 text-[11px] sm:text-xs text-white/80">
                {`${approvalsCounts.pending} pending • ${approvalsCounts.approved} approved • ${approvalsCounts.blocked} blocked`}
              </span>
            </button>

            <div className="flex items-center gap-2 pb-3 sm:pb-0">
              <label className="flex items-center gap-2 text-sm">
                <span className="text-white/70">Status:</span>
                <select
                  value={approvalsFilter}
                  onChange={(e) =>
                    setApprovalsFilter(e.target.value as ApprovalsFilter)
                  }
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm outline-none focus:ring focus:ring-yellow-500/30"
                >
                  <option value="all">All</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="blocked">Blocked</option>
                </select>
              </label>
              <button
                onClick={loadApprovals}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
              >
                Refresh
              </button>
            </div>
          </div>

          {openApprovals && (
            <div className="px-3 pb-3">
              {approvalsError && (
                <div className="mx-1 mb-3 rounded border border-rose-400/40 bg-rose-500/10 p-3 text-rose-200 text-sm">
                  {approvalsError}
                </div>
              )}

              {approvalsLoading ? (
                <div className="px-1 py-2 text-white/70">Loading…</div>
              ) : approvals.length === 0 ? (
                <div className="px-1 py-2 text-white/70">No rows.</div>
              ) : (
                <>
                  {/* Mobile cards */}
                  <div className="grid sm:hidden grid-cols-1 gap-2">
                    {approvals.map((r) => {
                      const s = (r.status || "").toLowerCase();
                      return (
                        <div
                          key={r.email}
                          className="rounded-lg border border-white/10 bg-white/[0.04] p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-sm break-all">{r.email}</div>
                            <span
                              className={cx(
                                "inline-flex items-center rounded px-2 py-0.5 text-[11px] capitalize",
                                s === "pending" && "bg-yellow-600/70",
                                s === "approved" && "bg-green-600/70",
                                s === "blocked" && "bg-rose-600/70"
                              )}
                            >
                              {s || "—"}
                            </span>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-white/70">
                            <div>
                              First:{" "}
                              {r.first_order_at
                                ? new Date(
                                    r.first_order_at
                                  ).toLocaleString()
                                : "—"}
                            </div>
                            <div>
                              Last:{" "}
                              {r.last_order_at
                                ? new Date(
                                    r.last_order_at
                                  ).toLocaleString()
                                : "—"}
                            </div>
                            <div>
                              Approved:{" "}
                              {r.approved_at
                                ? new Date(
                                    r.approved_at
                                  ).toLocaleString()
                                : "—"}
                            </div>
                            <div>
                              Blocked:{" "}
                              {r.blocked_at
                                ? new Date(
                                    r.blocked_at
                                  ).toLocaleString()
                                : "—"}
                            </div>
                            <div className="col-span-2 truncate">
                              Reason: {r.block_reason || "—"}
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {s === "pending" && (
                              <button
                                onClick={() => onApprove(r.email)}
                                className="rounded bg-yellow-500 text-[#041F3E] font-semibold text-xs px-3 py-1.5 hover:bg-yellow-400"
                              >
                                Approve
                              </button>
                            )}
                            {(s === "pending" || s === "approved") && (
                              <button
                                onClick={() => onBlock(r.email)}
                                className="rounded bg-white/10 text-white text-xs px-3 py-1.5 hover:bg-white/15"
                              >
                                Block
                              </button>
                            )}
                            {s === "blocked" && (
                              <button
                                onClick={() => onUnblock(r.email)}
                                className="rounded bg-white/10 text-white text-xs px-3 py-1.5 hover:bg-white/15"
                              >
                                Unblock
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop table */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-left text-sm min-w-[720px]">
                      <thead className="text-white/70">
                        <tr className="border-b border-white/10">
                          <th className="py-2 pr-4">Email</th>
                          <th className="py-2 pr-4">Status</th>
                          <th className="py-2 pr-4">First order</th>
                          <th className="py-2 pr-4">Last order</th>
                          <th className="py-2 pr-4">Approved</th>
                          <th className="py-2 pr-4">Blocked</th>
                          <th className="py-2 pr-4">Reason</th>
                          <th className="py-2 pr-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {approvals.map((r) => {
                          const s = (r.status || "").toLowerCase();
                          return (
                            <tr key={r.email} className="border-b border-white/5">
                              <td className="py-2 pr-4">{r.email}</td>
                              <td className="py-2 pr-4">
                                <span
                                  className={cx(
                                    "inline-flex items-center rounded px-2 py-0.5 text-xs capitalize",
                                    s === "pending" && "bg-yellow-600/70",
                                    s === "approved" && "bg-green-600/70",
                                    s === "blocked" && "bg-rose-600/70"
                                  )}
                                >
                                  {s || "—"}
                                </span>
                              </td>
                              <td className="py-2 pr-4">
                                {r.first_order_at
                                  ? new Date(
                                      r.first_order_at
                                    ).toLocaleString()
                                  : "—"}
                              </td>
                              <td className="py-2 pr-4">
                                {r.last_order_at
                                  ? new Date(
                                      r.last_order_at
                                    ).toLocaleString()
                                  : "—"}
                              </td>
                              <td className="py-2 pr-4">
                                {r.approved_at
                                  ? new Date(
                                      r.approved_at
                                    ).toLocaleString()
                                  : "—"}
                              </td>
                              <td className="py-2 pr-4">
                                {r.blocked_at
                                  ? new Date(
                                      r.blocked_at
                                    ).toLocaleString()
                                  : "—"}
                              </td>
                              <td className="py-2 pr-4">
                                {r.block_reason || "—"}
                              </td>
                              <td className="py-2 pr-2">
                                <div className="flex justify-end gap-2">
                                  {s === "pending" && (
                                    <button
                                      onClick={() => onApprove(r.email)}
                                      className="rounded bg-yellow-500 text-[#041F3E] font-semibold text-xs px-3 py-1 hover:bg-yellow-400"
                                    >
                                      Approve
                                    </button>
                                  )}
                                  {(s === "pending" || s === "approved") && (
                                    <button
                                      onClick={() => onBlock(r.email)}
                                      className="rounded bg-white/10 text-white text-xs px-3 py-1 hover:bg-white/15"
                                    >
                                      Block
                                    </button>
                                  )}
                                  {s === "blocked" && (
                                    <button
                                      onClick={() => onUnblock(r.email)}
                                      className="rounded bg-white/10 text-white text-xs px-3 py-1 hover:bg-white/15"
                                    >
                                      Unblock
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              <p className="mt-2 text-xs text-white/60 px-0.5">
                Approve adds the email to the allow-list. Block adds it to the
                block list and signs the user out.
              </p>
            </div>
          )}
        </section>

        {/* ===== KPIs ===== */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
          <KpiCard label="Revenue" value={gbpFmt.format(sumRevenue)} />
          <KpiCard
            label="Litres"
            value={Math.round(sumLitres).toLocaleString()}
          />
          <KpiCard
            label="Orders"
            value={filteredOrders.length.toLocaleString()}
          />
          <KpiCard
            label="Paid Orders"
            value={paidCount.toLocaleString()}
          />
        </section>

        {/* Controls */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-end">
          <div className="sm:col-span-5 xl:col-span-4">
            <div className="rounded-lg bg-white/5 p-1 flex flex-wrap gap-1">
              {(["month", "90d", "ytd", "all"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={cx(
                    "flex-1 min-w-[7.5rem] px-3 py-2 text-sm rounded-md",
                    range === r
                      ? "bg-yellow-500 text-[#041F3E] font-semibold"
                      : "hover:bg-white/10"
                  )}
                >
                  {labelForRange(r)}
                </button>
              ))}
            </div>
          </div>

          <div className="sm:col-span-7 xl:col-span-8">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="flex-1 inline-flex items-center gap-2 text-sm">
                <span className="text-white/70">Customer:</span>
                <select
                  value={customerFilter}
                  onChange={(e) => setCustomerFilter(e.target.value)}
                  className="min-w-[12rem] flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm outline-none focus:ring focus:ring-yellow-500/30"
                >
                  {customerOptions.map((email) => (
                    <option key={email} value={email}>
                      {email === "all" ? "All customers" : email}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                disabled={customerFilter === "all"}
                onClick={() => {
                  if (customerFilter !== "all") {
                    setInvEmail(customerFilter);
                    loadYears();
                    setOpenInvoices(true);
                    setTimeout(() => {
                      document
                        .getElementById("invoices-accordion")
                        ?.scrollIntoView({ behavior: "smooth" });
                    }, 10);
                  }
                }}
                className={cx(
                  "w-full sm:w-auto whitespace-nowrap rounded-lg px-3 py-2 text-sm",
                  customerFilter === "all"
                    ? "bg-white/10 text-white/60 cursor-not-allowed"
                    : "bg-white/10 hover:bg-white/15"
                )}
              >
                Use in invoice browser
              </button>
            </div>
          </div>

          <div className="sm:col-span-12 xl:col-span-12">
            <div className="relative w-full">
              <input
                placeholder="Search email, product, status, order id, PI, session"
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
        </div>

        {/* Usage & Spend */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-5">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl sm:text-2xl font-semibold">
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
          <div className="grid sm:hidden grid-cols-1 gap-2">
            {visibleOrders.length === 0 ? (
              <div className="text-white/60 text-sm px-1 py-2">No orders.</div>
            ) : (
              visibleOrders.map((o) => (
                <div
                  key={o.id}
                  className="rounded-lg border border-white/10 bg-white/[0.04] p-3"
                >
                  <div className="text-xs text-white/70">
                    {new Date(o.created_at).toLocaleString()}
                  </div>
                  <div className="mt-1 text-sm break-all">{o.user_email}</div>
                  <div className="mt-1 grid grid-cols-2 gap-2 text-sm">
                    <div className="capitalize">
                      Product:{" "}
                      <span className="text-white/80">{o.fuel || "—"}</span>
                    </div>
                    <div>
                      Litres:{" "}
                      <span className="text-white/80">
                        {o.litres ?? "—"}
                      </span>
                    </div>
                    <div>
                      Amount:{" "}
                      <span className="text-white/80">
                        {gbpFmt.format(toGBP(o.total_pence))}
                      </span>
                    </div>
                    <div>
                      Status:{" "}
                      <span
                        className={cx(
                          "inline-flex items-center rounded px-2 py-0.5 text-[11px]",
                          (o.status || "").toLowerCase() === "paid"
                            ? "bg-green-600/70"
                            : "bg-gray-600/70"
                        )}
                      >
                        {(o.status || "pending").toLowerCase()}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1 text-[11px] text-white/60 break-all">
                    Order ID: {o.id}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
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
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {new Date(o.created_at).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4">{o.user_email}</td>
                    <td className="py-2 pr-4 capitalize">{o.fuel || "—"}</td>
                    <td className="py-2 pr-4">{o.litres ?? "—"}</td>
                    <td className="py-2 pr-4">
                      {gbpFmt.format(toGBP(o.total_pence))}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={cx(
                          "inline-flex items-center rounded px-2 py-0.5 text-xs",
                          (o.status || "").toLowerCase() === "paid"
                            ? "bg-green-600/70"
                            : "bg-gray-600/70"
                        )}
                      >
                        {(o.status || "pending").toLowerCase()}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-mono text-[11px] break-all">
                      {o.id}
                    </td>
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
          <div className="grid sm:hidden grid-cols-1 gap-2">
            {filteredPayments.length === 0 ? (
              <div className="text-white/60 text-sm px-1 py-2">
                No payments.
              </div>
            ) : (
              filteredPayments.map((p, i) => {
                const receiptSent = !!p.receipt_path;
                return (
                  <div
                    key={i}
                    className="rounded-lg border border-white/10 bg-white/[0.04] p-3"
                  >
                    <div className="text-xs text-white/70">
                      {p.created_at
                        ? new Date(p.created_at).toLocaleString()
                        : "—"}
                    </div>
                    <div className="mt-1 text-sm break-all">
                      {p.email || "—"}
                    </div>
                    <div className="mt-1 grid grid-cols-2 gap-2 text-sm">
                      <div>
                        Amount:{" "}
                        <span className="text-white/80">
                          {gbpFmt.format(toGBP(p.amount))}
                        </span>
                      </div>
                      <div>
                        Status:{" "}
                        <span
                          className={cx(
                            "inline-flex items-center rounded px-2 py-0.5 text-[11px]",
                            p.status === "succeeded" || p.status === "paid"
                              ? "bg-green-600/70"
                              : "bg-gray-600/70"
                          )}
                        >
                          {(p.status || "—").toLowerCase()}
                        </span>
                      </div>
                      <div className="col-span-2 text-[11px] text-white/60 break-all">
                        Order: {p.order_id || "—"}
                      </div>
                      <div className="col-span-2 text-[11px] text-white/60 break-all">
                        PI: {p.pi_id || "—"}
                      </div>
                      <div className="col-span-2 text-[11px] text-white/60 break-all">
                        Session: {p.cs_id || "—"}
                      </div>
                      <div className="col-span-2 flex items-center justify-between text-[11px] text-white/70 mt-1">
                        <span>
                          Receipt:{" "}
                          {receiptSent
                            ? p.receipt_sent_at
                              ? `sent ${new Date(
                                  p.receipt_sent_at
                                ).toLocaleString()}`
                              : "sent"
                            : "—"}
                        </span>
                        {receiptSent && (
                          <button
                            className="ml-2 rounded bg-yellow-500 text-[#041F3E] font-semibold px-2 py-1 text-[11px] hover:bg-yellow-400"
                            onClick={async () => {
                              if (!p.receipt_path) return;
                              try {
                                const url = await getSignedUrl(p.receipt_path);
                                window.open(url, "_blank");
                              } catch (e: any) {
                                setError(e?.message || "Failed to open receipt");
                              }
                            }}
                          >
                            View
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
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
                  <th className="py-2 pr-4">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-3 text-white/60">
                      No rows.
                    </td>
                  </tr>
                ) : (
                  filteredPayments.map((p, i) => {
                    const receiptSent = !!p.receipt_path;
                    return (
                      <tr key={i} className="border-b border-white/5">
                        <td className="py-2 pr-4 whitespace-nowrap">
                          {p.created_at
                            ? new Date(p.created_at).toLocaleString()
                            : "—"}
                        </td>
                        <td className="py-2 pr-4">{p.email || "—"}</td>
                        <td className="py-2 pr-4">
                          {gbpFmt.format(toGBP(p.amount))}
                        </td>
                        <td className="py-2 pr-4">
                          <span
                            className={cx(
                              "inline-flex items-center rounded px-2 py-0.5 text-xs",
                              p.status === "succeeded" || p.status === "paid"
                                ? "bg-green-600/70"
                                : "bg-gray-600/70"
                            )}
                          >
                            {(p.status || "—").toLowerCase()}
                          </span>
                        </td>
                        <td className="py-2 pr-4 font-mono text-[11px] break-all">
                          {p.order_id || "—"}
                        </td>
                        <td className="py-2 pr-4 font-mono text-[11px] break-all">
                          {p.pi_id || "—"}
                        </td>
                        <td className="py-2 pr-4 font-mono text-[11px] break-all">
                          {p.cs_id || "—"}
                        </td>
                        <td className="py-2 pr-4">
                          {receiptSent ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-white/70">
                                {p.receipt_sent_at
                                  ? new Date(
                                      p.receipt_sent_at
                                    ).toLocaleString()
                                  : "sent"}
                              </span>
                              <button
                                className="rounded bg-yellow-500 text-[#041F3E] font-semibold text-xs px-2 py-1 hover:bg-yellow-400"
                                onClick={async () => {
                                  if (!p.receipt_path) return;
                                  try {
                                    const url = await getSignedUrl(
                                      p.receipt_path
                                    );
                                    window.open(url, "_blank");
                                  } catch (e: any) {
                                    setError(e?.message || "Failed to open");
                                  }
                                }}
                              >
                                View
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-white/50">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Accordion>

        {/* ===== Support Tickets ===== */}
        <Accordion
          title="Support Tickets"
          subtitle={`${filteredTickets.length} row(s)`}
          open={openTickets}
          onToggle={() => setOpenTickets((s) => !s)}
          loading={ticketsLoading}
          error={ticketsError}
          right={
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm outline-none focus:ring focus:ring-yellow-500/30"
                placeholder="Search code / subject / sender"
                value={ticketSearch}
                onChange={(e) => setTicketSearch(e.target.value)}
              />
              <label className="flex items-center gap-2 text-sm">
                <span className="text-white/70">Status:</span>
                <select
                  value={ticketStatus}
                  onChange={(e) =>
                    setTicketStatus(e.target.value as "all" | "open" | "closed")
                  }
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm outline-none focus:ring focus:ring-yellow-500/30"
                >
                  <option value="all">All</option>
                  <option value="open">open</option>
                  <option value="closed">closed</option>
                </select>
              </label>

              <label className="flex items-center gap-2 text-sm">
                <span className="text-white/70">Since:</span>
                <select
                  value={ticketSinceDays === "all" ? "all" : String(ticketSinceDays)}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "all") setTicketSinceDays("all");
                    else setTicketSinceDays(parseInt(v, 10));
                  }}
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm outline-none focus:ring focus:ring-yellow-500/30"
                >
                  <option value="all">All time</option>
                  <option value="1">Today</option>
                  <option value="3">Last 3 days</option>
                  <option value="7">Last 7 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="365">Last 12 months</option>
                </select>
              </label>

              <button
                onClick={loadTickets}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
              >
                Refresh
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            {/* List */}
            <div className="lg:col-span-5 rounded-lg border border-white/10 bg-white/[0.03] overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="text-white/70">
                  <tr className="border-b border-white/10">
                    <th className="py-2 px-3">Code</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3">Last msg</th>
                    <th className="py-2 px-3">From</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.map((t) => (
                    <tr
                      key={t.id}
                      className={cx(
                        "border-b border-white/5 cursor-pointer hover:bg-white/[0.06]",
                        selectedTicket?.id === t.id && "bg-white/[0.08]"
                      )}
                      onClick={() => {
                        setSelectedTicket(t);
                        loadThread(t.id);
                      }}
                    >
                      <td className="py-2 px-3 font-mono text-[11px]">
                        {t.ticket_code}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={cx(
                            "inline-flex items-center rounded px-2 py-0.5 text-xs",
                            (t.status || "") === "open"
                              ? "bg-yellow-600/70"
                              : "bg-gray-600/70"
                          )}
                        >
                          {t.status || "—"}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <div className="text-xs truncate">
                          {t.last_msg_subject || "—"}
                        </div>
                        <div className="text-[11px] text-white/60">
                          {(t.last_msg_direction || "in")}/
                          {new Date(
                            t.last_msg_ts || t.created_at
                          ).toLocaleString()}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-xs">
                        {t.last_msg_sender || "—"}
                      </td>
                    </tr>
                  ))}
                  {filteredTickets.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-3 px-3 text-white/60">
                        No tickets.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Thread */}
            <div className="lg:col-span-7 rounded-lg border border-white/10 bg-white/[0.03] p-3">
              {!selectedTicket ? (
                <div className="text-white/60 text-sm">
                  Select a ticket from the list.
                </div>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-white/10 pb-2">
                    <div className="text-sm">
                      <div className="font-semibold">
                        Ticket {selectedTicket.ticket_code}
                      </div>
                      <div className="text-white/60">
                        Status: {selectedTicket.status || "—"} • Created{" "}
                        {new Date(
                          selectedTicket.created_at
                        ).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => loadThread(selectedTicket.id)}
                        className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
                      >
                        Refresh
                      </button>
                      <button
                        disabled={(selectedTicket.status || "") === "closed"}
                        onClick={closeSelectedTicket}
                        className={cx(
                          "rounded-lg px-3 py-1.5 text-sm",
                          (selectedTicket.status || "") === "closed"
                            ? "bg-white/10 text-white/50 cursor-not-allowed"
                            : "bg-yellow-500 text-[#041F3E] font-semibold hover:bg-yellow-400"
                        )}
                      >
                        Close ticket
                      </button>
                    </div>
                  </div>

                  <div className="mt-3">
                    {threadLoading ? (
                      <div className="text-white/70">Loading thread…</div>
                    ) : (
                      <TicketMessagesPanel messages={thread} />
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </Accordion>

        {/* Invoice browser */}
        <Accordion
          title="Invoice Browser"
          subtitle="Pick email → year → month"
          open={openInvoices}
          onToggle={() => setOpenInvoices((s) => !s)}
        >
          <div id="invoices-accordion" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-white/70 mb-1">
                Customer email
              </label>
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
              <label className="block text-xs text-white/70 mb-1">
                Month
              </label>
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
                        {f.last_modified
                          ? new Date(f.last_modified).toLocaleString()
                          : "—"}
                      </td>
                      <td className="py-2 pr-4">
                        {f.size ? `${Math.round(f.size / 1024)} KB` : "—"}
                      </td>
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
      className={cx(
        "h-5 w-5 transition-transform",
        open ? "rotate-90" : "rotate-0"
      )}
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
      <div className="w-full flex flex-col gap-2 px-3 sm:px-4 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          onClick={onToggle}
          className="flex items-center gap-3 text-left"
          aria-expanded={open}
        >
          <Chevron open={open} />
          <div className="font-semibold">{title}</div>
          {subtitle && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/80">
              {subtitle}
            </span>
          )}
        </button>
        {right && <div className="pb-3 sm:pb-0">{right}</div>}
      </div>
      {open && (
        <div className="px-3 sm:px-4 pb-3">
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
      <div className="text-[11px] sm:text-sm text-white/70">{label}</div>
      <div className="mt-1 text-lg sm:text-2xl font-semibold">{value}</div>
    </div>
  );
}

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
        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm outline-none focus:ring focus:ring-yellow-500/30"
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

/* ===== Ticket message bubbles ===== */
type TicketMsgRow = TicketMessageRow;

function MessageBubble({ msg }: { msg: TicketMsgRow }) {
  const isOut = (msg.direction || "").toLowerCase() === "out";
  const html = (msg.body_html || "").trim();
  const text = (msg.body_text || "").trim();

  return (
    <div
      className={cx(
        "rounded-2xl p-4 border",
        isOut
          ? "bg-yellow-500/10 border-yellow-400/30"
          : "bg-white/[0.05] border-white/10"
      )}
    >
      <div className="flex items-center justify-between text-xs text-white/60 mb-2">
        <div>
          {isOut ? "OUT" : "IN"} •{" "}
          {msg.ts ? new Date(msg.ts).toLocaleString() : "—"}
        </div>
        <div className="truncate">{msg.sender_email || "—"}</div>
      </div>

      {html ? (
        <div
          className="prose prose-invert max-w-none text-sm leading-6"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : text ? (
        <pre className="whitespace-pre-wrap break-words text-sm text-white/90 leading-6">
          {text}
        </pre>
      ) : (
        <div className="text-sm italic text-white/40">
          — (no message content) —
        </div>
      )}
    </div>
  );
}

function TicketMessagesPanel({ messages }: { messages: TicketMsgRow[] }) {
  return (
    <div className="space-y-3 overflow-y-auto max-h-[520px] pr-1">
      {messages && messages.length > 0 ? (
        messages.map((m, i) => <MessageBubble key={i} msg={m} />)
      ) : (
        <div className="text-white/60 text-sm">No messages.</div>
      )}
    </div>
  );
}




