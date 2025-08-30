// src/pages/api/terms-accept.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // server-only key
  { auth: { persistSession: false } }
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  try {
    const {
      version,
      name,
      email,
      ticket_id,
      source,
      captchaToken,
    }: {
      version: string;
      name?: string | null;
      email?: string | null;
      ticket_id?: string | null;
      source?: string | null;
      captchaToken?: string;
    } = req.body || {};

    if (!version) return res.status(400).json({ error: "missing_version" });

    // ---- hCaptcha verification ----
    if (!process.env.HCAPTCHA_SECRET_KEY) {
      return res.status(400).json({ error: "missing_hcaptcha_secret" });
    }
    if (!captchaToken) {
      return res.status(400).json({ error: "missing_captcha_token" });
    }

    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      undefined;

    const verifyRes = await fetch("https://hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: process.env.HCAPTCHA_SECRET_KEY!,
        response: captchaToken,
        sitekey: process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY || "",
        remoteip: ip || "",
      }),
    });

    const verify = (await verifyRes.json()) as { success: boolean; "error-codes"?: string[] };
    if (!verify.success) {
      return res.status(400).json({ error: "captcha_failed", details: verify["error-codes"] || [] });
    }

    // ---- store acceptance ----
    const user_agent = req.headers["user-agent"] || null;

    const { error } = await supabase.from("terms_acceptances").insert({
      version,
      name: name || null,
      email: email || null,
      ticket_id: ticket_id || null,
      source: source || null,
      ip: ip || null,
      user_agent,
    });

    if (error) throw error;
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "internal_error" });
  }
}
