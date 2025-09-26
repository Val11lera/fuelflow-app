// src/pages/api/admin/approvals/set.ts
// src/pages/api/admin/approvals/set.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

type Body = {
  action: "approve" | "block" | "unblock";
  email: string;
  reason?: string | null;
};

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE; // REQUIRED

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    if (!URL || !SERVICE_ROLE) {
      // Do NOT allow anon fallback. This is the root cause of unblock failing.
      return res.status(500).json({ error: "Server misconfigured: missing SUPABASE_SERVICE_ROLE or URL" });
    }

    // Parse & validate
    const { action, email, reason } = (req.body || {}) as Partial<Body>;
    const emailLower = String(email || "").trim().toLowerCase();
    if (!emailLower || !["approve", "block", "unblock"].includes(String(action))) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    // Service role client (bypasses RLS)
    const sr = createClient(URL, SERVICE_ROLE);

    if (action === "approve") {
      // Add to allow-list, remove from block list
      const up = await sr.from("email_allowlist")
        .upsert({ email: emailLower }, { onConflict: "email" })
        .select("email")
        .single();
      if (up.error) return res.status(500).json({ error: up.error.message });

      // Best-effort delete from blocked
      await sr.from("blocked_users").delete().eq("email", emailLower);

      return res.status(200).json({ ok: true, action, email: emailLower });
    }

    if (action === "block") {
      // Insert/update block, remove from allow-list
      const blk = await sr.from("blocked_users")
        .upsert({ email: emailLower, reason: reason ?? null }, { onConflict: "email" })
        .select("email")
        .single();
      if (blk.error) return res.status(500).json({ error: blk.error.message });

      // Best-effort remove from allowlist
      await sr.from("email_allowlist").delete().eq("email", emailLower);

      return res.status(200).json({ ok: true, action, email: emailLower });
    }

    if (action === "unblock") {
      // The important one: delete with service role
      const del = await sr.from("blocked_users").delete().eq("email", emailLower);
      if (del.error) return res.status(500).json({ error: del.error.message });

      return res.status(200).json({ ok: true, action, email: emailLower });
    }

    // Fallback (shouldn't happen)
    return res.status(400).json({ error: "Unknown action" });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Unexpected error" });
  }
}

