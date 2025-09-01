// src/pages/api/contracts/draft.ts
import type { NextApiRequest, NextApiResponse } from "next";
import supabaseAdmin from "@/lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const {
    option, // "buy" | "rent"
    full_name, email,
    address1, address2, city, postcode,
    tank_size_litres, monthly_consumption_litres,
    market_price_per_litre, fuelflow_price_per_litre,
    est_monthly_savings, est_payback_months,
    terms_version, signature_name,
  } = (req.body || {}) as Record<string, any>;

  try {
    let user_id: string | null = null;
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) {
      const token = auth.slice(7);
      const { data } = await supabaseAdmin.auth.getUser(token);
      if (data?.user?.id) user_id = data.user.id;
    }

    const { data, error } = await supabaseAdmin
      .from("contracts")
      .insert({
        contract_type: option === "buy" ? "buy" : "rent",
        status: "draft",
        user_id,
        customer_name: full_name || null,
        email: email || null,
        address_line1: address1 || null,
        address_line2: address2 || null,
        city: city || null,
        postcode: postcode || null,

        tank_option: option || null,
        tank_size_l: tank_size_litres ?? null,
        monthly_consumption_l: monthly_consumption_litres ?? null,

        market_price_gbp_l: market_price_per_litre ?? null,
        fuelflow_price_gbp_l: fuelflow_price_per_litre ?? null,
        est_monthly_savings_gbp: est_monthly_savings ?? null,
        est_payback_months: est_payback_months ?? null,

        terms_version: terms_version || "v1",
        signature_name: signature_name || null,
      })
      .select("id")
      .single();

    if (error) throw error;
    return res.status(200).json({ id: data.id });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || "Failed to save draft" });
  }
}

