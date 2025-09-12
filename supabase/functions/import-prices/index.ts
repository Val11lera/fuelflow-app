/**
 * Supabase Edge Function: import-prices
 * Pulls CSV from your published Google Sheet and upserts into public.daily_prices
 * Table daily_prices columns: price_date (date), fuel (enum 'petrol'|'diesel'),
 * refinery_price (numeric), margin (numeric), total_price (numeric)
 *
 * We set total_price = final_client_price from the sheet.
 * refinery_price & margin are set to 0 (adjust if you need other logic).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- Helpers ---------------------------------------------------------------

function parsePrice(s: string): number {
  // remove currency symbols and everything except digits, dot, minus
  const clean = (s || "").toString().replace(/[^0-9.\-]/g, "");
  const n = Number(clean);
  return Number.isFinite(n) ? n : 0;
}

function toIsoDate(d: string): string {
  // Handle DD/MM/YYYY (as in your sheet) or already ISO.
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) {
    const [dd, mm, yyyy] = d.split("/");
    return `${yyyy}-${mm}-${dd}`;
  }
  return d; // assume already YYYY-MM-DD
}

function fuelFromSheet(val: string): "petrol" | "diesel" | null {
  const v = (val || "").toLowerCase().trim();
  if (v === "petrol") return "petrol";
  if (v === "diesel") return "diesel";
  return null;
}

// --- Handler ---------------------------------------------------------------

Deno.serve(async (req) => {
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SHEET_CSV_URL = Deno.env.get("SHEET_CSV_URL")!; // published CSV link

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SHEET_CSV_URL) {
      return new Response(
        JSON.stringify({ error: "Missing env: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SHEET_CSV_URL" }),
        { status: 500 }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch CSV
    const csvRes = await fetch(SHEET_CSV_URL, { headers: { "cache-control": "no-cache" } });
    if (!csvRes.ok) {
      return new Response(JSON.stringify({ error: "Failed to fetch sheet", status: csvRes.status }), { status: 500 });
    }
    const csvText = await csvRes.text();

    // Parse CSV (naive parse; the sheet has simple values)
    const lines = csvText.trim().split(/\r?\n/);

    // Expect header like: date,product,final_client_price,moji_vutratu
    const header = lines.shift()!;
    const cols = header.split(",").map((c) => c.trim().toLowerCase());

    const idxDate = cols.indexOf("date");
    const idxProd = cols.indexOf("product");
    const idxFinal = cols.indexOf("final_client_price");
    if (idxDate < 0 || idxProd < 0 || idxFinal < 0) {
      return new Response(JSON.stringify({ error: "CSV missing required columns" }), { status: 400 });
    }

    let upserted = 0;

    for (const line of lines) {
      if (!line.trim()) continue;
      const cells = line.split(",").map((c) => c.trim());

      const dateStr = toIsoDate(cells[idxDate]);
      const fuel = fuelFromSheet(cells[idxProd]);
      const finalPrice = parsePrice(cells[idxFinal]);

      if (!fuel) continue;

      // Upsert into daily_prices (on price_date + fuel)
      const { error } = await supabase
        .from("daily_prices")
        .upsert(
          {
            price_date: dateStr,
            fuel,
            refinery_price: 0,
            margin: 0,
            total_price: finalPrice,
            source: "google_sheet",
          },
          { onConflict: "price_date,fuel" }
        );

      if (error) {
        console.log("Upsert error:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
      }

      upserted++;
    }

    return new Response(JSON.stringify({ upserted }), { headers: { "content-type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
