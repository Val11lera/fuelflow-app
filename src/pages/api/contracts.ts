// src/pages/api/contracts.ts
// src/pages/api/contracts.ts
// src/pages/api/contracts.ts
// src/pages/api/contracts.ts
import type { NextApiRequest, NextApiResponse } from "next";
import supabaseAdmin from "../../lib/supabaseAdmin";

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

  option: "buy" | "rent";                    // from UI
  tank_size_litres?: number;
  monthly_consumption_litres?: number;
  market_price_per_litre?: number;
  fuelflow_price_per_litre?: number;
  est_monthly_savings?: number;
  est_payback_months?: number;

  fuel?: "diesel" | "petrol";
  litres?: number;

  terms_version?: string;
  signature_name?: string;

  hcaptchaToken: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const body = req.body as Partial<Body>;
  if (!body?.full_name || !body?.email || !body?.option || !body?.hcaptchaToken) {
    return res.status(400).json({ error: "Missing required fields." });
  }
  if (!HCAPTCHA_SECRET) return res.status(500).json({ error: "HCAPTCHA_SECRET_KEY is not set." });

  // verify hCaptcha
  try {
    const form = new URLSearchParams();
    form.append("secret", HCAPTCHA_SECRET);
    form.append("response", body.hcaptchaToken);
    const r = await fetch("https://hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const j = await r.json();
    if (!j?.success) return res.status(400).json({ error: "Captcha verification failed." });
  } catch {
    return res.status(400).json({ error: "Captcha verification error." });
  }

  // attach the logged-in user if provided
  let userId: string | null = null;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (!error && data?.user?.id) userId = data.user.id;
  }

  // soft duplicate guard (works even before SQL index is in place)
  const where = userId ? { user_id: userId } : { email: body.email };
  const { data: dup, error: dupErr } = await supabaseAdmin
    .from("contracts")
    .select("id,status,tank_option")
    .match(where as any)
    .eq("tank_option", body.option)
    .in("status", ["signed", "approved"])
    .limit(1)
    .maybeSingle();

  if (dupErr) return res.status(500).json({ error: dupErr.message });
  if (dup) return res.status(409).json({ error: "You already have an active contract for this option." });

  const payload = {
    status: "signed",
    signed_at: new Date().toISOString(),
    user_id: userId,

    customer_name: body.full_name,
    email: body.email,
    address_line1: body.address1 ?? null,
    address_line2: body.address2 ?? null,
    city: body.city ?? null,
    postcode: body.postcode ?? null,

    tank_option: body.option,                           // IMPORTANT

    tank_size_l: body.tank_size_litres ?? null,
    monthly_consumption_l: body.monthly_consumption_litres ?? null,
    market_price_gbp_l: body.market_price_per_litre ?? null,
    fuelflow_price_gbp_l: body.fuelflow_price_per_litre ?? null,
    est_monthly_savings_gbp: body.est_monthly_savings ?? null,
    est_payback_months: body.est_payback_months ?? null,

    fuel: body.fuel ?? null,
    litres: body.litres ?? null,

    terms_version: body.terms_version ?? "v1",
    signature_name: body.signature_name ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from("contracts")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    if ((error as any).code === "23505") {
      return res.status(409).json({ error: "Active contract already exists." });
    }
    return res.status(500).json({ error: error.message, details: error.details });
  }

  return res.status(200).json({ id: data.id });
}

