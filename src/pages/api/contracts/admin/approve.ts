import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

// Simple header token to protect this route
const ADMIN_TOKEN = process.env.ADMIN_APPROVAL_TOKEN || "";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  if (!ADMIN_TOKEN || req.headers["x-admin-token"] !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { contract_id, approved_by = "admin" } = req.body || {};
  if (!contract_id) return res.status(400).json({ error: "contract_id required" });

  const { error } = await supabaseAdmin
    .from("contracts")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by,
    })
    .eq("id", contract_id)
    .eq("tank_option", "rent")
    .eq("status", "signed");

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}
