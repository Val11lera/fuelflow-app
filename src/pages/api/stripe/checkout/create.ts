import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

/** Build an absolute base URL that works on Vercel and locally */
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

/** Use the SERVICE ROLE key so RLS cannot block the insert */
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
      fuel,               // "petrol" | "diesel"
      litres,             // number
      deliveryDate,       // ISO string | null
      full_name,
      email,
      address_line1,
      address_line2,
      city,
      postcode,
    } = req.body || {};

    if (!fuel || !litres || Number(litres) <= 0) {
      return res.status(400).json({ error: "Missing/invalid fuel or litres" });
    }

    // 1) Current price from the unified view
    const { data: priceRow, error: priceErr } = await supabase
      .from("latest_prices")
      .select("fuel,total_price")
      .eq("fuel", fuel)
      .maybeSingle();

    if (priceErr) {
      return res.status(500).json({ error: `Price lookup failed: ${priceErr.message}` });
    }
    if (!priceRow) {
      return res.status(500).json({ error: "Price not found for selected fuel" });
    }

    const unitPriceGBP = Number(priceRow.total_price);      // £ per litre (e.g. 1.83)
    const unitPricePence = Math.round(unitPriceGBP * 100);  // e.g. 183
    const totalPence = unitPricePence * Number(litres);     // integer pence total

    // 2) Insert a pending order using your column names
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        user_email: typeof email === "string" ? email : null,
        fuel,
        litres: Number(litres),
        // your schema uses pence columns:
        unit_price_pence: unitPricePence,
        total_pence: totalPence,
        status: "pending",
        // keep optional fields only if the columns exist in your table
        // safe to include; Supabase ignores extras that don't exist if you SELECT after insert
        delivery_date: deliveryDate ?? null,
        name: full_name ?? null,
        address: address_line1 ?? null,
        postcode: postcode ?? null,
      })
      .select("id")                // force PostgREST to return the row after insert
      .single();

    if (orderErr || !order) {
      // Return the real DB error so you can see the cause in the browser alert
      return res.status(500).json({
        error: `DB insert failed: ${orderErr?.message || "unknown error"}`,
      });
    }

    // 3) Create Stripe Checkout Session
    const base = getBaseUrl(req);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: typeof email === "string" ? email : undefined,
      line_items: [
        {
          // total as a single line item; simplest approach
          price_data: {
            currency: "gbp",
            product_data: {
              name: `Fuel order — ${fuel}`,
              description: `${litres} L @ £${unitPriceGBP.toFixed(2)}/L`,
            },
            unit_amount: totalPence,
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
        unit_price_pence: String(unitPricePence),
        total_pence: String(totalPence),
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
  } catch (err: any) {
    console.error("create checkout error", err);
    return res.status(500).json({ error: err?.message || "Checkout creation failed" });
  }
}

