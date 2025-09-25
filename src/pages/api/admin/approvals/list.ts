// src/pages/api/admin/approvals/list.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const sr = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const anon = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });

// how far back to consider “pending” users
const LOOKBACK_DAYS = Number(process.env.APPROVALS_LOOKBACK_DAYS || "365");

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    // 1) Admin check (bearer token)
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "Missing bearer token" });

    const { data: who, error: whoErr } = await sr.auth.getUser(token);
    if (whoErr || !who?.user?.email) return res.status(401).json({ error: "Invalid token" });

    const caller = (who.user.email || "").toLowerCase();
    const { data: adminRow, error: adminErr } = await anon
      .from("admins").select("email").eq("email", caller).maybeSingle();
    if (adminErr) return res.status(500).json({ error: adminErr.message });
    if (!adminRow?.email) return res.status(403).json({ error: "Not an admin" });

    // 2) Params
    const status = String(req.query.status || "pending").toLowerCase(); // pending|allowed|blocked|all
    const limit  = Math.min( Number(req.query.limit || 200), 1000 );
    const page   = Math.max( Number(req.query.page || 1), 1 );

    // 3) Load allow+blocked
    const [allowQ, blockQ] = await Promise.all([
      anon.from("email_allowlist").select("email, created_at"),
      anon.from("blocked_users").select("email, reason, created_at"),
    ]);
    if (allowQ.error) return res.status(500).json({ error: allowQ.error.message });
    if (blockQ.error) return res.status(500).json({ error: blockQ.error.message });

    const allowed = new Map((allowQ.data || []).map((r: any) => [String(r.email).toLowerCase(), r]));
    const blocked = new Map((blockQ.data || []).map((r: any) => [String(r.email).toLowerCase(), r]));

    // 4) Source lists by status
    const items: any[] = [];
    const push = (email: string, s: "allowed"|"blocked"|"pending", meta: any = {}) =>
      items.push({ email, status: s, ...meta });

    if (status === "allowed" || status === "all") {
      for (const [email, meta] of allowed.entries()) {
        push(email, "allowed", { allowed_at: meta.created_at });
      }
    }
    if (status === "blocked" || status === "all") {
      for (const [email, meta] of blocked.entries()) {
        push(email, "blocked", { blocked_at: meta.created_at, reason: meta.reason || null });
      }
    }

    if (status === "pending" || status === "all") {
      // Pull auth users, mark those not allowed & not blocked as pending
      const perPage = 200;
      const maxPages = 10;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);

      for (let p = 1; p <= maxPages; p++) {
        const { data, error } = await sr.auth.admin.listUsers({ page: p, perPage });
        if (error) return res.status(500).json({ error: error.message });

        const list = data?.users || [];
        for (const u of list) {
          const email = (u.email || "").toLowerCase();
          if (!email) continue;
          const created = new Date(u.created_at || u.last_sign_in_at || Date.now());
          if (LOOKBACK_DAYS > 0 && created < cutoff) continue;
          if (allowed.has(email) || blocked.has(email)) continue;
          push(email, "pending", { requested_at: u.created_at || created.toISOString() });
        }
        if (list.length < perPage) break;
      }
    }

    // 5) Sort & paginate
    items.sort((a, b) => (b.requested_at || b.allowed_at || b.blocked_at || "").localeCompare(
                         (a.requested_at || a.allowed_at || a.blocked_at || "")));

    const start = (page - 1) * limit;
    const slice = items.slice(start, start + limit);

    return res.status(200).json({ items: slice, total: items.length, page, limit });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Unexpected error" });
  }
}
