// src/pages/api/admin/approvals/set.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

type Body = {
  email?: string;
  action?: "approve" | "block" | "unblock";
  reason?: string | null;
};

// Allow common env aliases
const URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "";

const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "";

function bad(res: NextApiResponse, status: number, error: string) {
  return res.status(status).json({ error });
}
function ok(res: NextApiResponse, extra?: Record<string, unknown>) {
  return res.status(200).json({ ok: true, ...(extra || {}) });
}
function normalizeEmail(e?: string | null) {
  return (e || "").trim().toLowerCase();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return bad(res, 405, "Method not allowed");
  }

  if (!URL || !SERVICE_ROLE) {
    return bad(res, 500, "Server misconfigured: missing SUPABASE_SERVICE_ROLE or URL");
  }

  const { email: rawEmail, action, reason } = (req.body || {}) as Body;
  const email = normalizeEmail(rawEmail);
  if (!email) return bad(res, 400, "Missing email");
  if (!action) return bad(res, 400, "Missing action");

  const sr = createClient(URL, SERVICE_ROLE, { auth: { persistSession: false } });

  try {
    switch (action) {
      case "approve": {
        // Use UPSERT (idempotent) instead of insert().onConflict()
        const { error: aerr } = await sr
          .from("email_allowlist")
          .upsert({ email });

        if (aerr) return bad(res, 500, aerr.message);

        // If previously blocked, remove the block (best effort)
        const { error: derr } = await sr
          .from("blocked_users")
          .delete()
          .eq("email", email);

        if (derr) return bad(res, 500, derr.message);
        return ok(res, { action: "approve", email });
      }

      case "block": {
        // Upsert into blocked_users; also remove from allowlist
        const { error: berr } = await sr
          .from("blocked_users")
          .upsert({ email, reason: reason ?? null });

        if (berr) return bad(res, 500, berr.message);

        const { error: aerr } = await sr
          .from("email_allowlist")
          .delete()
          .eq("email", email);

        if (aerr) return bad(res, 500, aerr.message);
        return ok(res, { action: "block", email });
      }

      case "unblock": {
        const { error: derr } = await sr
          .from("blocked_users")
          .delete()
          .eq("email", email);

        if (derr) return bad(res, 500, derr.message);
        // Intentionally do NOT auto-approve here.
        return ok(res, { action: "unblock", email });
      }

      default:
        return bad(res, 400, "Invalid action");
    }
  } catch (e: any) {
    return bad(res, 500, e?.message || "Unknown error");
  }
}

