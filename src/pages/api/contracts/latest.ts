// src/pages/api/contracts/latest.ts
// src/pages/api/contracts/latest.ts
import type { NextApiRequest, NextApiResponse } from "next";
import supabaseAdmin from "@/lib/supabaseAdmin";

type Ok = {
  exists: boolean;
  status?: "signed" | "approved";
  approved?: boolean;
  id?: string;
};
type Fail = { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Ok | Fail>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // option comes from query, default "rent" | "buy"
  const option = (req.query.option as "buy" | "rent") || "rent";

  // Get user from Bearer token
  let userId: string | null = null;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (!error && data?.user?.id) userId = data.user.id;
  }

  if (!userId) {
    // caller not logged in
    return res.status(200).json({ exists: false });
  }

  // NOTE: your table uses tank_option + status (signed/approved)
  const { data, error } = await supabaseAdmin
    .from("contracts")
    .select("id,status,approved_at,signed_at,created_at")
    .eq("user_id", userId)
    .eq("tank_option", option)
    .in("status", ["signed", "approved"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  if (!data) return res.status(200).json({ exists: false });

  return res.status(200).json({
    exists: true,
    status: data.status as "signed" | "approved",
    approved: !!data.approved_at,
    id: data.id,
  });
}



