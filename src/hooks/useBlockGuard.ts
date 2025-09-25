// src/hooks/useBlockGuard.ts
import { useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/router";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export function useBlockGuard() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // If not logged in, let your existing auth logic handle redirects
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) return;

      const r = await fetch("/api/blocked/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return; // fail-open; don't brick the page
      const j = await r.json();
      if (!cancelled && j?.blocked) {
        router.replace("/access-issue?status=blocked");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);
}
