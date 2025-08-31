import type { NextApiRequest, NextApiResponse } from "next";
import supabase from "@/lib/supabaseAdmin";

const HCAPTCHA_SECRET = process.env.HCAPTCHA_SECRET_KEY || "";

type Success = { ok: true; id: string };
type Failure = { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Success | Failure>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const { email, version, token, name } = req.body as {
    email?: string;
    version?: string;
    token?: string;
    name?: string;
  };

  if (!email || !version || !token) {
    return res
      .status(400)
      .json({ ok: false, error: "Missing email, version or token" });
  }

  try {
    // Verify hCaptcha with built-in fetch (no node-fetch!)
    const verify = await fetch("https://hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:
        `secret=${encodeURIComponent(HCAPTCHA_SECRET)}` +
        `&response=${encodeURIComponent(token)}`,
    }).then((r) => r.json());

    if (!verify.success) {
      return res.status(400).json({ ok: false, error: "Captcha failed" });
    }

    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      null;
    const ua = req.headers["user-agent"] || null;

    const { data, error } = await supabase
      .from("terms_acceptances")
      .insert({
        email,
        version,
        ip,
        user_agent: ua,
        // you can store `name` in a separate column if needed
      })
      .select("id")
      .single();

    if (error) throw error;

    return res.status(200).json({ ok: true, id: data.id });
  } catch (e: any) {
    return res
      .status(500)
      .json({ ok: false, error: e?.message || "Server error" });
  }
}

