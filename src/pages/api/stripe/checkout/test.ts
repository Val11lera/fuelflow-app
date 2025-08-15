// src/pages/api/stripe/checkout/test.ts
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";

/**
 * Build a reliable absolute base URL on Vercel (works for preview/prod)
 */
function getBaseUrl(req: NextApiRequest) {
  // Vercel / proxies send these headers
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
  // Only allow POST (Stripe Checkout creation must be server-side)
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  try {
    const baseUrl = getBaseUrl(req);

    // Optional inputs from the client (safe values only, amount is validated below)
    const orderId = (req.body?.order_id as string) || undefined;
    const amountInMinor = Number(req.body?.amount ?? 5000); // default £50.00
    const currency = (req.body?.currency as string)?.toLowerCase() || "gbp";
    const productName = (req.body?.product_name as string) || "Test Payment";

    // Simple guardrails for the demo
    if (!Number.isFinite(amountInMinor) || amountInMinor <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency,
            product_data: { name: productName },
            unit_amount: amountInMinor, // e.g. 5000 = £50.00
          },
          quantity: 1,
        },
      ],
      // After payment Stripe will send the shopper here.
      // {CHECKOUT_SESSION_ID} is replaced by Stripe automatically.
      success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/checkout/cancel`,
      // If you want to link back to your own order record:
      metadata: orderId ? { order_id: orderId } : undefined,
      // (optional) allow promo codes or collect emails:
      // allow_promotion_codes: true,
      // customer_email: req.body?.email || undefined,
    });

    // Redirect the browser to Stripe Checkout
    res.writeHead(303, { Location: session.url as string });
    return res.end();
  } catch (err: any) {
    console.error("Create session error:", err);
    return res
      .status(500)
      .json({ error: err?.message || "create_session_failed" });
  }
}

