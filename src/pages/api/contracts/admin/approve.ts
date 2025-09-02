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

  const token = req.headers["x-admin-token"];
  if (!token || token !== process.env.ADMIN_APPROVAL_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { contract_id, email, option, approved_by } = req.body || {};

  try {
    let id = contract_id as string | undefined;

    // allow approving latest "signed" by email+option if id not provided
    if (!id && email && option) {
      const { data, error } = await supabase
        .from("contracts")
        .select("id")
        .eq("email", String(email).toLowerCase())
        .eq("tank_option", option)
        .eq("status", "signed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: "No signed contract found" });
      id = data.id;
    }

    if (!id) return res.status(400).json({ error: "contract_id or (email+option) required" });

    const { error: updErr } = await supabase
      .from("contracts")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: approved_by || "admin@fuelflow.co.uk",
      })
      .eq("id", id)
      .eq("tank_option", option || "rent"); // stay safe for rent flow

    if (updErr) throw updErr;

    return res.status(200).json({ ok: true, id });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}

