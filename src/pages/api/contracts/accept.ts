// src/pages/api/contracts/accept.ts
import type { NextApiRequest, NextApiResponse } from "next";
import supabase from "@/lib/supabaseAdmin";

const HCAPTCHA_SECRET = process.env.HCAPTCHA_SECRET_KEY || "";

type Data =
  | { ok: true; id: string }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { email, version, hcaptchaToken, name } = req.body ?? {};
    if (!email || !version || !hcaptchaToken) {
      return res
        .status(400)
        .json({ ok: false, error: "Missing email, version or captcha token" });
    }

    // Verify hCaptcha using the global fetch (no node-fetch)
    const verify = await fetch("https://hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: HCAPTCHA_SECRET,
        response: hcaptchaToken,
      }),
    }).then((r) => r.json());

    if (!verify?.success) {
      return res.status(400).json({ ok: false, error: "Captcha failed" });
    }

    const { data, error } = await supabase
      .from("terms_acceptances")
      .insert({
        email,
        name: name || null,
        version,
      })
      .select("id")
      .single();

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.status(200).json({ ok: true, id: data.id });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
}


