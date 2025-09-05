// src/pages/api/terms-accept.ts
// src/pages/api/terms-accept.ts
// src/pages/api/terms-accept.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

/** Optional hCaptcha verify */
async function verifyHCaptcha(token: string | undefined) {
  const secret = process.env.HCAPTCHA_SECRET;
  if (!secret) return true; // if you haven't set a secret, skip verification
  if (!token) return false;
  try {
    const resp = await fetch("https://hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    });
    const json = (await resp.json()) as { success?: boolean };
    return Boolean(json?.success);
  } catch {
    return false;
  }
}

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
  try {
    const { version, name, email, captchaToken } = req.body || {};
    if (!version) return res.status(400).send("Missing version");
    const ok = await verifyHCaptcha(captchaToken);
    if (!ok) return res.status(400).send("Captcha failed");

    await supabase.from("terms_acceptances").insert({
      version,
      name: name || null,
      email: email || null,
    });
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    return res.status(500).send(e?.message || "save_failed");
  }
}

