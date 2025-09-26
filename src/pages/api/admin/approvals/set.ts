// src/pages/api/admin/approvals/set.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

// If you ever move this to /app route handlers, you'll want: export const runtime = "nodejs";

type Body = {
  email?: string;
  action?: "approve" | "block" | "unblock";
  reason?: string | null;
};

// ---- Resolve envs (support a couple of common aliases) ----
const URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "";

const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "";

/** Reusable JSON helpers */
function bad(res: NextApiResponse, status: number, error: string) {
  return res.status(status).json({ error });
}
function ok(res: NextApiResponse, extra?: Record<string, unknown>) {
  return res.status(200).json({ ok: true, ...(extra || {}) });
}

/** Very light email check; we lower-case and trim either way */
function normalizeEmail(e?: string | null) {
  return (e || "").trim().toLowerCase();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Require POST
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return bad(res, 405, "Method not allowed");
  }

  // Fail fast if server is missing envs
  if (!URL || !SERVICE_ROLE) {
    return bad(res, 500, "Server misconfigured: missing SUPABASE_SERVICE_ROLE or URL");
  }

  // Parse / validate body
  const { email: rawEmail, action, reason } = (req.body || {}) as Body;
  const email = normalizeEmail(rawEmail);
  if (!email) return bad(res, 400, "Missing email");
  if (!action) return bad(res, 400, "Missing action");

  // Create a SERVICE-ROLE client (bypasses RLS as intended for admin actions)
  const sr = createClient(URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  try {
    switch (action) {
      case "approve": {
        // Add to allow-list; harmless if it already exists
        const { error: aerr } = await sr
          .from("email_allowlist")
          .insert({ email })
          .onConflict("email")
          .ignore();

        if (aerr) return bad(res, 500, aerr.message);

        // If previously blocked, remove from blocked list (idempotent)
        const { error: derr } = await sr
          .from("blocked_users")
          .delete()
          .eq("email", email);

        if (derr) return bad(res, 500, derr.message);

        return ok(res, { action: "approve", email });
      }

      case "block": {
        // Add to blocked_users (upsert), and remove from allow-list so it doesn't look approved
        const { error: berr } = await sr
          .from("blocked_users")
          .upsert({ email, reason: reason ?? null })
          .select()
          .single(); // single() forces error if nothing is returned

        if (berr) return bad(res, 500, berr.message);

        // Best-effort cleanup in allowlist (no error if not present)
        const { error: aerr } = await sr
          .from("email_allowlist")
          .delete()
          .eq("email", email);

        if (aerr) return bad(res, 500, aerr.message);

        return ok(res, { action: "block", email });
      }

      case "unblock": {
        // Remove from block list
        const { error: derr } = await sr
          .from("blocked_users")
          .delete()
          .eq("email", email);

        if (derr) return bad(res, 500, derr.message);

        // (Optional) DO NOT auto-approve on unblock; admin can click Approve separately if desired
        return ok(res, { action: "unblock", email });
      }

      default:
        return bad(res, 400, "Invalid action");
    }
  } catch (e: any) {
    return bad(res, 500, e?.message || "Unknown error");
  }
}
