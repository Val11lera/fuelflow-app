// src/pages/api/contracts.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin"; // adjust path only if your folder structure differs

const HCAPTCHA_SECRET = process.env.HCAPTCHA_SECRET_KEY || "";

async function verifyHCaptcha(token: string, remoteip?: string) {
  if (!HCAPTCHA_SECRET) return false;
  const body = new URLSearchParams();
  body.set("secret", HCAPTCHA_SECRET);
  body.set("response", token);
  if (remoteip) body.set("remoteip", remoteip);

  const resp = await fetch("https://hcaptcha.com/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await resp.json();
  return json?.success === true;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    full_name,
    email,
    company_name,
    phone,
    address1,
    address2,
    city,
    postcode,
    option, // 'buy' | 'rent'
    tank_size_litres,
    monthly_consumption_litres,
    market_price_per_litre,
    fuelflow_price_per_litre,
    est_monthly_savings,
    est_payback_months,
    fuel, // 'diesel' | 'petrol'
    litres,
    terms_version,
    signature_name,
    hcaptchaToken,
  } = req.body || {};

  if (!full_name || !email || !signature_name) {
    return res.status(400).json({ error: "Missing name, email, or signature." });
  }

  const remoteip =
    (req.headers["x-real-ip"] as string) ||
    ((req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? undefined);

  const captchaOK = await verifyHCaptcha(hcaptchaToken || "", remoteip);
  if (!captchaOK) return res.status(400).json({ error: "Captcha failed." });

  const { data, error } = await supabaseAdmin
    .from("contracts")
    .insert({
      tank_option: option, // text check ('buy','rent')
      status: "signed",

      full_name,
      email,
      company_name,
      phone,
      address1,
      address2,
      city,
      postcode,

      tank_size_litres,
      monthly_consumption_litres,
      market_price_per_litre,
      fuelflow_price_per_litre,
      est_monthly_savings,
      est_payback_months,

      fuel,
      litres,

      terms_version,
      signature_name,

      client_ip: remoteip || null,
      user_agent: req.headers["user-agent"] || null,
    })
    .select("id")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ id: data?.id });
}

