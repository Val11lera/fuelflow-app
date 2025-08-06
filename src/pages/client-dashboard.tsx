import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

export default function ClientDashboard() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const getUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (data?.user) {
        setUser(data.user);
      } else {
        // Redirect if not logged in
        window.location.href = "/login";
      }
    };

    getUser();
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-yellow-400">FuelFlow</h1>
        <div>
          <a href="/client-dashboard" className="bg-yellow-500 px-4 py-2 rounded mr-2">Dashboard</a>
          <button
            onClick={() => supabase.auth.signOut().then(() => (window.location.href = "/login"))}
            className="bg-red-600 px-4 py-2 rounded"
          >
            Logout
          </button>
        </div>
      </header>

      <h2 className="text-2xl font-bold mb-4">Welcome Back, {user?.email || "Client"}!</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <div className="bg-gray-800 p-6 rounded-lg">
          <h3 className="text-xl font-semibold mb-4">Recent Orders</h3>
          <p className="text-gray-400">No recent orders.</p>
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
            <button className="bg-yellow-500 px-4 py-2 rounded mr-4">Make a Payment</button>
            <button className="bg-gray-600 px-4 py-2 rounded">View Invoices</button>
          </div>
        </div>
      </div>
    </div>
  );
}


