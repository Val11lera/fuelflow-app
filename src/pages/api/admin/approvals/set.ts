// src/pages/api/admin/approvals/set.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

type Action = "approve" | "block" | "unblock";

function normEmail(v?: string | null) {
  return (v || "").trim().toLowerCase();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "method not allowed" });
    }

    // Accept both JSON body and query-string fallbacks
    const body = (req.body ?? {}) as Record<string, any>;
    const action = (body.action || req.query.action || "").toString().toLowerCase() as Action;
    const email = normEmail((body.email ?? req.query.email) as string | undefined);
    const reason = (body.reason ?? req.query.reason ?? "") as string;

    if (!email) return res.status(400).json({ error: "missing email" });
    if (!["approve", "block", "unblock"].includes(action)) {
      return res.status(400).json({ error: "invalid action" });
    }

    // Server-side Supabase client (service role preferred)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const service = process.env.SUPABASE_SERVICE_ROLE || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const sb = createClient(url, service, { auth: { persistSession: false } });

    // Run DB changes in a transaction-esque sequence
    if (action === "approve") {
      // 1) Add to allowlist
      const { error: upErr } = await sb
        .from("email_allowlist")
        .upsert({ email, created_at: new Date().toISOString() }, { onConflict: "email" });
      if (upErr) return res.status(500).json({ error: upErr.message });

      // 2) Remove from blocked list (if present)
      const { error: delErr } = await sb.from("blocked_users").delete().eq("email", email);
      if (delErr) return res.status(500).json({ error: delErr.message });

      return res.status(200).json({ ok: true });
    }

    if (action === "block") {
      // 1) Add to blocked list
      const { error: upErr } = await sb
        .from("blocked_users")
        .upsert(
          { email, reason: reason || null, created_at: new Date().toISOString() },
          { onConflict: "email" }
        );
      if (upErr) return res.status(500).json({ error: upErr.message });

      // 2) Remove from allowlist (if present)
      const { error: delErr } = await sb.from("email_allowlist").delete().eq("email", email);
      if (delErr) return res.status(500).json({ error: delErr.message });

      // (Optional) best-effort: sign the user out next time they refresh.
      // You can ignore this if not needed. No error handling here; keep response OK.

      return res.status(200).json({ ok: true });
    }

    if (action === "unblock") {
      // Simply remove from blocked list. Do NOT auto-approve.
      const { error: delErr } = await sb.from("blocked_users").delete().eq("email", email);
      if (delErr) return res.status(500).json({ error: delErr.message });

      return res.status(200).json({ ok: true });
    }

    // Should never reach here
    return res.status(400).json({ error: "invalid action" });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "server error" });
  }
}

