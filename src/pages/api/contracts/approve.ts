// src/pages/api/contracts/approve.ts
import type { NextApiRequest, NextApiResponse } from "next";
import supabaseAdmin from "@/lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST – others → 405
  if (req.method !== "POST") return res.status(405).end();

  // --- Auth: must be logged in admin ---
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Auth required" });
  }

  const token = auth.slice(7);
  const { data: u } = await supabaseAdmin.auth.getUser(token);
  const uid = u?.user?.id;
  if (!uid) return res.status(401).json({ error: "Auth failed" });

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", uid)
    .maybeSingle();

  if (profile?.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }

  // --- Which contract to approve ---
  const { id } = req.query as { id: string };

  const { error } = await supabaseAdmin
    .from("contracts")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: uid,
    })
    .eq("id", id);

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(200).json({ ok: true });
}
