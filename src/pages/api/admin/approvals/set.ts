// src/pages/api/admin/approvals/set.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const sr = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const anon = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "Missing bearer token" });

    const { data: who, error: whoErr } = await sr.auth.getUser(token);
    if (whoErr || !who?.user?.email) return res.status(401).json({ error: "Invalid token" });

    const caller = (who.user.email || "").toLowerCase();
    const { data: adminRow, error: adminErr } = await anon
      .from("admins").select("email").eq("email", caller).maybeSingle();
    if (adminErr) return res.status(500).json({ error: adminErr.message });
    if (!adminRow?.email) return res.status(403).json({ error: "Not an admin" });

    const { email: rawEmail, action, reason } = req.body || {};
    const email = String(rawEmail || "").toLowerCase();
    if (!email || !action) return res.status(400).json({ error: "email and action are required" });

    if (action === "approve") {
      // add to allow, remove from block (if present)
      const up = await anon.from("email_allowlist").upsert({ email }).select().single();
      if (up.error) return res.status(500).json({ error: up.error.message });
      await anon.from("blocked_users").delete().eq("email", email);
      return res.status(200).json({ ok: true, status: "allowed" });
    }

    if (action === "block") {
      // add to block, remove from allow, and sign out user immediately
      const up = await anon.from("blocked_users").upsert({ email, reason: reason || null }).select().single();
      if (up.error) return res.status(500).json({ error: up.error.message });
      await anon.from("email_allowlist").delete().eq("email", email).catch(() => {});
      // invalidate sessions (best-effort)
      const { data: list } = await sr.auth.admin.listUsers({ page: 1, perPage: 1, email });
      const uid = list?.users?.[0]?.id;
      if (uid) await sr.auth.admin.invalidateUserSessions(uid).catch(() => {});
      return res.status(200).json({ ok: true, status: "blocked" });
    }

    if (action === "unblock") {
      // remove from block only (does not auto-approve)
      await anon.from("blocked_users").delete().eq("email", email);
      return res.status(200).json({ ok: true, status: "pending" });
    }

    if (action === "remove-allow") {
      await anon.from("email_allowlist").delete().eq("email", email);
      return res.status(200).json({ ok: true, status: "pending" });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Unexpected error" });
  }
}
