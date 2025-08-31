import type { NextApiRequest, NextApiResponse } from "next";
import supabase from "@/lib/supabaseAdmin";
import fetch from "node-fetch";

const HCAPTCHA_SECRET = process.env.HCAPTCHA_SECRET_KEY || "";

async function verifyHCaptcha(token?: string, ip?: string) {
  if (!HCAPTCHA_SECRET || !token) return false;
  try {
    const r = await fetch("https://hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: HCAPTCHA_SECRET,
        response: token,
        remoteip: ip || ""
      })
    });
    const j = await r.json();
    return !!j.success;
  } catch {
    return false;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { contract_id, name, email, terms_version, hcaptchaToken } = req.body || {};
    if (!contract_id || !name || !email) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.socket.remoteAddress || undefined;
    const ua = req.headers["user-agent"] || "";

    const captchaOK = await verifyHCaptcha(hcaptchaToken, ip);

    const { data: acc, error: accErr } = await supabase
      .from("contract_acceptances")
      .insert([{
        contract_id,
        accepted_name: name,
        accepted_email: email,
        accepted_ip: ip,
        accepted_user_agent: ua,
        terms_version: terms_version || "v1.1",
        hcaptcha_ok: captchaOK
      }])
      .select("id")
      .single();

    if (accErr) return res.status(500).json({ error: accErr.message });

    const { error: updErr } = await supabase
      .from("contracts")
      .update({ acceptance_id: acc.id, status: "active" })
      .eq("id", contract_id);

    if (updErr) return res.status(500).json({ error: updErr.message });

    return res.status(200).json({ ok: true, acceptance_id: acc.id });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
