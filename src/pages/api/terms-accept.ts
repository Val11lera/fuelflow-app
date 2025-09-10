// src/pages/api/terms-accept.ts
// src/pages/api/terms-accept.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { version, email /* name, captchaToken */ } = req.body || {};
    if (!version) return res.status(400).send("Missing version");

    // TODO: verify hCaptcha here if you need to (captchaToken)

    // Use SERVICE ROLE for writes so RLS doesn't block inserts
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string
    );

    const lower = (email || "").toLowerCase() || null;

    const { error } = await supabase.from("terms_acceptances").insert({
      version,
      email: lower, // <-- must be set so /documents can find it
      accepted_at: new Date().toISOString(),
    });

    if (error) return res.status(400).send(error.message);

    res.status(200).json({ ok: true });
  } catch (e: any) {
    res.status(500).send(e?.message || "Unexpected error");
  }
}
