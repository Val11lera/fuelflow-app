// src/pages/client-dashboard.tsx
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// ---------- Types ----------
type QuoteRow = {
  id: string;
  email: string;
  full_name: string | null;
  message: string | null;
  created_at: string;
};

type OrderRow = {
  id: string;
  user_email: string;
  product: string;
  amount: number; // numeric
  status: string; // 'paid' | 'pending' | 'failed' | etc
  created_at: string;
};

type Fuel = "petrol" | "diesel";

type PriceRow = {
  fuel_type: Fuel;
  total_price: number; // comes from numeric column
  effective_at: string;
};

// ---------- Supabase client ----------
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

// ---------- Helpers ----------
function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  }).format(n);
}

const toNum = (v: unknown) =>
  typeof v === "number" ? v : parseFloat(String(v ?? "NaN"));

// ---------- Component ----------
export default function ClientDashboard() {
  const [user, setUser] = useState<any>(null);

  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loadingQuotes, setLoadingQuotes] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [quotesErr, setQuotesErr] = useState<string | null>(null);
  const [ordersErr, setOrdersErr] = useState<string | null>(null);

  // prices
  const [petrolPrice, setPetrolPrice] = useState<number | null>(null);
  const [dieselPrice, setDieselPrice] = useState<number | null>(null);
  const [pricesLoading, setPricesLoading] = useState<boolean>(true);
  const [pricesErr, setPricesErr] = useState<string | null>(null);

  // ---------- Fetch helpers ----------
  async function fetchLatestPrice(fuel: Fuel) {
    const { data, error } = await supabase
      .from("daily_prices")
      .select("fuel_type,total_price,effective_at")
      .eq("fuel_type", fuel)
      .order("effective_at", { ascending: false })
      .limit(1)
      .maybeSingle<PriceRow>();

    if (error) throw error;
    if (!data) return null;
    return { ...data, total_price: toNum(data.total_price) };
  }

  async function loadPrices() {
    setPricesLoading(true);
    setPricesErr(null);
    try {
      const [pet, die] = await Promise.all([
        fetchLatestPrice("petrol"),
        fetchLatestPrice("diesel"),
      ]);
      setPetrolPrice(pet ? toNum(pet.total_price) : null);
      setDieselPrice(die ? toNum(die.total_price) : null);
    } catch (e: any) {
      setPricesErr(e?.message ?? "Failed to load prices");
      setPetrolPrice(null);
      setDieselPrice(null);
    } finally {
      setPricesLoading(false);
    }
  }

  // ---------- Init ----------
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        window.location.href = "/login";
        return;
      }
      setUser(data.user);

      const isAdmin =
        (data.user.email || "").toLowerCase() === "fuelflow.queries@gmail.com";

      // Quotes
      setLoadingQuotes(true);
      setQuotesErr(null);
      {
        let q = supabase
          .from("quote_requests")
          .select("id,email,full_name,message,created_at")
          .order("created_at", { ascending: false });

        if (!isAdmin) q = q.eq("email", data.user.email);

        const { data: rows, error } = await q;
        if (error) {
          setQuotesErr(error.message);
          setQuotes([]);
        } else {
          setQuotes((rows as QuoteRow[]) || []);
        }
        setLoadingQuotes(false);
      }

      // Orders
      setLoadingOrders(true);
      setOrdersErr(null);
      {
        let q = supabase
          .from("orders")
          .select("id,user_email,product,amount,status,created_at")
          .order("created_at", { ascending: false });

        if (!isAdmin) q = q.eq("user_email", data.user.email);

        const { data: rows, error } = await q;
        if (error) {
          setOrdersErr(error.message);
          setOrders([]);
        } else {
          setOrders((rows as OrderRow[]) || []);
        }
        setLoadingOrders(false);
      }

      // Prices
      loadPrices();
    };

    init();
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-yellow-400">FuelFlow</h1>
        <div className="flex gap-2">
          <a
            href="/client-dashboard"
            className="bg-yellow-500 px-4 py-2 rounded transition hover:bg-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-400"
          >
            Dashboard
          </a>
          <button
            onClick={() =>
              supabase.auth
                .signOut()
                .then(() => (window.location.href = "/login"))
            }
            className="bg-red-600 px-4 py-2 rounded transition hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            Logout
          </button>
        </div>
      </header>

      <h2 className="text-2xl font-bold mb-4">
        Welcome Back, {user?.email || "Client"}!
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Quote Requests */}
        <div className="bg-gray-800 p-6 rounded-lg">
          <h3 className="text-xl font-semibold mb-4">Quote Requests</h3>

          {loadingQuotes && <p className="text-gray-400">Loading…</p>}
          {!loadingQuotes && quotesErr && (
            <p className="text-red-400">Error: {quotesErr}</p>
          )}
          {!loadingQuotes && !quotesErr && quotes.length === 0 && (
            <p className="text-gray-400">No quote requests yet.</p>
          )}
          {!loadingQuotes && !quotesErr && quotes.length > 0 && (
            <ul className="divide-y divide-gray-700">
              {quotes.map((q) => (
                <li key={q.id} className="py-3">
                  <div className="flex justify-between">
                    <div className="pr-4">
                      <p className="font-medium">
                        {q.full_name || "—"}{" "}
                        <span className="text-gray-400">({q.email})</span>
                      </p>
                      <p className="text-gray-300">{q.message || "—"}</p>
                    </div>
                    <div className="text-right text-gray-400 whitespace-nowrap">
                      {new Date(q.created_at).toLocaleString()}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Account Details */}
        <div className="bg-gray-800 p-6 rounded-lg">
          <h3 className="text-xl font-semibold mb-4">Account Details</h3>
          <p>
            <strong>Email:</strong> {user?.email}
          </p>
          <p>
            <strong>Company:</strong> test
          </p>
          <p>
            <strong>Contact:</strong> test
          </p>
        </div>

        {/* Contract Prices (live) */}
        <div className="bg-gray-800 p-6 rounded-lg col-span-1 md:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold">Your Contract Prices</h3>
            <div className="flex items-center gap-3">
              {pricesErr && (
                <span className="text-red-400 text-sm">{pricesErr}</span>
              )}
              <button
                onClick={loadPrices}
                className="text-sm bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded"
                disabled={pricesLoading}
              >
                {pricesLoading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>

          <ul className="space-y-2">
            <li className="flex justify-between">
              <span>Unleaded Petrol (95)</span>
              <span className="text-yellow-400 font-bold">
                {pricesLoading ? "…" : money(petrolPrice)}
              </span>
            </li>
            <li className="flex justify-between">
              <span>Diesel</span>
              <span className="text-yellow-400 font-bold">
                {pricesLoading ? "…" : money(dieselPrice)}
              </span>
            </li>
          </ul>
          <p className="text-xs text-gray-400 mt-2">
            Prices shown are the latest for each fuel.
          </p>
        </div>

        {/* Recent Orders */}
        <div className="bg-gray-800 p-6 rounded-lg col-span-1 md:col-span-2">
          <h3 className="text-xl font-semibold mb-4">Recent Orders</h3>

          {loadingOrders && <p className="text-gray-400">Loading…</p>}
          {!loadingOrders && ordersErr && (
            <p className="text-red-400">Error: {ordersErr}</p>
          )}
          {!loadingOrders && !ordersErr && orders.length === 0 && (
            <p className="text-gray-400">No recent orders.</p>
          )}
          {!loadingOrders && !ordersErr && orders.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-300">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Customer</th>
                    <th className="py-2 pr-4">Product</th>
                    <th className="py-2 pr-4">Amount</th>
                    <th className="py-2 pr-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {new Date(o.created_at).toLocaleString()}
                      </td>
                      <td className="py-2 pr-4">{o.user_email}</td>
                      <td className="py-2 pr-4">{o.product}</td>
                      <td className="py-2 pr-4">£{Number(o.amount).toFixed(2)}</td>
                      <td className="py-2 pr-4">
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            o.status === "paid"
                              ? "bg-green-600"
                              : o.status === "pending"
                              ? "bg-yellow-600"
                              : "bg-red-600"
                          }`}
                        >
                          {o.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Billing (static) */}
        <div className="bg-gray-800 p-6 rounded-lg col-span-1 md:col-span-2">
          <h3 className="text-xl font-semibold mb-4">Billing</h3>
          <p>You have no outstanding payments.</p>
          <div className="mt-4 flex gap-3">
            <button className="bg-yellow-500 px-4 py-2 rounded transition hover:bg-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-400">
              Make a Payment
            </button>
            <button className="bg-gray-600 px-4 py-2 rounded transition hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500">
              View Invoices
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
