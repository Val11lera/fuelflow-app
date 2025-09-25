// src/pages/api/blocked/me.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

/**
 * GET/POST /api/blocked/me
 * Header: Authorization: Bearer <access_token>
 * Response: { blocked: boolean, reason?: string }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!SUPABASE_URL || !ANON) return res.status(500).json({ blocked: false });

  const authHeader = req.headers.authorization || "";
  const jwt = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : null;

  // If no token, treat as not logged in (not this endpoint's job):
  if (!jwt) return res.status(200).json({ blocked: false });

  const anon = createClient(SUPABASE_URL, ANON);
  anon.auth.setAuth(jwt);

  const { data: auth } = await anon.auth.getUser();
  const id = auth?.user?.id || null;
  const email = auth?.user?.email?.toLowerCase() || null;

  if (!id && !email) return res.status(200).json({ blocked: false });

  // Check by user_id, then email
  const { data: byId, error: idErr } =
    id ? await anon.from("blocked_users").select("reason").eq("user_id", id).maybeSingle() : { data: null, error: null };

  if (byId?.reason || (!id && !email)) {
    return res.status(200).json({ blocked: !!byId, reason: byId?.reason || null });
  }

  const { data: byEmail } =
    !byId && email
      ? await anon.from("blocked_users").select("reason").eq("email", email).maybeSingle()
      : { data: null };

  const hit = byId || byEmail;
  return res.status(200).json({ blocked: !!hit, reason: hit?.reason || null });
}
