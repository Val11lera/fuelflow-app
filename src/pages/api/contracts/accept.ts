// src/pages/api/contracts/accept.ts
// /src/pages/api/contracts/accept.ts
import type { NextApiRequest, NextApiResponse } from "next";
import supabase from "@/lib/supabaseAdmin";

const HCAPTCHA_SECRET = process.env.HCAPTCHA_SECRET_KEY || "";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { token, email, version } = req.body || {};
  if (!email || !version || !token) {
    return res.status(400).json({ error: "missing_params" });
  }
  if (!HCAPTCHA_SECRET) {
    return res.status(500).json({ error: "missing_hcaptcha_secret" });
  }

  // Verify hCaptcha (uses Next.js built-in fetch)
  const verify = await fetch("https://hcaptcha.com/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      secret: HCAPTCHA_SECRET,
      response: token,
    }).toString(),
  }).then(r => r.json()).catch(() => null);

  if (!verify?.success) {
    return res.status(400).json({ error: "captcha_failed", details: verify });
  }

  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    null;
  const ua = req.headers["user-agent"] || null;

  const { data, error } = await supabase
    .from("terms_acceptances")
    .insert({ email, version, ip, user_agent: ua })
    .select("id")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ id: data.id });
}


