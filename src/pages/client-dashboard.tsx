// src/pages/client-dashboard.tsx
// src/pages/client-dashboard.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type Fuel = "petrol" | "diesel";
type TankOption = "buy" | "rent";

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

type TermsRow = {
  accepted_at: string;
  version: string | null;
};

type ContractRow = {
  tank_option: TankOption;
  status: "draft" | "signed" | "approved" | "cancelled";
  signed_at: string | null;
  approved_at: string | null;
  created_at: string;
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

const INACTIVITY_MS =
  Number(process.env.NEXT_PUBLIC_IDLE_LOGOUT_MS ?? "") || 15 * 60 * 1000; // 15 minutes

export default function ClientDashboard() {
  const [userEmail, setUserEmail] = useState<string>("");

  // prices
  const [petrolPrice, setPetrolPrice] = useState<number | null>(null);
  const [dieselPrice, setDieselPrice] = useState<number | null>(null);
  const [priceDate, setPriceDate] = useState<string | null>(null); // latest price date seen
  const pricesAreToday = isToday(priceDate);

  // orders
  const [orders, setOrders] = useState<
    (OrderRow & { amountGBP: number; paymentStatus?: string })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // usage UI
  const currentYear = new Date().getFullYear();
  const currentMonthIdx = new Date().getMonth(); // 0..11
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [showAllMonths, setShowAllMonths] = useState<boolean>(false);

  // documents (Terms/Contracts)
  const [termsAcceptedAt, setTermsAcceptedAt] = useState<string | null>(null);
  const [buyStatus, setBuyStatus] = useState<"none" | "signed" | "approved">("none");
  const [buyWhen, setBuyWhen] = useState<string | null>(null);
  const [rentStatus, setRentStatus] = useState<"none" | "signed" | "approved">("none");
  const [rentWhen, setRentWhen] = useState<string | null>(null);

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

        // PRICES
        await loadLatestPrices();

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

        // DOCUMENTS (Terms + Contracts)
        await loadDocumentStatuses(emailLower);
      } catch (e: any) {
        setError(e?.message || "Failed to load dashboard.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Latest prices (robust loader)
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
        const rows = Array.from(seen.values());
        applyPriceRows(rows);
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

  // Document statuses (Terms + Contracts)
  async function loadDocumentStatuses(emailLower: string) {
    // Terms: latest acceptance for this email
    try {
      const { data } = await supabase
        .from("terms_acceptances")
        .select("accepted_at,version")
        .eq("email", emailLower)
        .order("accepted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.accepted_at) setTermsAcceptedAt(data.accepted_at);
      else setTermsAcceptedAt(null);
    } catch {
      setTermsAcceptedAt(null);
    }

    // Contracts: get latest rows and reduce to buy/rent with precedence: approved > signed > draft/none
    try {
      const { data } = await supabase
        .from("contracts")
        .select("tank_option,status,signed_at,approved_at,created_at")
        .eq("email", emailLower)
        .order("created_at", { ascending: false });

      const rows = (data || []) as ContractRow[];
      const latestByOption = new Map<TankOption, ContractRow>();

      for (const r of rows) {
        const prev = latestByOption.get(r.tank_option);
        if (!prev) {
          latestByOption.set(r.tank_option, r);
          continue;
        }
        // prefer approved; else signed with newer date; else keep prev
        const score = (x: ContractRow) =>
          x.status === "approved" ? 3 : x.status === "signed" ? 2 : 1;
        if (score(r) > score(prev)) latestByOption.set(r.tank_option, r);
      }

      const buy = latestByOption.get("buy");
      const rent = latestByOption.get("rent");

      if (!buy) {
        setBuyStatus("none");
        setBuyWhen(null);
      } else if (buy.status === "approved") {
        setBuyStatus("approved");
        setBuyWhen(buy.approved_at || buy.signed_at);
      } else if (buy.status === "signed") {
        setBuyStatus("signed");
        setBuyWhen(buy.signed_at);
      } else {
        setBuyStatus("none");
        setBuyWhen(null);
      }

      if (!rent) {
        setRentStatus("none");
        setRentWhen(null);
      } else if (rent.status === "approved") {
        setRentStatus("approved");
        setRentWhen(rent.approved_at || rent.signed_at);
      } else if (rent.status === "signed") {
        setRentStatus("signed");
        setRentWhen(rent.signed_at);
      } else {
        setRentStatus("none");
        setRentWhen(null);
      }
    } catch {
      setBuyStatus("none");
      setRentStatus("none");
      setBuyWhen(null);
      setRentWhen(null);
    }
  }

  // quick refresh handler
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

  // Condensed vs expanded view
  const rowsToShow = showAllMonths
    ? usageByMonth
    : usageByMonth.filter((r) => r.monthIdx === currentMonthIdx);

  // UI helpers for document badges
  const badge = (kind: "ok" | "warn" | "missing") =>
    `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
      kind === "ok"
        ? "bg-green-500/15 text-green-300"
        : kind === "warn"
        ? "bg-yellow-500/15 text-yellow-300"
        : "bg-red-500/15 text-red-300"
    }`;

  return (
    <div className="min-h-screen bg-[#0b1220] text-white">
      <div className="max-w-6xl mx-auto px-4 py-4 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <img src="/logo-email.png" alt="FuelFlow" className="h-7 w-auto" />
          <div className="text-sm text-white/70">
            Welcome back, <span className="font-medium">{userEmail}</span>
          </div>
          <div className="ml-auto flex gap-2">
            <a
              href="/order"
              aria-disabled={!pricesAreToday || petrolPrice == null || dieselPrice == null}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                pricesAreToday && petrolPrice != null && dieselPrice != null
                  ? "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400"
                  : "bg-white/10 text-white/60 cursor-not-allowed"
              }`}
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

        {/* Prices cards */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

          {/* DOCUMENTS */}
          <Card title="Documents">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Terms */}
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="text-sm text-white/80 font-semibold">Terms &amp; Conditions</div>
                <div className="mt-1">
                  {termsAcceptedAt ? (
                    <span className={badge("ok")}>
                      <span className="h-1.5 w-1.5 rounded-full bg-green-300 inline-block" />
                      Accepted {new Date(termsAcceptedAt).toLocaleDateString()}
                    </span>
                  ) : (
                    <span className={badge("missing")}>
                      <span className="h-1.5 w-1.5 rounded-full bg-red-300 inline-block" />
                      Missing
                    </span>
                  )}
                </div>
                <div className="mt-2">
                  <a
                    className="rounded-lg bg-white/10 px-3 py-1.5 text-xs hover:bg-white/15"
                    href={`/terms?return=/client-dashboard${userEmail ? `&email=${encodeURIComponent(userEmail)}` : ""}`}
                  >
                    Read &amp; accept
                  </a>
                </div>
              </div>

              {/* Buy contract */}
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="text-sm text-white/80 font-semibold">Buy Contract</div>
                <div className="mt-1">
                  {buyStatus === "approved" ? (
                    <span className={badge("ok")}>
                      <span className="h-1.5 w-1.5 rounded-full bg-green-300 inline-block" />
                      Active {buyWhen ? `• ${new Date(buyWhen).toLocaleDateString()}` : ""}
                    </span>
                  ) : buyStatus === "signed" ? (
                    <span className={badge("warn")}>
                      <span className="h-1.5 w-1.5 rounded-full bg-yellow-300 inline-block" />
                      Signed {buyWhen ? `• ${new Date(buyWhen).toLocaleDateString()}` : ""}
                    </span>
                  ) : (
                    <span className={badge("missing")}>
                      <span className="h-1.5 w-1.5 rounded-full bg-red-300 inline-block" />
                      Not started
                    </span>
                  )}
                </div>
                <div className="mt-2">
                  <a
                    className={`rounded-lg px-3 py-1.5 text-xs ${
                      buyStatus === "none"
                        ? "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400"
                        : "bg-white/10 hover:bg-white/15"
                    }`}
                    href="/order"
                    title={buyStatus === "none" ? "Start Buy contract" : "Manage contract"}
                  >
                    {buyStatus === "none" ? "Start Buy" : "Manage"}
                  </a>
                </div>
              </div>

              {/* Rent contract */}
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="text-sm text-white/80 font-semibold">Rent Contract</div>
                <div className="mt-1">
                  {rentStatus === "approved" ? (
                    <span className={badge("ok")}>
                      <span className="h-1.5 w-1.5 rounded-full bg-green-300 inline-block" />
                      Active {rentWhen ? `• ${new Date(rentWhen).toLocaleDateString()}` : ""}
                    </span>
                  ) : rentStatus === "signed" ? (
                    <span className={badge("warn")}>
                      <span className="h-1.5 w-1.5 rounded-full bg-yellow-300 inline-block" />
                      Signed • awaiting approval
                    </span>
                  ) : (
                    <span className={badge("missing")}>
                      <span className="h-1.5 w-1.5 rounded-full bg-red-300 inline-block" />
                      Not started
                    </span>
                  )}
                </div>
                <div className="mt-2">
                  <a
                    className={`rounded-lg px-3 py-1.5 text-xs ${
                      rentStatus === "none"
                        ? "bg-yellow-500 text-[#041F3E] hover:bg-yellow-400"
                        : "bg-white/10 hover:bg-white/15"
                    }`}
                    href="/order"
                    title={rentStatus === "none" ? "Start Rent contract" : "Manage contract"}
                  >
                    {rentStatus === "none" ? "Start Rent" : "Manage"}
                  </a>
                </div>
              </div>
            </div>
          </Card>
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
                  className={`px-3 py-1.5 ${
                    selectedYear === currentYear - 1
                      ? "bg-yellow-500 text-[#041F3E] font-semibold"
                      : "hover:bg-white/15"
                  }`}
                >
                  {currentYear - 1}
                </button>
                <button
                  onClick={() => setSelectedYear(currentYear)}
                  disabled={selectedYear === currentYear}
                  className={`px-3 py-1.5 ${
                    selectedYear === currentYear
                      ? "bg-yellow-500 text-[#041F3E] font-semibold"
                      : "hover:bg-white/15"
                  }`}
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
        <section className="bg-gray-800 rounded-xl p-4 md:p-6">
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
                          className={`inline-flex items-center rounded px-2 py-0.5 text-xs ${
                            (o.status || "").toLowerCase() === "paid"
                              ? "bg-green-600/70"
                              : "bg-gray-600/70"
                          }`}
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

function Card(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-800 rounded-xl p-4 md:p-5">
      <p className="text-gray-400">{props.title}</p>
      <div className="mt-2">{props.children}</div>
    </div>
  );
}

