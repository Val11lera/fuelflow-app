// src/pages/api/admin/block.ts
// src/pages/api/admin/block.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/admin/block
 * Body: { userId?: string; email?: string; action: "block"|"unblock"; reason?: string }
 *
 * Requires:
 *  - Authorization: Bearer <admin access token>
 *  - SERVICE ROLE key on server to upsert into blocked_users and query auth.users
 *
 * Side effects:
 *  - Upsert/delete row in public.blocked_users
 *  - If userId is known: invalidate sessions (signOut or invalidateRefreshTokens)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  const { userId, email, action, reason } = (req.body || {}) as {
    userId?: string;
    email?: string;
    action?: "block" | "unblock";
    reason?: string;
  };

  if (!action || (!userId && !email)) {
    return res.status(400).json({ error: "Missing fields: action and (userId or email) are required." });
  }

  // --- Server-side Supabase client (SERVICE ROLE KEY!) ---
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const SR_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!SUPABASE_URL || !SR_KEY) {
    return res.status(500).json({ error: "Server misconfigured: Supabase env vars missing." });
  }
  const sr = createClient(SUPABASE_URL, SR_KEY);

  // --- Verify caller is an admin via Bearer token ---
  const authHeader = req.headers.authorization || "";
  const jwt = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : null;
  if (!jwt) return res.status(401).json({ error: "Unauthorized" });

  const { data: caller, error: callerErr } = await sr.auth.getUser(jwt);
  if (callerErr || !caller?.user?.email) return res.status(401).json({ error: "Unauthorized" });

  const callerEmail = caller.user.email.toLowerCase();
  const { data: adminRow, error: adminErr } = await sr
    .from("admins")
    .select("email")
    .eq("email", callerEmail)
    .maybeSingle();
  if (adminErr || !adminRow?.email) return res.status(403).json({ error: "Forbidden" });

  // --- Resolve target userId if only email provided ---
  let targetId: string | null = userId || null;
  const targetEmail = (email || "").toLowerCase();

  if (!targetId && targetEmail) {
    const { data: row } = await sr
      .schema("auth")             // query auth.users with service role
      .from("users")
      .select("id, email")
      .eq("email", targetEmail)
      .maybeSingle();
    if (row?.id) targetId = row.id as string;
  }

  if (action === "block") {
    // Upsert into blocked_users using whatever identifiers we have
    const payload: Record<string, any> = {
      reason: reason || null,
      blocked_by: callerEmail,
    };
    if (targetId) payload.user_id = targetId;
    if (targetEmail) payload.email = targetEmail;

    const { error: upErr } = await sr
      .from("blocked_users")
      .upsert(payload, { onConflict: "user_id,email" });
    if (upErr) return res.status(500).json({ error: upErr.message });

    // If we know the userId, invalidate their sessions immediately
    if (targetId) {
      const adminApi: any = (sr as any).auth.admin;
      try {
        if (typeof adminApi?.signOut === "function") {
          // Newer SDKs
          await adminApi.signOut(targetId);
        } else if (typeof adminApi?.invalidateRefreshTokens === "function") {
          // Older SDKs
          await adminApi.invalidateRefreshTokens(targetId);
        }
      } catch {
        // Non-fatal: user is still blocked; they’ll be prevented on next request
      }
    }

    return res.status(200).json({ ok: true });
  }

  // UNBLOCK
  if (targetId) {
    await sr.from("blocked_users").delete().eq("user_id", targetId);
  }
  if (targetEmail) {
    await sr.from("blocked_users").delete().eq("email", targetEmail);
  }

  return res.status(200).json({ ok: true });
}

