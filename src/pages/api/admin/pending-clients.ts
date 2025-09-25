// src/pages/api/admin/pending-clients.ts
// src/pages/api/admin/pending-clients.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const sr = createClient(SUPABASE_URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(SUPABASE_URL, ANON, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// How far back to consider “new” users (days). Set to 365 if you want everyone.
const LOOKBACK_DAYS = Number(process.env.APPROVALS_LOOKBACK_DAYS || "90");

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    // 1) Verify caller (Bearer token) and that they’re in admins table
    const authz = req.headers.authorization || "";
    const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing bearer token" });

    const { data: who, error: whoErr } = await sr.auth.getUser(token);
    if (whoErr || !who?.user?.email) return res.status(401).json({ error: "Invalid token" });

    const callerEmail = (who.user.email || "").toLowerCase();
    const { data: adminRow, error: adminErr } = await anon
      .from("admins")
      .select("email")
      .eq("email", callerEmail)
      .maybeSingle();
    if (adminErr) return res.status(500).json({ error: adminErr.message });
    if (!adminRow?.email) return res.status(403).json({ error: "Not an admin" });

    // 2) Fetch allow-list + blocked emails
    const [allowQ, blockQ] = await Promise.all([
      anon.from("email_allowlist").select("email"),
      anon.from("blocked_users").select("email"),
    ]);
    if (allowQ.error) return res.status(500).json({ error: allowQ.error.message });
    if (blockQ.error) return res.status(500).json({ error: blockQ.error.message });

    const allowed = new Set<string>((allowQ.data || []).map((r: any) => (r.email || "").toLowerCase()));
    const blocked = new Set<string>((blockQ.data || []).map((r: any) => (r.email || "").toLowerCase()));

    // 3) Page through auth users via service role (GoTrue Admin)
    //    Keep it simple: grab first few pages (adjust perPage/pages if needed).
    const perPage = 200;
    const maxPages = 10; // up to 2000 users; increase if you have more.
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);

    const pending: { id: string; email: string; created_at: string }[] = [];

    for (let page = 1; page <= maxPages; page++) {
      const { data, error } = await sr.auth.admin.listUsers({ page, perPage });
      if (error) return res.status(500).json({ error: error.message });

      const list = data?.users || [];
      for (const u of list) {
        const email = (u.email || "").toLowerCase();
        if (!email) continue;

        // Skip service/system accounts if any rule you want; currently none
        const createdAt = new Date(u.created_at || u.last_sign_in_at || Date.now());
        const isRecent = LOOKBACK_DAYS <= 0 ? true : createdAt >= cutoff;

        // A “pending” user is someone not allowed and not blocked.
        if (isRecent && !allowed.has(email) && !blocked.has(email)) {
          pending.push({ id: u.id, email, created_at: u.created_at || createdAt.toISOString() });
        }
      }

      // Stop early if we saw fewer than perPage (no more pages)
      if (list.length < perPage) break;
    }

    // Sort newest first
    pending.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return res.status(200).json({ items: pending });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Unexpected error" });
  }
}
