// src/pages/api/admin/approvals/set.ts
// src/pages/api/admin/approvals/set.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type Body = {
  email?: string;
  action?: "approve" | "block";
  reason?: string | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 1) Require and forward the user's JWT
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  // Supabase client that forwards the token to PostgREST ⇒ RLS sees auth.email()
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: authHeader } },
  });

  // 2) Inputs
  const { email, action, reason }: Body = (req.body || {}) as Body;
  const lower = String(email || "").trim().toLowerCase();
  if (!lower) return res.status(400).json({ error: "email required" });
  if (action !== "approve" && action !== "block") {
    return res.status(400).json({ error: "invalid action" });
  }

  try {
    if (action === "block") {
      // Insert/update into block list (guarded by RLS -> admin only)
      const { error: insErr } = await sb
        .from("blocked_users")
        .upsert({ email: lower, reason: reason ?? null })
        .select()
        .single();
      if (insErr) return res.status(403).json({ error: insErr.message });

      // Best-effort: remove from allow list
      await sb.from("email_allowlist").delete().eq("email", lower);

      return res.status(200).json({ ok: true, status: "blocked" });
    } else {
      // Approve: add to allow list
      const { error: upErr } = await sb
        .from("email_allowlist")
        .upsert({ email: lower })
        .select()
        .single();
      if (upErr) return res.status(403).json({ error: upErr.message });

      // Best-effort: remove from block list
      await sb.from("blocked_users").delete().eq("email", lower);

      return res.status(200).json({ ok: true, status: "approved" });
    }
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}

