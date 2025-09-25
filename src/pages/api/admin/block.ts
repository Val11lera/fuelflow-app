// src/pages/api/admin/block.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  const { userId, email, action, reason } = req.body as {
    userId?: string;                 // auth.users.id (preferred)
    email?: string;                  // fallback
    action: "block" | "unblock";
    reason?: string;
  };

  if (!action || (!userId && !email)) {
    return res.status(400).json({ error: "Missing fields (userId or email, and action)" });
  }

  // Server-side Supabase client (SERVICE ROLE KEY)
  const sr = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );

  // Verify caller is an admin via Bearer token
  const authHeader = req.headers.authorization || "";
  const jwt = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : null;
  if (!jwt) return res.status(401).json({ error: "Unauthorized" });

  const { data: caller, error: callerErr } = await sr.auth.getUser(jwt);
  if (callerErr || !caller?.user?.email) return res.status(401).json({ error: "Unauthorized" });

  const callerEmail = caller.user.email.toLowerCase();

  const { data: adminRow } = await sr
    .from("admins")
    .select("email")
    .eq("email", callerEmail)
    .maybeSingle();

  if (!adminRow?.email) return res.status(403).json({ error: "Forbidden" });

  // Resolve target userId if only email supplied
  let targetId = userId || null;
  const targetEmail = (email || "").toLowerCase();

  if (!targetId && targetEmail) {
    const { data: byEmail, error: getErr } = await sr.auth.admin.getUserByEmail(targetEmail);
    if (getErr) {
      // We can still block by email only (no immediate token invalidation)
      // but return a warning.
      // Do NOT fail the whole request on lookup failure.
    } else {
      targetId = byEmail?.user?.id || null;
    }
  }

  if (action === "block") {
    // Upsert into blocked_users (by userId and/or email)
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

    // If we have a userId, kill their refresh tokens to log them out now
    if (targetId) {
      await sr.auth.admin.invalidateRefreshTokens(targetId).catch(() => {});
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

