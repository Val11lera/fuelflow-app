// src/pages/api/admin/approve.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/admin/approve
 * Body: { email: string, userId?: string }
 * Auth: Bearer <admin token>
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  const { email, userId } = (req.body || {}) as { email?: string; userId?: string };
  if (!email) return res.status(400).json({ error: "Missing email" });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const srk = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !srk) return res.status(500).json({ error: "Server misconfigured" });

  const sr = createClient(url, srk);

  // Verify admin
  const authHeader = req.headers.authorization || "";
  const jwt = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : null;
  if (!jwt) return res.status(401).json({ error: "Unauthorized" });

  const { data: caller } = await sr.auth.getUser(jwt);
  const callerEmail = caller?.user?.email?.toLowerCase();
  if (!callerEmail) return res.status(401).json({ error: "Unauthorized" });

  const { data: adminRow } = await sr.from("admins").select("email").eq("email", callerEmail).maybeSingle();
  if (!adminRow?.email) return res.status(403).json({ error: "Forbidden" });

  const lower = email.toLowerCase();

  // Approve (upsert)
  const { error: upErr } = await sr
    .from("email_allowlist")
    .upsert({ email: lower, approved_by: callerEmail }, { onConflict: "email" });
  if (upErr) return res.status(500).json({ error: upErr.message });

  // Optional: un-block if they were blocked previously
  await sr.from("blocked_users").delete().eq("email", lower).catch(() => {});

  // Optional: sign them out so approval takes effect immediately on next action
  if (userId) {
    const adminApi: any = (sr as any).auth.admin;
    try {
      if (typeof adminApi?.signOut === "function") {
        await adminApi.signOut(userId);
      } else if (typeof adminApi?.invalidateRefreshTokens === "function") {
        await adminApi.invalidateRefreshTokens(userId);
      }
    } catch {}
  }

  return res.status(200).json({ ok: true });
}
