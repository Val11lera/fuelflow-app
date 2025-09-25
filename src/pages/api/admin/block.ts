import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  const { userId, email, action, reason } = req.body as {
    userId?: string;                 // auth.users.id (preferred)
    email?: string;                  // fallback if you only have email
    action: "block" | "unblock";
    reason?: string;
  };
  if (!action || (!userId && !email)) return res.status(400).json({ error: "Missing fields" });

  // Service role client (server-only key)
  const sr = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Verify caller is an admin (Authorization: Bearer <jwt>)
  const authHeader = req.headers.authorization || "";
  const jwt = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : null;
  if (!jwt) return res.status(401).json({ error: "Unauthorized" });

  const { data: caller } = await sr.auth.getUser(jwt);
  const callerEmail = caller?.user?.email?.toLowerCase();
  if (!callerEmail) return res.status(401).json({ error: "Unauthorized" });

  const { data: admin } = await sr.from("admins").select("email").eq("email", callerEmail).maybeSingle();
  if (!admin?.email) return res.status(403).json({ error: "Forbidden" });

  // If only email provided, look up user id
  let targetId = userId || null;
  if (!targetId && email) {
    const { data: byEmail } = await sr.auth.admin.listUsers({ page: 1, perPage: 1, email });
    targetId = byEmail?.users?.[0]?.id || null;
  }
  const targetEmail = (email || "").toLowerCase();

  if (action === "block") {
    const payload: any = {
      reason: reason || null,
      blocked_by: callerEmail,
    };
    if (targetId) payload.user_id = targetId;
    if (targetEmail) payload.email = targetEmail;

    // upsert
    const { error: upErr } = await sr.from("blocked_users").upsert(payload, { onConflict: "user_id,email" });
    if (upErr) return res.status(500).json({ error: upErr.message });

    // Kick them out immediately (if we have id)
    if (targetId) {
      await sr.auth.admin.invalidateRefreshTokens(targetId).catch(() => {});
    }
    return res.status(200).json({ ok: true });
  } else {
    // unblock
    if (targetId) await sr.from("blocked_users").delete().eq("user_id", targetId);
    if (targetEmail) await sr.from("blocked_users").delete().eq("email", targetEmail);
    return res.status(200).json({ ok: true });
  }
}
