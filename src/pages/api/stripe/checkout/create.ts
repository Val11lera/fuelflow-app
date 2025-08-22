import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  try {
    const {
      order_id,
      product, // 'petrol' | 'diesel'
      litres,
      unit_price_pence,
      total_pence,
      customer_email,

      // metadata only
      delivery_date,
      full_name,
      address_line1,
      address_line2,
      city,
      postcode,
    } = req.body || {};

    if (!order_id || !total_pence || !product) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const baseUrl = getBaseUrl(req);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      currency: "gbp",
      line_items: [
        {
          price_data: {
            currency: "gbp",
            unit_amount: Number(total_pence), // pence
            product_data: {
              name: `Fuel order — ${product} (${litres ?? 0}L @ £${(Number(unit_price_pence) / 100).toFixed(
                2
              )}/L)`,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/checkout/cancel`,
      customer_email: customer_email || undefined,
      metadata: {
        order_id,
        product,
        litres: String(litres ?? ""),
        unit_price_pence: String(unit_price_pence ?? ""),
        total_pence: String(total_pence ?? ""),
        delivery_date: delivery_date ?? "",
        full_name: full_name ?? "",
        address_line1: address_line1 ?? "",
        address_line2: address_line2 ?? "",
        city: city ?? "",
        postcode: postcode ?? "",
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error("Create session error:", err);
    return res.status(500).json({ error: err?.message || "create_session_failed" });
  }
}


