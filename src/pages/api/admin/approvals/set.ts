// src/pages/api/admin/approvals/set.ts
// src/pages/api/admin/approvals/set.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const sr = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const anon = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });

// Helper: find a user id by email (pages through first few pages)
async function findUserIdByEmail(emailLower: string): Promise<string | null> {
  const perPage = 200;
  const maxPages = 10; // increase if you have more than ~2k users
  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await sr.auth.admin.listUsers({ page, perPage });
    if (error) return null; // best effort
    const hit = data?.users?.find((u) => (u.email || "").toLowerCase() === emailLower);
    if (hit?.id) return hit.id;
    if ((data?.users?.length || 0) < perPage) break;
  }
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    // ---- Admin auth (Bearer) ----
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "Missing bearer token" });

    const { data: who, error: whoErr } = await sr.auth.getUser(token);
    if (whoErr || !who?.user?.email) return res.status(401).json({ error: "Invalid token" });

    const caller = (who.user.email || "").toLowerCase();
    const { data: adminRow, error: adminErr } = await anon
      .from("admins")
      .select("email")
      .eq("email", caller)
      .maybeSingle();
    if (adminErr) return res.status(500).json({ error: adminErr.message });
    if (!adminRow?.email) return res.status(403).json({ error: "Not an admin" });

    // ---- Params ----
    const { email: rawEmail, action, reason } = req.body || {};
    const email = String(rawEmail || "").toLowerCase();
    if (!email || !action) return res.status(400).json({ error: "email and action are required" });

    if (action === "approve") {
      // Upsert into allow-list
      const up = await anon.from("email_allowlist").upsert({ email }).select().single();
      if (up.error) return res.status(500).json({ error: up.error.message });

      // Remove from blocked if present (ignore error)
      const { error: delBlockErr } = await anon.from("blocked_users").delete().eq("email", email);
      // ignore delBlockErr

      return res.status(200).json({ ok: true, status: "allowed" });
    }

    if (action === "block") {
      // Add to blocked (with optional reason)
      const up = await anon
        .from("blocked_users")
        .upsert({ email, reason: reason || null })
        .select()
        .single();
      if (up.error) return res.status(500).json({ error: up.error.message });

      // Remove from allow-list (ignore error)
      const { error: delAllowErr } = await anon.from("email_allowlist").delete().eq("email", email);
      // ignore delAllowErr

      // Best-effort: invalidate sessions for this user
      const uid = await findUserIdByEmail(email);
      if (uid) {
        try {
          await sr.auth.admin.invalidateUserSessions(uid);
        } catch {
          /* ignore */
        }
      }

      return res.status(200).json({ ok: true, status: "blocked" });
    }

    if (action === "unblock") {
      const { error } = await anon.from("blocked_users").delete().eq("email", email);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true, status: "pending" });
    }

    if (action === "remove-allow") {
      const { error } = await anon.from("email_allowlist").delete().eq("email", email);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true, status: "pending" });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Unexpected error" });
  }
}

