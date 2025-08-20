// src/pages/api/stripe/checkout/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const {
      fuel,            // "petrol" | "diesel"
      litres,          // number/string
      unit_price,      // price per litre in GBP, e.g. 4.66
      delivery_date,   // "YYYY-MM-DD"
      email,           // receipt email
      full_name,
      address_line1,
      address_line2,
      city,
      postcode,
    } = req.body ?? {};

    // Basic validation + coercion
    const L = Number(litres);
    const P = Number(unit_price);
    if (!fuel || !["petrol", "diesel"].includes(String(fuel))) {
      return res.status(400).json({ error: "Invalid fuel" });
    }
    if (!Number.isFinite(L) || L <= 0) {
      return res.status(400).json({ error: "Invalid litres" });
    }
    if (!Number.isFinite(P) || P <= 0) {
      return res.status(400).json({ error: "Invalid unit price" });
    }
    if (!email) return res.status(400).json({ error: "Missing email" });

    // Always compute the total on the server (pence)
    const amountPence = Math.round(P * 100 * L);

    const success = `${process.env.SITE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancel  = `${process.env.SITE_URL}/checkout/cancel`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email,
      success_url: success,
      cancel_url: cancel,
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: `Fuel order — ${fuel} (${L}L @ £${P.toFixed(2)}/L)`,
              description: delivery_date ? `Requested delivery: ${delivery_date}` : undefined,
            },
            unit_amount: amountPence, // total in pence
          },
          quantity: 1,
        },
      ],
      shipping_address_collection: { allowed_countries: ["GB"] },
      metadata: {
        fuel: String(fuel),
        litres: String(L),
        unit_price: String(P),
        delivery_date: delivery_date || "",
        full_name: full_name || "",
        address_line1: address_line1 || "",
        address_line2: address_line2 || "",
        city: city || "",
        postcode: postcode || "",
      },
    });

    // 👇 IMPORTANT: return JSON, not a 303
    return res.status(200).json({ url: session.url, session_id: session.id });
  } catch (err: any) {
    console.error("checkout/create error", err);
    return res.status(500).json({ error: err?.message || "server error" });
  }
}

