// src/pages/api/contracts.ts
// src/pages/api/contracts.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin"; // <-- TWO ../ not three

const HCAPTCHA_SECRET = process.env.HCAPTCHA_SECRET_KEY || "";

type Body = {
  full_name: string;
  email: string;
  company_name?: string;
  phone?: string;
  address1?: string;
  address2?: string;
  city?: string;
  postcode?: string;

  option: "buy" | "rent";
  tank_size_litres?: number;
  monthly_consumption_litres?: number;

  market_price_per_litre: number;
  fuelflow_price_per_litre: number;
  est_monthly_savings?: number;
  est_payback_months?: number | null;

  fuel: "diesel" | "petrol";
  litres: number;

  terms_version: string;
  signature_name: string;

  hcaptchaToken: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = req.body as Body;

  // basic validation
  if (!body.full_name || !body.email || !body.signature_name) {
    return res.status(400).json({ error: "Missing full_name, email or signature_name" });
  }
  if (!body.option || (body.option !== "buy" && body.option !== "rent")) {
    return res.status(400).json({ error: "Invalid option (buy|rent)" });
  }
  if (!body.hcaptchaToken) {
    return res.status(400).json({ error: "Captcha token missing" });
  }

  // hCaptcha verify
  if (!HCAPTCHA_SECRET) {
    return res.status(500).json({ error: "HCAPTCHA_SECRET_KEY not set on server" });
  }
  try {
    const resp = await fetch("https://hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: HCAPTCHA_SECRET,
        response: body.hcaptchaToken,
      }).toString(),
    });
    const json = await resp.json();
    if (!json.success) return res.status(400).json({ error: "Captcha verification failed" });
  } catch {
    return res.status(500).json({ error: "Captcha check failed" });
  }

  const cheaperBy =
    Math.max(0, Number(body.market_price_per_litre || 0) - Number(body.fuelflow_price_per_litre || 0)) || 0;

  const insertPayload = {
    contract_type: body.option, // 'buy' | 'rent'
    status: "draft",

    customer_name: body.full_name,
    email: body.email,

    address_line1: body.address1 || null,
    address_line2: body.address2 || null,
    city: body.city || null,
    postcode: body.postcode || null,

    tank_option: body.option,
    tank_size_l: body.tank_size_litres || null,
    monthly_consumption_l: body.monthly_consumption_litres || null,

    market_price_gbp_l: body.market_price_per_litre || null,
    cheaper_by_gbp_l: cheaperBy || null,
    fuelflow_price_gbp_l: body.fuelflow_price_per_litre || null,
    est_monthly_savings_gbp: body.est_monthly_savings || null,

    capex_required_gbp: body.option === "buy" ? 12000 : 0,

    terms_version: body.terms_version || "v1",
    signature_name: body.signature_name || null,

    fuel: body.fuel,
    litres: body.litres || null,
  };

  try {
    const { data, error } = await supabaseAdmin
      .from("contracts")
      .insert([insertPayload])
      .select("id")
      .single();

    if (error) throw error;
    return res.status(200).json({ id: data.id });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Insert failed" });
  }
}

