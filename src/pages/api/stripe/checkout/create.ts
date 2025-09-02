import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

/** Build an absolute base URL that works locally & on Vercel */
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

// server-side admin client
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
      fuel,           // "petrol" | "diesel"
      litres,         // number
      deliveryDate,   // ISO string or null
      full_name,
      email,
      address_line1,
      address_line2,
      city,
      postcode,
    } = req.body || {};

    if (!fuel || !litres || litres <= 0) {
      return res.status(400).json({ error: "Missing/invalid fuel or litres" });
    }

    // 1) Read latest unit price from public.latest_prices view
    const { data: priceRow, error: priceErr } = await supabase
      .from("latest_prices")
      .select("fuel,total_price")
      .eq("fuel", fuel)
      .maybeSingle();

    if (priceErr || !priceRow) {
      return res.status(500).json({ error: "Could not fetch unit price" });
    }

    const unitPrice = Number(priceRow.total_price); // £ per litre
    const total = unitPrice * Number(litres);       // £
    const totalPence = Math.round(total * 100);     // pence

    // 2) Create an order row first
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        user_email: email ?? null,
        fuel,
        litres: Number(litres),
        delivery_date: deliveryDate ?? null,
        name: full_name ?? null,
        address: address_line1 ?? null,
        postcode: postcode ?? null,
        unit_price: unitPrice,                // £
        total_amount_pence: totalPence,       // pence
        status: "pending",
      })
      .select("id")
      .single();

    if (orderErr || !order) {
      return res.status(500).json({ error: "Failed to create order" });
    }

    // 3) Create Stripe Checkout Session – ALWAYS return JSON with {url}
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
              description: `${litres} L @ £${unitPrice.toFixed(2)}/L`,
            },
            unit_amount: totalPence, // total as single line item
          },
          quantity: 1,
        },
      ],
      success_url: `${base}/checkout/success?orderId=${order.id}`,
      cancel_url: `${base}/checkout/cancel?orderId=${order.id}`,
      metadata: {
        order_id: order.id,
        fuel: String(fuel),
        litres: String(litres),
        unit_price: unitPrice.toFixed(4),
        total: total.toFixed(2),
        delivery_date: deliveryDate ? String(deliveryDate) : "",
        email: typeof email === "string" ? email : "",
        full_name: typeof full_name === "string" ? full_name : "",
        address_line1: typeof address_line1 === "string" ? address_line1 : "",
        address_line2: typeof address_line2 === "string" ? address_line2 : "",
        city: typeof city === "string" ? city : "",
        postcode: typeof postcode === "string" ? postcode : "",
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error("create checkout error", err);
    return res.status(500).json({ error: err?.message || "Checkout creation failed" });
  }
}
