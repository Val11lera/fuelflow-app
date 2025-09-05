// src/pages/api/stripe/checkout/create.ts
// src/pages/api/stripe/checkout/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

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
    const {
      fuel,
      litres,
      deliveryDate,
      full_name,
      email,
      address_line1,
      address_line2,
      city,
      postcode,
    } = (req.body || {}) as Record<string, any>;

    const litresNum = Number(litres);
    if (!fuel || !Number.isFinite(litresNum) || litresNum <= 0) {
      return res.status(400).json({ error: "Missing/invalid fuel or litres" });
    }

    // price lookup (view -> fallback)
    let unitPriceGBP: number | null = null;

    let p1 = await supabase.from("latest_prices").select("fuel,total_price").eq("fuel", fuel).maybeSingle();
    if (p1.data?.total_price != null) {
      unitPriceGBP = Number(p1.data.total_price);
    } else {
      const p2 = await supabase
        .from("latest_daily_prices")
        .select("fuel,total_price")
        .eq("fuel", fuel)
        .maybeSingle();
      if (p2.data?.total_price != null) unitPriceGBP = Number(p2.data.total_price);
    }
    if (unitPriceGBP == null) {
      return res.status(500).json({ error: "Price lookup failed" });
    }

    const unit_price_pence = Math.round(unitPriceGBP * 100);
    const total_pence = unit_price_pence * litresNum;

    // insert order
    const ins = await supabase
      .from("orders")
      .insert({
        user_email: typeof email === "string" ? email : null,
        fuel,
        litres: litresNum,
        unit_price_pence,
        total_pence,
        status: "pending",
        delivery_date: deliveryDate ?? null,
        name: typeof full_name === "string" ? full_name : null,
        address_line1: typeof address_line1 === "string" ? address_line1 : null,
        address_line2: typeof address_line2 === "string" ? address_line2 : null,
        city: typeof city === "string" ? city : null,
        postcode: typeof postcode === "string" ? postcode : null,
      })
      .select("id")
      .single();

    if (ins.error || !ins.data) {
      return res.status(500).json({ error: `DB insert failed: ${ins.error?.message || "unknown"}` });
    }

    const base = getBaseUrl(req);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: typeof email === "string" ? email : undefined,
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: `Fuel order — ${fuel}`,
              description: `${litresNum} L @ £${(unit_price_pence / 100).toFixed(2)}/L`,
            },
            unit_amount: total_pence,
          },
          quantity: 1,
        },
      ],
      success_url: `${base}/checkout/success?orderId=${ins.data.id}`,
      cancel_url: `${base}/checkout/cancel?orderId=${ins.data.id}`,
      metadata: {
        order_id: ins.data.id,
        fuel: String(fuel),
        litres: String(litresNum),
        unit_price_pence: String(unit_price_pence),
        total_pence: String(total_pence),
        delivery_date: deliveryDate ? String(deliveryDate) : "",
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
