// src/pages/api/terms-accept.ts
// src/pages/api/terms-accept.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const { version, name, email } = req.body || {};
    if (!version) return res.status(400).send("Missing version");
    // optional hCaptcha server-side verification:
    // If you have HCAPTCHA_SECRET set, you can verify here.

    const ins = await supabase
      .from("terms_acceptances")
      .insert({
        version: String(version),
        name: name ? String(name) : null,
        email: email ? String(email).toLowerCase() : null,
      })
      .select("id")
      .single();

    if (ins.error) return res.status(500).send(ins.error.message);
    return res.status(200).send("ok");
  } catch (e: any) {
    return res.status(500).send(e?.message || "error");
  }
}
