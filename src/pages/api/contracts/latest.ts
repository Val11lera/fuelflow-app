// src/pages/api/contracts/latest.ts
// /src/pages/api/contracts/latest.ts
import type { NextApiRequest, NextApiResponse } from "next";
import supabaseAdmin from "@/lib/supabaseAdmin";

/**
 * Returns whether a user/email already has an active (signed/approved) contract
 * for a given option ("buy" | "rent").
 *
 * Query:
 *   ?option=buy|rent
 *   [&email=someone@example.com]  // fallback when user isn't logged in
 *
 * Auth:
 *   If Authorization: Bearer <supabase_jwt> is present, we use auth.uid();
 *   else, if email=... is provided, we match by email.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const option = (req.query.option as "buy" | "rent") || "rent";
  const emailQ = (req.query.email as string | undefined)?.trim();

  // Try to resolve the Supabase user ID first
  let userId: string | null = null;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const { data } = await supabaseAdmin.auth.getUser(token);
    if (data?.user?.id) userId = data.user.id;
  }

  if (!userId && !emailQ) {
    // No way to lookup – return "no active contract"
    return res.status(200).json({ exists: false });
  }

  // Build the query either by user_id or email
  let query = supabaseAdmin
    .from("contracts")
    .select("id,status,approved_at,signed_at,created_at")
    .eq("tank_option", option)
    .in("status", ["signed", "approved"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (userId) query = query.eq("user_id", userId);
  else query = query.eq("email", emailQ as string);

  const { data, error } = await query.maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(200).json({ exists: false });

  res.status(200).json({
    exists: true,
    status: data.status,          // 'signed' | 'approved'
    approved: !!data.approved_at,
    id: data.id,
  });
}

