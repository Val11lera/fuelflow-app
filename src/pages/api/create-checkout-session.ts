// src/pages/api/create-checkout-session.ts
// src/pages/api/create-checkout-session.ts

import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // MUST BE SERVICE ROLE
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== "POST")
      return res.status(405).json({ error: "Method not allowed" });

    const {
      fuel,
      litres,
      email,
      name,
      addressLine1,
      addressLine2,
      city,
      postcode,
      deliveryDate,
    } = req.body;

    // ----------- VALIDATE -------------
    if (
      !fuel ||
      !litres ||
      !email ||
      !name ||
      !addressLine1 ||
      !city ||
      !postcode ||
      !deliveryDate
    ) {
      return res.status(400).json({ error: "Missing order details" });
    }

    // ----------- INSERT ORDER INTO SUPABASE -------------
    const { data: orderRow, error: insertError } = await supabase
      .from("orders")
      .insert({
        user_email: email.toLowerCase(),
        fuel,
        litres,
        full_name: name,
        address_line1: addressLine1,
        address_line2: addressLine2,
        city,
        postcode,
        delivery_date: deliveryDate,
        payment_status: "pending",
      })
      .select()
      .single();

    if (insertError) {
      console.error(insertError);
      return res.status(500).json({ error: "Failed to create order record" });
    }

    // ----------- CREATE STRIPE CHECKOUT SESSION ----------
    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: `${fuel.toUpperCase()} – ${litres} litres`,
            },
            unit_amount: 1, // temporary, amount updated on webhook
          },
          quantity: 1,
        },
      ],
      metadata: {
        order_id: orderRow.id,
        fuel,
        litres,
        delivery_date: deliveryDate,
      },
      success_url: `${process.env.NEXT_PUBLIC_DASHBOARD_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_DASHBOARD_URL}/order?canceled=1`,
    });

    // Save session ID
    await supabase
      .from("orders")
      .update({ stripe_session_id: checkout.id })
      .eq("id", orderRow.id);

    return res.status(200).json({ url: checkout.url });
  } catch (err: any) {
    console.error("CHECKOUT ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
}
