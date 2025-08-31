// src/pages/api/contracts/accept.ts
// /src/pages/api/contracts/accept.ts
// src/pages/api/contracts/accept.ts
// src/pages/api/contracts/accept.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const HCAPTCHA_SECRET = process.env.HCAPTCHA_SECRET_KEY || "";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const { email, name, version = "v1", hcaptchaToken } = req.body || {};
    if (!email) return res.status(400).json({ error: "Missing email" });
    if (!hcaptchaToken) return res.status(400).json({ error: "Captcha required" });
    if (!HCAPTCHA_SECRET) return res.status(500).json({ error: "Missing HCAPTCHA_SECRET_KEY" });

    const verify = await fetch("https://hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: HCAPTCHA_SECRET, response: hcaptchaToken }),
    }).then(r => r.json());

    if (!verify.success) return res.status(400).json({ error: "Captcha verification failed" });

    const { data, error } = await supabaseAdmin
      .from("terms_acceptances")
      .insert({ email, version, name: name || null })
      .select("id")
      .single();

    if (error) throw error;
    return res.status(200).json({ id: data.id });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}


