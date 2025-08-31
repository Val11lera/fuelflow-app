// src/pages/api/checkout/session.ts
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { unitPrice, litres, email } = req.body as {
      unitPrice: number;
      litres: number;
      email?: string;
    };

    if (!Number.isFinite(unitPrice) || !Number.isFinite(litres) || litres <= 0) {
      return res.status(400).json({ error: "Invalid input" });
    }

    const amountPence = Math.round(unitPrice * 100 * litres);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: amountPence,
            product_data: {
              name: `Fuel order — ${litres} L @ £${unitPrice.toFixed(2)}/L`,
            },
          },
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/order?success=1`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/order?canceled=1`,
    });

    res.status(200).json({ id: session.id });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Stripe error" });
  }
}
