// src/pages/api/contracts/latest.ts
import type { NextApiRequest, NextApiResponse } from "next";
import supabaseAdmin from "@/lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const option = (req.query.option as "buy" | "rent") || "rent";

  let userId: string | null = null;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const { data } = await supabaseAdmin.auth.getUser(token);
    if (data?.user?.id) userId = data.user.id;
  }

  if (!userId) return res.status(200).json({ exists: false });

  const { data, error } = await supabaseAdmin
    .from("contracts")
    .select("id,status,approved_at,signed_at,created_at")
    .eq("user_id", userId)
    .eq("tank_option", option)     // <-- fixed
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

