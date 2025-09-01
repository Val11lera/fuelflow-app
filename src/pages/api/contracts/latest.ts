// src/pages/api/contracts/latest.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const option = (req.query.option as "buy" | "rent") || "rent";
  const emailParam = (req.query.email as string | undefined)?.trim();

  // Try auth first (if token provided), else fallback to email
  let userId: string | null = null;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (!error && data?.user?.id) userId = data.user.id;
  }

  let q = supabaseAdmin
    .from("contracts")
    .select("id,status,approved_at,signed_at,created_at")
    .eq("tank_option", option)
    .in("status", ["signed", "approved"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (userId) q = q.eq("user_id", userId);
  else if (emailParam) q = q.eq("email", emailParam);
  else return res.status(200).json({ exists: false });

  const { data, error } = await q.maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(200).json({ exists: false });

  res.status(200).json({
    exists: true,
    status: data.status,
    approved: !!data.approved_at,
    id: data.id,
  });
}

