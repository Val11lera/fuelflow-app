import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const token = req.headers["x-admin-token"] as string | undefined;
  if (!token || token !== process.env.ADMIN_APPROVAL_TOKEN) {
    return res.status(401).json({ error: "Unauthorised" });
  }

  const { contract_id, email } = (req.body || {}) as { contract_id?: string; email?: string };

  try {
    let id = contract_id;

    if (!id && email) {
      const { data: row } = await supabase
        .from("contracts")
        .select("id")
        .eq("email", email.toLowerCase())
        .eq("tank_option", "rent")
        .eq("status", "signed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      id = row?.id;
    }

    if (!id) return res.status(400).json({ error: "Provide contract_id or email" });

    const { error } = await supabase
      .from("contracts")
      .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: "admin@fuelflow.co.uk" })
      .eq("id", id)
      .eq("tank_option", "rent")
      .neq("status", "approved");

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ ok: true, contract_id: id });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "approve_failed" });
  }
}
