// src/pages/api/contracts/latest.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const option = (req.query.option as "buy" | "rent") || "rent";
  const emailQ = (req.query.email as string | undefined)?.toLowerCase()?.trim();

  // 1) Try bearer token first (logged-in user)
  let userId: string | null = null;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data?.user?.id) userId = data.user.id;
  }

  // 2) Build filter: by user_id if we have it; otherwise by email if provided
  const qb = supabase
    .from("contracts")
    .select("id,status,approved_at,signed_at,created_at")
    .eq("tank_option", option)
    .in("status", ["signed", "approved"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (userId) qb.eq("user_id", userId);
  else if (emailQ) qb.eq("email", emailQ);
  else return res.status(200).json({ exists: false }); // nothing to search by

  const { data, error } = await qb.maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(200).json({ exists: false });

  res.status(200).json({
    exists: true,
    status: data.status,
    approved: !!data.approved_at,
    id: data.id,
  });
}


