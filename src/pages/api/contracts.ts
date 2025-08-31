// src/pages/api/contracts.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

type ContractPayload = {
  full_name: string;
  email: string;
  company_name?: string;
  phone?: string;
  address1?: string;
  address2?: string;
  city?: string;
  postcode?: string;

  option: "rent" | "buy";
  tank_size_litres?: number;
  monthly_consumption_litres?: number;

  market_price_per_litre?: number;
  fuelflow_price_per_litre?: number;
  est_monthly_savings?: number;
  est_payback_months?: number;

  delivery_date?: string; // yyyy-mm-dd
  litres?: number;
  fuel?: "diesel" | "petrol";

  terms_version?: string;
  signature_name: string;

  hcaptchaToken?: string;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verifyHCaptcha(token?: string, ip?: string) {
  const secret = process.env.HCAPTCHA_SECRET_KEY;
  if (!secret) return true; // soft-pass if not configured
  if (!token) return false;

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (ip) body.set("remoteip", ip);

  const res = await fetch("https://hcaptcha.com/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await res.json();
  return !!data?.success;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const payload = req.body as ContractPayload;

    // Basic validation
    if (!payload.full_name || !payload.email || !payload.signature_name || !payload.option) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    // hCaptcha (recommended)
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      undefined;

    const ok = await verifyHCaptcha(payload.hcaptchaToken, ip);
    if (!ok) return res.status(400).json({ error: "Captcha failed." });

    // Insert
    const { data, error } = await supabase.from("contracts").insert({
      full_name: payload.full_name,
      email: payload.email,
      company_name: payload.company_name,
      phone: payload.phone,
      address1: payload.address1,
      address2: payload.address2,
      city: payload.city,
      postcode: payload.postcode,

      option: payload.option,
      tank_size_litres: payload.tank_size_litres ?? null,
      monthly_consumption_litres: payload.monthly_consumption_litres ?? null,

      market_price_per_litre: payload.market_price_per_litre ?? null,
      fuelflow_price_per_litre: payload.fuelflow_price_per_litre ?? null,
      est_monthly_savings: payload.est_monthly_savings ?? null,
      est_payback_months: payload.est_payback_months ?? null,

      delivery_date: payload.delivery_date ?? null,
      litres: payload.litres ?? null,
      fuel: payload.fuel ?? null,

      terms_version: payload.terms_version ?? "v1",
      signature_name: payload.signature_name,
      acceptance_ip: ip ?? null,
      user_agent: req.headers["user-agent"] ?? null,
    }).select("id").single();

    if (error) {
      console.error("Insert contract error:", error);
      return res.status(500).json({ error: "Failed to save contract." });
    }

    return res.status(200).json({ id: data?.id });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: "Unexpected error." });
  }
}
