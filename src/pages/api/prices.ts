import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

export default async function handler(_: NextApiRequest, res: NextApiResponse) {
  try {
    let { data, error } = await supabase
      .from("latest_prices")
      .select("fuel,total_price");

    if (error || !data?.length) {
      // fallback to latest_daily_prices just in case
      const fb = await supabase
        .from("latest_daily_prices")
        .select("fuel,total_price");
      if (fb.error || !fb.data?.length) {
        return res.status(500).json({ error: "No price data" });
      }
      return res.status(200).json(fb.data);
    }

    return res.status(200).json(data);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}
