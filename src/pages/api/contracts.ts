// src/pages/api/contracts.ts
// src/pages/api/contracts.ts
// src/pages/api/contracts.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin"; // named export is fine; default also works

const HCAPTCHA_SECRET = process.env.HCAPTCHA_SECRET_KEY || "";

type Body = {
  // identity
  full_name: string;
  email: string;
  company_name?: string;
  phone?: string;

  // address
  address1?: string;
  address2?: string;
  city?: string;
  postcode?: string;

  // commercial choice
  option: "buy" | "rent"; // your table has "option" column; use this instead of contract_type

  // assumptions / ROI (use the column names that exist in your table)
  tank_size_litres?: number;
  monthly_consumption_litres?: number;
  market_price_per_litre?: number;
  fuelflow_price_per_litre?: number;
  est_monthly_savings?: number;
  est_payback_months?: number;

  // extras shown in your table
  fuel?: "diesel" | "petrol";
  litres?: number;

  // acceptance
  terms_version?: string;
  signature_name?: string;

  // captcha
  hcaptchaToken: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") return res.status(405).end();

  const body = req.body as Partial<Body>;

  // basic validation
  if (!body?.full_name || !body?.email || !body?.option || !body?.hcaptchaToken) {
    return res.status(400).json({ error: "Missing required fields." });
  }
  if (!HCAPTCHA_SECRET) {
    return res.status(500).json({ error: "HCAPTCHA_SECRET_KEY is not set." });
  }

  // verify hCaptcha using global fetch (no node-fetch dependency)
  try {
    const form = new URLSearchParams();
    form.append("secret", HCAPTCHA_SECRET);
    form.append("response", body.hcaptchaToken);

    const hcResp = await fetch("https://hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const hcJson = (await hcResp.json()) as { success?: boolean };
    if (!hcJson?.success) {
      return res.status(400).json({ error: "Captcha verification failed." });
    }
  } catch (e) {
    return res.status(400).json({ error: "Captcha verification error." });
  }

  // build a payload that matches *existing* columns
  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    null;

  const payload = {
    status: "draft",
    // identity
    full_name: body.full_name,
    email: body.email,
    company_name: body.company_name ?? null,
    phone: body.phone ?? null,
    // address
    address1: body.address1 ?? null,
    address2: body.address2 ?? null,
    city: body.city ?? null,
    postcode: body.postcode ?? null,
    // choice
    option: body.option, // <- your table has "option"
    // ROI columns that exist in your table (per your screenshot)
    tank_size_litres: body.tank_size_litres ?? null,
    monthly_consumption_litres: body.monthly_consumption_litres ?? null,
    market_price_per_litre: body.market_price_per_litre ?? null,
    fuelflow_price_per_litre: body.fuelflow_price_per_litre ?? null,
    est_monthly_savings: body.est_monthly_savings ?? null,
    est_payback_months: body.est_payback_months ?? null,
    // optional extras present in your table
    fuel: body.fuel ?? null,
    litres: body.litres ?? null,
    // acceptance meta your table shows
    terms_version: body.terms_version ?? "v1",
    signature_name: body.signature_name ?? null,
    accepted_at: new Date().toISOString(),
    acceptance_ip: ip,
    user_agent: req.headers["user-agent"] ?? null,
  };

  // insert
  const { data, error } = await supabaseAdmin
    .from("contracts")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    // log details while you test
    console.error("contracts insert error:", error);
    return res.status(500).json({ error: error.message, details: error.details });
  }

  return res.status(200).json({ id: data.id });
}


