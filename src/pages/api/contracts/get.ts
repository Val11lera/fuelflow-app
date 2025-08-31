import type { NextApiRequest, NextApiResponse } from "next";
import supabase from "@/lib/supabaseAdmin";

type Ok = { ok: true; accepted: boolean; id?: string; accepted_at?: string };
type Fail = { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Ok | Fail>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }
  const { email, version } = req.query as { email?: string; version?: string };

  if (!email || !version) {
    return res.status(400).json({ ok: false, error: "Missing email/version" });
  }

  try {
    const { data, error } = await supabase
      .from("terms_acceptances")
      .select("id, accepted_at")
      .eq("email", email)
      .eq("version", version)
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!data) return res.status(200).json({ ok: true, accepted: false });

    return res
      .status(200)
      .json({ ok: true, accepted: true, id: data.id, accepted_at: data.accepted_at });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
}

