import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type QuoteRow = {
  id: string;
  email: string;
  full_name: string | null;
  message: string | null;
  created_at: string;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

export default function ClientDashboard() {
  const [user, setUser] = useState<any>(null);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [loadingQuotes, setLoadingQuotes] = useState(true);
  const [quotesErr, setQuotesErr] = useState<string | null>(null);

  // 1) Ensure the user is logged in, then fetch their quotes
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        setUser(data.user);
        await loadQuotesForEmail(data.user.email as string);
        // 2) Optional realtime updates for inserts
        supabase
          .channel("quote_requests_changes")
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "quote_requests" },
            (payload) => {
              const row = payload.new as QuoteRow;
              if (row.email === data.user?.email) {
                setQuotes((prev) => [row, ...prev]);
              }
            }
          )
          .subscribe();
      } else {
        window.location.href = "/login";
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadQuotesForEmail = async (email: string) => {
    setLoadingQuotes(true);
    setQuotesErr(null);
    const { data, error } = await supabase
      .from("quote_requests")
      .select("id,email,full_name,message,created_at")
      .eq("email", email)
      .order("created_at", { ascending: false });

    if (error) {
      setQuotesErr(error.message);
      setQuotes([]);
    } else {
      setQuotes((data as QuoteRow[]) || []);
    }
    setLoadingQuotes(false);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-yellow-400">FuelFlow</h1>
        <div>
          <a href="/client-dashboard" className="bg-yellow-500 px-4 py-2 rounded mr-2">
            Dashboard
          </a>
          <button
            onClick={() =>
              supabase.auth.signOut().then(() => (window.location.href = "/login"))
            }
            className="bg-red-600 px-4 py-2 rounded"
          >
            Logout
          </button>
        </div>
      </header>

      <h2 className="text-2xl font-bold mb-4">
        Welcome Back, {user?.email || "Client"}!
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent Orders -> showing your Quote Requests */}
        <div className="bg-gray-800 p-6 rounded-lg">
          <h3 className="text-xl font-semibold mb-4">Recent Orders</h3>

          {loadingQuotes && (
            <p className="text-gray-400">Loading your requests…</p>
          )}

          {!loadingQuotes && quotesErr && (
            <p className="text-red-400">Error: {quotesErr}</p>
          )}

          {!loadingQuotes && !quotesErr && quotes.length === 0 && (
            <p className="text-gray-400">No recent orders.</p>
          )}

          {!loadingQuotes && !quotesErr && quotes.length > 0 && (
            <ul className="divide-y divide-gray-700">
              {quotes.map((q) => (
                <li key={q.id} className="py-3">
                  <div className="flex justify-between">
                    <div className="pr-4">
                      <p className="font-medium">
                        {q.full_name || "—"} <span className="text-gray-400">({q.email})</span>
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
          <p><strong>Email:</strong> {user?.email}</p>
          <p><strong>Company:</strong> test</p>
          <p><strong>Contact:</strong> test</p>
        </div>

        {/* Contract Prices */}
        <div className="bg-gray-800 p-6 rounded-lg col-span-1 md:col-span-2">
          <h3 className="text-xl font-semibold mb-4">Your Contract Prices</h3>
          <ul className="space-y-2">
            <li className="flex justify-between">
              <span>Unleaded Petrol (95)</span>
              <span className="text-yellow-400 font-bold">£1.45</span>
            </li>
            <li className="flex justify-between">
              <span>Diesel</span>
              <span className="text-yellow-400 font-bold">£1.52</span>
            </li>
          </ul>
        </div>

        {/* Billing */}
        <div className="bg-gray-800 p-6 rounded-lg col-span-1 md:col-span-2">
          <h3 className="text-xl font-semibold mb-4">Billing</h3>
          <p>You have no outstanding payments.</p>
          <div className="mt-4">
            <button className="bg-yellow-500 px-4 py-2 rounded mr-4">
              Make a Payment
            </button>
            <button className="bg-gray-600 px-4 py-2 rounded">View Invoices</button>
          </div>
        </div>
      </div>
    </div>
  );
}

