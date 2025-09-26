// src/pages/api/admin/approvals/set.ts
// src/pages/api/admin/approvals/set.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

// --- Supabase clients ---
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Service-role for admin auth checks; anon for regular table access
const sr = createClient(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(URL, ANON, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    // ---- Admin auth via Bearer token ----
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
    const { email: rawEmail, action, reason } = (req.body ?? {}) as {
      email?: string;
      action?: "approve" | "block" | "unblock" | "remove-allow";
      reason?: string;
    };

    const email = String(rawEmail || "").toLowerCase();
    if (!email || !action) return res.status(400).json({ error: "email and action are required" });

    // ---- Actions ----

    // Approve: add to allow-list, remove from blocked (if present)
    if (action === "approve") {
      const up = await anon.from("email_allowlist").upsert({ email }).select().single();
      if (up.error) return res.status(500).json({ error: up.error.message });

      // best-effort cleanup from blocked
      await anon.from("blocked_users").delete().eq("email", email);

      return res.status(200).json({ ok: true, status: "allowed" });
    }

    // Block: add to blocked, remove from allow-list (and rely on app guards to deny access)
    if (action === "block") {
      const up = await anon
        .from("blocked_users")
        .upsert({ email, reason: reason || null })
        .select()
        .single();
      if (up.error) return res.status(500).json({ error: up.error.message });

      // best-effort cleanup from allow-list
      await anon.from("email_allowlist").delete().eq("email", email);

      // Note: supabase-js v2 has no admin.invalidateUserSessions().
      // Access is blocked on next request via your guards (blocked_users check / RLS / middleware).
      return res.status(200).json({ ok: true, status: "blocked" });
    }

    // Unblock: remove from blocked (does not auto-approve)
    if (action === "unblock") {
      const { error } = await anon.from("blocked_users").delete().eq("email", email);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true, status: "pending" });
    }

    // Remove-allow: delete from allow-list (becomes pending)
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
