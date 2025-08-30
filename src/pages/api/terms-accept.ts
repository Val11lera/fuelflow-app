// src/pages/api/terms-accept.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  // service role so we can insert unrestricted
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  try {
    const { version, name, email, ticket_id, source } = req.body || {};
    if (!version) return res.status(400).json({ error: "Missing version" });

    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      null;
    const user_agent = req.headers["user-agent"] || null;

    const { error } = await supabase.from("terms_acceptances").insert({
      version,
      name,
      email,
      ticket_id,
      source,
      ip,
      user_agent,
    });

    if (error) throw error;
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    return res.status(500).send(e?.message || "Internal error");
  }
}
