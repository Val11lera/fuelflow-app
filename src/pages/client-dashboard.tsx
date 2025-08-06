import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

export default function ClientDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const verifySession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/login"); // ✅ redirect to login if not logged in
      } else {
        setLoading(false); // ✅ session valid, render dashboard
      }
    };

    verifySession();
  }, [router]);

  if (loading) return <p className="text-center p-10">Loading...</p>;

  return <h1 className="text-center p-10">Welcome to your dashboard</h1>;
}

