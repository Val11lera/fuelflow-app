// src/pages/api/admin/block.ts
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

  // Service-role client (server ONLY)
  const sr = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );

  // Verify caller is an admin (Authorization: Bearer <jwt>)
  const authHeader = req.headers.authorization || "";
  const jwt = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7)
    : null;
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

  // Resolve target
  let targetId = userId || null;
  const targetEmail = (email || "").toLowerCase();

  // ✅ v2-compatible email lookup (via auth schema)
  if (!targetId && targetEmail) {
    const { data: row } = await sr
      .schema("auth")
      .from("users")
      .select("id, email")
      .eq("email", targetEmail)
      .maybeSingle();

    if (row?.id) targetId = row.id as string;
  }

  if (action === "block") {
    // upsert into blocked_users
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

    // Invalidate tokens if we know the userId
    if (targetId) {
      await sr.auth.admin.invalidateRefreshTokens(targetId).catch(() => {});
    }

    return res.status(200).json({ ok: true });
  }

  // UNBLOCK
  if (targetId) await sr.from("blocked_users").delete().eq("user_id", targetId);
  if (targetEmail) await sr.from("blocked_users").delete().eq("email", targetEmail);

  return res.status(200).json({ ok: true });
}

