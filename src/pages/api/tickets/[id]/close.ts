import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@supabase/auth-helpers-nextjs";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const supabase = createServerSupabaseClient({ req, res });

  // Must be signed in
  const {
    data: { session },
    error: sessErr,
  } = await supabase.auth.getSession();
  if (sessErr) return res.status(500).json({ error: sessErr.message });
  const email = session?.user?.email?.toLowerCase();
  if (!email) return res.status(401).json({ error: "Not signed in" });

  // Must be an admin
  const { data: admin, error: adminErr } = await supabase
    .from("admins")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (adminErr) return res.status(500).json({ error: adminErr.message });
  if (!admin?.email) return res.status(403).json({ error: "Forbidden" });

  const id = String(req.query.id || "");
  if (!id) return res.status(400).json({ error: "Missing ticket id" });

  // call your PL/pgSQL function from earlier
  const { error } = await supabase.rpc("close_ticket", {
    p_ticket_id: id,
    p_by: email,
  });

  if (error) return res.status(400).json({ error: error.message });
  return res.status(200).json({ ok: true });
}
