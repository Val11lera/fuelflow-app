import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

/** Returns today's prices as { petrol: number, diesel: number } in GBP/L */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Try the table you have: latest_daily_prices (fuel, total_price)
    const { data, error } = await supabase
      .from("latest_daily_prices")
      .select("fuel,total_price");

    if (error) throw error;

    const out: Record<string, number> = {};
    (data || []).forEach((r: any) => {
      if (r?.fuel && r?.total_price != null) out[r.fuel] = Number(r.total_price);
    });

    // sane defaults if something is missing
    if (out.petrol == null && out.diesel == null) {
      return res.status(404).json({ error: "No prices found" });
    }

    return res.status(200).json({
      petrol: out.petrol ?? 0,
      diesel: out.diesel ?? 0,
    });
  } catch (e: any) {
    console.error("prices api error", e?.message || e);
    return res.status(500).json({ error: "Failed to load prices" });
  }
}
