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

  // authenticate the user from the Supabase JWT you pass from the browser
  let userId: string | null = null;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data?.user?.id) userId = data.user.id;
  }
  if (!userId) return res.status(200).json({ exists: false });

  // IMPORTANT: the column is tank_option in your DB
  const { data, error } = await supabase
    .from("contracts")
    .select("id,status,approved_at,signed_at,created_at")
    .eq("user_id", userId)
    .eq("tank_option", option)
    .in("status", ["signed", "approved"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });

  if (!data) return res.status(200).json({ exists: false });

  res.status(200).json({
    exists: true,
    status: data.status,
    approved: !!data.approved_at,
    id: data.id,
  });
}



