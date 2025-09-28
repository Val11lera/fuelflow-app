// src/pages/api/admin/approvals/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: "Supabase env is missing" });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: req.headers.authorization || "" } },
  });

  // Who is calling?
  const { data: { user } } = await supabase.auth.getUser();
  const caller = user?.email?.toLowerCase();
  if (!caller) return res.status(401).json({ error: "Not logged in" });

  // Must be admin
  const { data: adminRow, error: adminErr } = await supabase
    .from("admins")
    .select("email")
    .eq("email", caller)
    .maybeSingle();
  if (adminErr) return res.status(500).json({ error: adminErr.message });
  if (!adminRow?.email) return res.status(403).json({ error: "Admins only" });

  // Payload (no-op endpoint kept for parity; you can use for bulk ops later)
  return res.status(200).json({ ok: true, note: "Use /api/admin/approvals/set for actions" });
}
