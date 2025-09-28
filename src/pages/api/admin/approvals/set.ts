// src/pages/api/admin/approvals/set.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

type Action = "approve" | "block" | "unblock";

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

  // Auth (caller)
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

  // Inputs
  const body = (req.body || {}) as { email?: string; action?: Action; reason?: string | null };
  const target = (body.email || "").toLowerCase();
  const action = body.action as Action;
  const reason = body.reason ?? null;

  if (!target || !action) {
    return res.status(400).json({ error: "Missing email or action" });
  }

  try {
    if (action === "approve") {
      // Approve = allow + ensure unblocked
      const { error: aErr } = await supabase.from("email_allowlist").upsert({ email: target });
      if (aErr) throw aErr;
      const { error: dErr } = await supabase.from("blocked_users").delete().eq("email", target);
      if (dErr) throw dErr;
    }

    if (action === "block") {
      // Block = add to blocked_users (do NOT remove from allowlist)
      const { error: bErr } = await supabase
        .from("blocked_users")
        .upsert({ email: target, reason });
      if (bErr) throw bErr;

      // Optional: you can sign the user out of all sessions by revoking refresh tokens here if you track user_id.
      // Not implemented since we use email-only here.
    }

    if (action === "unblock") {
      // Unblock = simply remove from blocked_users (keep allowlist as-is)
      const { error: uErr } = await supabase.from("blocked_users").delete().eq("email", target);
      if (uErr) throw uErr;
    }

    return res.status(200).json({ ok: true, action, email: target });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Action failed" });
  }
}
