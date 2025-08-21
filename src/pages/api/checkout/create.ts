// src/pages/api/stripe/checkout/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

// Admin Supabase client (server-only)
const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  try {
    const {
      fuel,                // "petrol" | "diesel"
      litres,              // number (can be decimal)
      unit_price,          // e.g. 0.4466 (GBP / litre)
      total,               // total price in GBP, e.g. 440.00
      delivery_date,       // "YYYY-MM-DD"
      email,               // receipt email
      full_name,
      address_line1,
      address_line2,
      city,
      postcode,
    } = req.body ?? {};

    // --- validate ---
    if (!email || !fuel || !["petrol", "diesel"].includes(String(fuel))) {
      return res.status(400).json({ error: "Missing or invalid fuel/email" });
    }
    const litresNum = Number(litres);
    const unit = Number(unit_price);
    const totalPence =
      Number.isFinite(Number(total))
        ? Math.round(Number(total) * 100)
        : Math.round(litresNum * unit * 100);

    if (!Number.isFinite(litresNum) || litresNum <= 0) {
      return res.status(400).json({ error: "Invalid litres" });
    }
    if (!Number.isFinite(totalPence) || totalPence <= 0) {
      return res.status(400).json({ error: "Invalid total" });
    }

    // --- 1) create a pending order in your DB ---
    const { data: orderRow, error: insErr } = await supabase
      .from("orders")
      .insert({
        user_email: email,
        fuel,
        litres: litresNum,
        unit_price_pence: Math.round(unit * 100),
        total_pence: totalPence,
        delivery_date,
        full_name,
        address_line1,
        address_line2,
        city,
        postcode,
        status: "ordered",          // will be set to 'paid' by the webhook
      })
      .select("id")
      .single();

    if (insErr || !orderRow) {
      return res.status(500).json({ error: "DB insert failed", detail: insErr?.message });
    }
    const orderId = orderRow.id as string;

    // --- 2) create Stripe Checkout session ---
    const baseUrl = getBaseUrl(req);
    // We charge the total as a single line item (quantity 1)
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email, // ensures Checkout captures the email
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: `Fuel order — ${fuel} (${litresNum}L @ £${unit.toFixed(2)}/L)`,
            },
            unit_amount: totalPence,
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/checkout/cancel`,
      // attach order id everywhere so the webhook can join back
      metadata: { order_id: orderId, email },
      payment_intent_data: {
        metadata: { order_id: orderId, email },
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error("create-session error:", err);
    return res.status(500).json({ error: err?.message || "create_session_failed" });
  }
}
