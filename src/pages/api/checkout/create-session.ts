// src/pages/api/checkout/create-session.ts
// src/pages/api/checkout/create-session.ts
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

// Server-only admin client (service role key)
const supabase = createClient(
  (process.env.SUPABASE_URL as string) ||
    (process.env.NEXT_PUBLIC_SUPABASE_URL as string),
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  try {
    const { email, product, amount_pence, currency = "gbp", notes } =
      (req.body as {
        email?: string;
        product?: string;
        amount_pence?: number | string;
        currency?: string;
        notes?: string;
      }) ?? {};

    if (!email || !product || amount_pence == null) {
      return res
        .status(400)
        .json({ error: "email, product, amount_pence are required" });
    }

    const lowerEmail = email.toLowerCase().trim();
    const amountPenceNum = Number(amount_pence);
    if (!Number.isFinite(amountPenceNum) || amountPenceNum <= 0) {
      return res.status(400).json({ error: "amount_pence must be > 0" });
    }

    // Store amount in pounds (to match how your existing orders rows look)
    const amountGbp = amountPenceNum / 100;

    // 1) Create a pending order in Supabase
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        // keep both for compatibility with existing schema / views
        user_email: lowerEmail,
        email: lowerEmail,
        product,
        amount: amountGbp,
        status: "pending",
      })
      .select("id")
      .single();

    if (orderErr || !order) {
      console.error("[create-session] order insert error", orderErr);
      return res.status(500).json({ error: "Failed to create order" });
    }

    const orderId: string = order.id;

    // 2) Determine a safe origin for redirect URLs
    const headerOrigin = req.headers.origin as string | undefined;
    const envUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.SITE_URL ||
      process.env.VERCEL_URL;

    const origin =
      (headerOrigin && headerOrigin.startsWith("http")
        ? headerOrigin
        : envUrl && envUrl.startsWith("http")
        ? envUrl
        : envUrl
        ? `https://${envUrl}`
        : `https://${req.headers.host}`) ?? "https://dashboard.fuelflow.co.uk";

    // 3) Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: lowerEmail,
      line_items: [
        {
          price_data: {
            currency,
            product_data: { name: product },
            unit_amount: amountPenceNum, // pence
          },
          quantity: 1,
        },
      ],
      // metadata is used by the webhook to link & invoice
      metadata: {
        order_id: orderId,
        email: lowerEmail,
        product,
        amount_pence: String(amountPenceNum),
        ...(notes ? { notes } : {}),
      },
      payment_intent_data: {
        // extra safety: PI also knows the order
        metadata: {
          order_id: orderId,
          email: lowerEmail,
          product,
          amount_pence: String(amountPenceNum),
          ...(notes ? { notes } : {}),
        },
      },
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}&orderId=${orderId}`,
      cancel_url: `${origin}/checkout/cancel?order_id=${orderId}`,
    });

    // 4) Store the Checkout Session ID on the order (helps dashboards / reconciliation)
    try {
      await supabase
        .from("orders")
        .update({ stripe_session_id: session.id })
        .eq("id", orderId);
    } catch (e) {
      console.error("[create-session] failed to save stripe_session_id", e);
      // don’t block redirect – webhook will still work using metadata
    }

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error("[create-session] unexpected error", err);
    return res.status(500).json({ error: "Internal error" });
  }
}

