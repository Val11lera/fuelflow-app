// src/pages/api/admin/approvals/set.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

// Requires these env vars on Vercel/local:
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE!;

// Service-role client (bypasses RLS for the DB mutations we do here)
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

type Body = {
  email?: string;
  action?: "approve" | "block" | "unblock";
  reason?: string | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const { email, action, reason }: Body = req.body || {};
    if (!email || !action) return res.status(400).send("Missing email or action");

    // Validate caller: must be a logged-in admin.
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return res.status(401).send("Missing bearer token");

    const { data: userRes, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userRes?.user) return res.status(401).send("Invalid token");

    const callerEmail = (userRes.user.email || "").toLowerCase();
    const { data: adminRow, error: admErr } = await admin
      .from("admins")
      .select("email")
      .eq("email", callerEmail)
      .maybeSingle();

    if (admErr) return res.status(500).send(admErr.message);
    if (!adminRow?.email) return res.status(403).send("Forbidden: not an admin");

    const target = email.toLowerCase();

    if (action === "approve") {
      // Add to allowlist, remove from blocked if present
      const { error: upErr } = await admin
        .from("email_allowlist")
        .upsert({ email: target }, { onConflict: "email" });
      if (upErr) return res.status(400).send(upErr.message);

      const { error: delBlockErr } = await admin
        .from("blocked_users")
        .delete()
        .eq("email", target);
      if (delBlockErr) return res.status(400).send(delBlockErr.message);

      return res.status(200).json({ ok: true, action });
    }

    if (action === "block") {
      // Add/update in blocked_users, remove from allowlist
      const { error: blkErr } = await admin
        .from("blocked_users")
        .upsert(
          {
            email: target,
            reason: reason ?? null,
            // keep created_at default; include user_id if your table has it nullable
          },
          { onConflict: "email" }
        );
      if (blkErr) return res.status(400).send(blkErr.message);

      const { error: delAllowErr } = await admin
        .from("email_allowlist")
        .delete()
        .eq("email", target);
      if (delAllowErr) return res.status(400).send(delAllowErr.message);

      return res.status(200).json({ ok: true, action });
    }

    if (action === "unblock") {
      const { error: delErr } = await admin.from("blocked_users").delete().eq("email", target);
      if (delErr) return res.status(400).send(delErr.message);

      return res.status(200).json({ ok: true, action });
    }

    return res.status(400).send("Unknown action");
  } catch (e: any) {
    return res.status(500).send(e?.message || "Server error");
  }
}

