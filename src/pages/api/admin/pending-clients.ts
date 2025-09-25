// src/pages/api/admin/pending-clients.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/admin/pending-clients
 * Auth: Bearer <admin access token>
 * Returns: [{ id, email, created_at }]
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).send("Method not allowed");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const srk = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !srk) return res.status(500).json({ error: "Server misconfigured" });

  const sr = createClient(url, srk);

  // Verify caller is admin
  const authHeader = req.headers.authorization || "";
  const jwt = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : null;
  if (!jwt) return res.status(401).json({ error: "Unauthorized" });

  const { data: caller } = await sr.auth.getUser(jwt);
  const callerEmail = caller?.user?.email?.toLowerCase();
  if (!callerEmail) return res.status(401).json({ error: "Unauthorized" });

  const { data: adminRow } = await sr.from("admins").select("email").eq("email", callerEmail).maybeSingle();
  if (!adminRow?.email) return res.status(403).json({ error: "Forbidden" });

  // List recent users from auth.users that are NOT in email_allowlist
  // (You can filter by created_at to keep it short)
  const { data: users } = await sr
    .schema("auth")
    .from("users")
    .select("id, email, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const emails = (users || [])
    .map(u => (u.email || "").toLowerCase())
    .filter(Boolean);

  if (emails.length === 0) return res.status(200).json({ items: [] });

  const { data: allowed } = await sr
    .from("email_allowlist")
    .select("email")
    .in("email", emails);

  const allowedSet = new Set((allowed || []).map(a => a.email.toLowerCase()));

  const pending = (users || [])
    .filter(u => u.email && !allowedSet.has(u.email.toLowerCase()))
    .map(u => ({ id: u.id, email: u.email, created_at: u.created_at }));

  return res.status(200).json({ items: pending });
}
