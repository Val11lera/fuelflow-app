// src/pages/api/stripe/checkout/create.ts
// src/pages/api/stripe/checkout/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

/** Works both on Vercel and locally */
function getBaseUrl(req: NextApiRequest) {
  const proto =
    (req.headers["x-forwarded-proto"] as string) ||
    (req.headers["x-forwarded-protocol"] as string) ||
    "https";
  const host =
    (req.headers["x-forwarded-host"] as string) ||
    (req.headers["host"] as string) ||
    "localhost:3000";
  return `${proto}://${host}`;
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

// Use service role (server-side only)
const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    // Body from the order form
    const {
      fuel,               // "petrol" | "diesel"
      litres,             // number
      deliveryDate,       // ISO string (optional)
      full_name,
      email,
      address_line1,
      address_line2,
      city,
      postcode,
    } = (req.body ?? {}) as Record<string, unknown>;

    // Validate fuel + litres
    const f = typeof fuel === "string" ? fuel.toLowerCase() : "";
    const litresNum = Number(litres);
    if (!["petrol", "diesel"].includes(f) || !Number.isFinite(litresNum) || litresNum <= 0) {
      return res.status(400).json({ error: "Missing/invalid fuel or litres" });
    }

    // 1) Price lookup (use latest_prices view; fall back to latest_daily_prices)
    let unitPriceGBP: number | null = null;

    const { data: p1 } = await supabase
      .from("latest_prices")
      .select("fuel,total_price")
      .eq("fuel", f)
      .maybeSingle();

    if (p1?.total_price != null) {
      unitPriceGBP = Number(p1.total_price);
    } else {
      const { data: p2, error: e2 } = await supabase
        .from("latest_daily_prices")
        .select("fuel,total_price")
        .eq("fuel", f)
        .maybeSingle();
      if (p2?.total_price != null) {
        unitPriceGBP = Number(p2.total_price);
      } else {
        return res.status(500).json({ error: `Price lookup failed${e2?.message ? `: ${e2.message}` : ""}` });
      }
    }

    // Convert to pence (integers)
    const unit_price_pence = Math.round((unitPriceGBP as number) * 100);
    const total_pence = unit_price_pence * litresNum;

    // 2) Create pending order row
    // IMPORTANT: we set BOTH product and fuel so either column can be used elsewhere.
    const { data: order, error: insErr } = await supabase
      .from("orders")
      .insert({
        user_email: typeof email === "string" ? email : null,
        product: f,               // <= fixes your NOT NULL "product" constraint
        fuel: f,                  // keep the modern column too
        litres: litresNum,
        unit_price_pence,
        total_pence,
        status: "pending",
        delivery_date: typeof deliveryDate === "string" ? deliveryDate : null,
        name: typeof full_name === "string" ? full_name : null,
        address_line1: typeof address_line1 === "string" ? address_line1 : null,
        address_line2: typeof address_line2 === "string" ? address_line2 : null,
        city: typeof city === "string" ? city : null,
        postcode: typeof postcode === "string" ? postcode : null,
      })
      .select("id")
      .single();

    if (insErr || !order) {
      return res.status(500).json({ error: `DB insert failed: ${insErr?.message || "unknown error"}` });
    }

    // 3) Create Stripe Checkout Session
    const base = getBaseUrl(req);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: typeof email === "string" ? email : undefined,
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: `Fuel order — ${f}`,
              description: `${litresNum} L @ £${(unit_price_pence / 100).toFixed(2)}/L`,
            },
            // We charge the whole total as one line so tax/fees don’t drift
            unit_amount: total_pence,
          },
          quantity: 1,
        },
      ],
      success_url: `${base}/checkout/success?orderId=${order.id}`,
      cancel_url: `${base}/checkout/cancel?orderId=${order.id}`,
      metadata: {
        order_id: order.id,
        fuel: String(f),
        litres: String(litresNum),
        unit_price_pence: String(unit_price_pence),
        total_pence: String(total_pence),
        delivery_date: typeof deliveryDate === "string" ? deliveryDate : "",
        full_name: typeof full_name === "string" ? full_name : "",
        email: typeof email === "string" ? email : "",
        address_line1: typeof address_line1 === "string" ? address_line1 : "",
        address_line2: typeof address_line2 === "string" ? address_line2 : "",
        city: typeof city === "string" ? city : "",
        postcode: typeof postcode === "string" ? postcode : "",
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (e: any) {
    console.error("Stripe create error:", e);
    return res.status(500).json({ error: e?.message || "create_session_failed" });
  }
}

