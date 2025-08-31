import type { NextApiRequest, NextApiResponse } from "next";
import supabase from "@/lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const {
      customer_email,
      customer_name,
      type,                     // 'buy' | 'rent'
      tank_size_l,
      monthly_consumption_l,
      market_price_gbppl,
      cheaper_by_gbppl
    } = req.body || {};

    if (!type || tank_size_l == null || monthly_consumption_l == null || market_price_gbppl == null || cheaper_by_gbppl == null) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const fuelflow_price = Number(market_price_gbppl) - Number(cheaper_by_gbppl);
    const est_saving = Number(cheaper_by_gbppl) * Number(monthly_consumption_l);
    const capex = type === "buy" ? 12000 : 0;

    const { data, error } = await supabase
      .from("contracts")
      .insert([{
        customer_email: customer_email || null,
        customer_name: customer_name || null,
        type,
        tank_size_l: Number(tank_size_l),
        monthly_consumption_l: Number(monthly_consumption_l),
        market_price_gbppl: Number(market_price_gbppl),
        cheaper_by_gbppl: Number(cheaper_by_gbppl),
        fuelflow_price_gbppl: fuelflow_price,
        est_monthly_saving_gbp: est_saving,
        capex_required_gbp: capex,
        status: "draft",
        terms_version: "v1.1"
      }])
      .select("id, fuelflow_price_gbppl, est_monthly_saving_gbp, capex_required_gbp")
      .single();

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ ok: true, contract: data });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
