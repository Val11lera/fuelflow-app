// src/pages/api/blocked/me.ts
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

  // Grab the JWT from the Authorization header
  const authHeader = req.headers.authorization || "";
  const jwt = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : null;
  if (!jwt) return res.status(200).json({ blocked: false }); // not logged in → not this API's job

  // v2 client (no setAuth). We'll pass jwt to getUser directly.
  const anon = createClient(SUPABASE_URL, ANON);

  // Get the user from the JWT (v2 signature)
  const { data: auth, error: userErr } = await anon.auth.getUser(jwt);
  if (userErr || !auth?.user) return res.status(200).json({ blocked: false });

  const id = auth.user.id;
  const email = (auth.user.email || "").toLowerCase();

  // Check blocklist by user_id first, then by email
  const { data: byId, error: idErr } = await anon
    .from("blocked_users")
    .select("reason")
    .eq("user_id", id)
    .maybeSingle();

  if (byId?.reason || idErr) {
    return res.status(200).json({ blocked: !!byId, reason: byId?.reason || null });
  }

  if (email) {
    const { data: byEmail } = await anon
      .from("blocked_users")
      .select("reason")
      .eq("email", email)
      .maybeSingle();

    return res.status(200).json({ blocked: !!byEmail, reason: byEmail?.reason || null });
  }

  return res.status(200).json({ blocked: false });
}
