import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type Fuel = "petrol" | "diesel";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

// ---------- Types ----------
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
  amount: number; // pence from webhook
  currency: string;
  status: string;
};

type PriceRow = {
  fuel: Fuel | string;
  total_price: number;
  as_of?: string | null;        // date (optional)
  updated_at?: string | null;   // timestamptz (optional)
  created_at?: string | null;   // timestamptz (optional)
};

type ContractRow = {
  tank_option: "buy" | "rent";
  status: string;
  signed_at?: string | null;
  approved_at?: string | null;
  created_at?: string | null;
};

// ---------- Helpers ----------
const IDLE_MINUTES = 15; // auto logout window

function getRowTime(r: PriceRow | undefined | null): string | null {
  if (!r) return null;
  return r.updated_at || r.as_of || r.created_at || null;
}

function sameDayISO(ts: string | null, todayISO: string) {
  if (!ts) return false;
  // use date part only
  const d = ts.slice(0, 10);
  return d === todayISO;
}

function prettyDateTime(ts?: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default function ClientDashboard() {
  const [userEmail, setUserEmail] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Prices + timestamps
  const [petrolPrice, setPetrolPrice] = useState<number | null>(null);
  const [dieselPrice, setDieselPrice] = useState<number | null>(null);
  const [petrolUpdatedAt, setPetrolUpdatedAt] = useState<string | null>(null);
  const [dieselUpdatedAt, setDieselUpdatedAt] = useState<string | null>(null);

  // Contracts quick view
  const [buyStatus, setBuyStatus] = useState<string | null>(null);
  const [rentStatus, setRentStatus] = useState<string | null>(null);

  const [orders, setOrders] = useState<
    (OrderRow & { amountGBP: number; paymentStatus?: string })[]
  >([]);

  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const pricesFreshToday = useMemo(() => {
    // if both timestamps exist, require both to be today
    const checks: boolean[] = [];
    if (petrolPrice != null) checks.push(sameDayISO(petrolUpdatedAt, todayISO));
    if (dieselPrice != null) checks.push(sameDayISO(dieselUpdatedAt, todayISO));
    if (!checks.length) return false;
    return checks.every(Boolean);
  }, [petrolPrice, dieselPrice, petrolUpdatedAt, dieselUpdatedAt, todayISO]);

  // ---------- Auto-logout on inactivity ----------
  useEffect(() => {
    const reset = () => localStorage.setItem("ff:lastActivity", String(Date.now()));
    const events = ["mousemove", "keydown", "scroll", "touchstart", "visibilitychange"];
    events.forEach((ev) => window.addEventListener(ev, reset));
    reset();
    const poll = setInterval(async () => {
      const last = Number(localStorage.getItem("ff:lastActivity") || 0);
      if (Date.now() - last > IDLE_MINUTES * 60 * 1000) {
        clearInterval(poll);
        await supabase.auth.signOut();
        window.location.href = "/login?timeout=1";
      }
    }, 30 * 1000);
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, reset));
      clearInterval(poll);
    };
  }, []);

  // ---------- Load auth, prices, contracts, orders ----------
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
        // try latest_prices first (ask for possible timestamps), then latest_daily_prices, then daily_prices
        let rows: PriceRow[] = [];
        {
          const { data } = await supabase
            .from("latest_prices")
            .select("fuel,total_price,as_of,updated_at,created_at")
            .order("fuel", { ascending: true });
          if (data?.length) rows = data as PriceRow[];
        }
        if (!rows.length) {
          const { data } = await supabase
            .from("latest_daily_prices")
            .select("fuel,total_price,as_of,updated_at,created_at")
            .order("fuel", { ascending: true });
          if (data?.length) rows = data as PriceRow[];
        }
        if (!rows.length) {
          // fallback: take most recent daily_prices per fuel
          const { data } = await supabase
            .from("daily_prices")
            .select("fuel,total_price,as_of,created_at")
            .order("as_of", { ascending: false })
            .limit(200);
          if (data?.length) {
            const seen = new Set();
            for (const r of data as PriceRow[]) {
              const key = (r.fuel || "").toString().toLowerCase();
              if (!seen.has(key)) {
                rows.push(r);
                seen.add(key);
              }
            }
          }
        }

        // store price + timestamp per fuel
        for (const r of rows) {
          const f = (r.fuel || "").toString().toLowerCase() as Fuel;
          const when = getRowTime(r);
          if (f === "petrol") {
            setPetrolPrice(Number(r.total_price));
            setPetrolUpdatedAt(when);
          }
          if (f === "diesel") {
            setDieselPrice(Number(r.total_price));
            setDieselUpdatedAt(when);
          }
        }

        // CONTRACTS (latest rows by tank_option)
        {
          const { data: cx } = await supabase
            .from("contracts")
            .select("tank_option,status, signed_at, approved_at, created_at")
            .eq("email", emailLower)
            .order("created_at", { ascending: false })
            .limit(50);

          if (cx?.length) {
            const latestBy: Record<string, ContractRow> = {};
            for (const row of cx as ContractRow[]) {
              const key = row.tank_option;
              if (!latestBy[key]) latestBy[key] = row;
            }
            setBuyStatus(latestBy["buy"]?.status || null);
            setRentStatus(latestBy["rent"]?.status || null);
          }
        }

        // ORDERS with payment map
        const { data: rawOrders, error: ordErr } = await supabase
          .from("orders")
          .select(
            "id, created_at, user_email, fuel, litres, unit_price_pence, total_pence, status"
          )
          .eq("user_email", emailLower)
          .order("created_at", { ascending: false })
          .limit(20);

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
  }, []);

  // ---------- actions ----------
  async function refresh() {
    window.location.reload();
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const orderDisabled = !pricesFreshToday;

  return (
    <div className="min-h-screen bg-[#0B1728] text-white">
      {/* subtle header gradient */}
      <div className="bg-gradient-to-b from-[#0F2344] to-transparent">
        <div className="max-w-6xl mx-auto px-4 py-5 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 grid place-items-center rounded-xl bg-yellow-500 text-[#0B1728] font-bold">FF</div>
            <div>
              <h1 className="text-2xl font-bold">FuelFlow</h1>
              <p className="text-xs text-white/70">Welcome back, {userEmail}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/order"
              className={`rounded-lg px-4 py-2 font-semibold ${
                orderDisabled
                  ? "bg-gray-600 cursor-not-allowed"
                  : "bg-yellow-500 text-[#0B1728] hover:bg-yellow-400"
              }`}
              aria-disabled={orderDisabled}
              onClick={(e) => {
                if (orderDisabled) e.preventDefault();
              }}
            >
              Order Fuel
            </a>
            <button
              onClick={refresh}
              className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
              title="Reload data"
            >
              Refresh
            </button>
            <button
              onClick={logout}
              className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
              title="Sign out"
            >
              Log out
            </button>
          </div>
        </div>
      </div>

      {/* freshness warning */}
      {!pricesFreshToday && (
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-4 rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200">
            <div className="font-semibold">Prices are out of date</div>
            <div className="mt-1">
              Today’s prices haven’t been loaded yet. Click <strong>Refresh</strong> to update.
              Ordering is disabled until today’s prices are available.
            </div>
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-4 pb-12 space-y-6">
        {/* Prices + Contracts */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <PriceCard
            title="Petrol (95)"
            price={petrolPrice}
            updatedAt={petrolUpdatedAt}
          />
          <PriceCard title="Diesel" price={dieselPrice} updatedAt={dieselUpdatedAt} />
          <ContractsCard buyStatus={buyStatus} rentStatus={rentStatus} />
        </section>

        {/* errors */}
        {error && (
          <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Recent Orders */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl md:text-2xl font-semibold">Recent Orders</h2>
            <button
              onClick={refresh}
              className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/15 text-sm"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="text-white/70">Loading…</div>
          ) : orders.length === 0 ? (
            <div className="text-white/60">No orders yet.</div>
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
                  {orders.map((o) => {
                    const status = (o.status || o.paymentStatus || "pending").toLowerCase();
                    const pill =
                      status === "paid"
                        ? "bg-green-500/20 text-green-300 border-green-500/30"
                        : status.includes("failed")
                        ? "bg-red-500/20 text-red-300 border-red-500/30"
                        : "bg-white/10 text-white/80 border-white/15";
                    return (
                      <tr key={o.id} className="border-b border-white/5">
                        <td className="py-2 pr-4">{new Date(o.created_at).toLocaleString()}</td>
                        <td className="py-2 pr-4 capitalize">{(o.fuel as string) || "—"}</td>
                        <td className="py-2 pr-4">{o.litres ?? "—"}</td>
                        <td className="py-2 pr-4">{gbp.format(o.amountGBP)}</td>
                        <td className="py-2 pr-4">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${pill}`}>
                            {status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

// ---------- UI Bits ----------
function PriceCard({
  title,
  price,
  updatedAt,
}: {
  title: string;
  price: number | null;
  updatedAt: string | null;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 md:p-5 shadow-2xl">
      <p className="text-white/70">{title}</p>
      <div className="mt-2 text-3xl font-bold">
        {price != null ? gbp.format(price) : "—"}
        <span className="text-base font-normal text-white/70"> / litre</span>
      </div>
      <div className="mt-1 text-xs text-white/60">
        Last update: <span className="font-medium">{prettyDateTime(updatedAt)}</span>
      </div>
    </div>
  );
}

function ContractsCard({
  buyStatus,
  rentStatus,
}: {
  buyStatus: string | null;
  rentStatus: string | null;
}) {
  const pill = (s: string | null) => {
    if (!s) return <span className="text-white/60">—</span>;
    const v = s.toLowerCase();
    const cls =
      v === "approved"
        ? "bg-green-500/20 text-green-300 border-green-500/30"
        : v === "signed"
        ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
        : "bg-white/10 text-white/80 border-white/15";
    return (
      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${cls}`}>
        {v}
      </span>
    );
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 md:p-5 shadow-2xl">
      <p className="text-white/70">Contracts</p>
      <div className="mt-2 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm">Buy</span>
          {pill(buyStatus)}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm">Rent</span>
          {pill(rentStatus)}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <a
          href="/order"
          className="rounded-lg bg-white/10 px-3 py-2 text-center text-sm hover:bg-white/15"
        >
          View / Start
        </a>
        <a
          href="/terms"
          className="rounded-lg bg-white/10 px-3 py-2 text-center text-sm hover:bg-white/15"
        >
          Terms
        </a>
      </div>
    </div>
  );
}


