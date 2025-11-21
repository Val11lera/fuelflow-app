// src/pages/api/create-checkout-session.ts
// src/pages/api/create-checkout-session.ts
// Creates a full order in Supabase + Stripe Checkout session

import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

type Fuel = "petrol" | "diesel";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

// Supabase service client (bypasses RLS – server only)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

// Commission per litre in pence (from env vars)
function getCommissionPencePerLitre(fuel: Fuel): number {
  if (fuel === "petrol") {
    return Number(process.env.PETROL_COMMISSION_PENCE_PER_LITRE || "0");
  }
  if (fuel === "diesel") {
    return Number(process.env.DIESEL_COMMISSION_PENCE_PER_LITRE || "0");
  }
  return 0;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Everything coming from the order page
    const {
      fuel,
      litres,
      email,
      name,
      addressLine1,
      addressLine2,
      city,
      postcode,
      deliveryDate, // string: "YYYY-MM-DD"
    } = req.body as {
      fuel: Fuel;
      litres: number;
      email: string;
      name: string;
      addressLine1: string;
      addressLine2?: string;
      city: string;
      postcode: string;
      deliveryDate: string;
    };

    // Basic validation
    if (!fuel || (fuel !== "petrol" && fuel !== "diesel")) {
      return res.status(400).json({ error: "Invalid fuel type" });
    }
    if (!litres || litres <= 0) {
      return res.status(400).json({ error: "Invalid litres" });
    }
    if (!email || !name || !addressLine1 || !city || !postcode || !deliveryDate) {
      return res.status(400).json({ error: "Missing order details" });
    }

    // 1) Load latest unit price from Supabase
    const { data: priceRow, error: priceError } = await supabase
      .from("latest_daily_prices")
      .select("total_price")
      .eq("fuel", fuel)
      .order("price_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (priceError || !priceRow) {
      console.error("Error loading price from Supabase:", priceError);
      return res.status(500).json({ error: "Price not available" });
    }

    // total_price in that table is the unit price in GBP
    const unitPriceGbp = Number(priceRow.total_price); // e.g. 0.74
    const unitAmountPence = Math.round(unitPriceGbp * 100); // e.g. 74

    const qty = Math.round(litres);
    const totalAmountPence = unitAmountPence * qty;
    const totalAmountGbp = totalAmountPence / 100;

    // 2) Calculate your platform commission for Connect
    const commissionPencePerLitre = getCommissionPencePerLitre(fuel);
    const platformFeeAmount = commissionPencePerLitre * qty; // pence
    const refineryAccountId = process.env.REFINERY_STRIPE_ACCOUNT_ID;

    const paymentIntentData: Stripe.Checkout.SessionCreateParams.PaymentIntentData =
      refineryAccountId && platformFeeAmount > 0
        ? {
            application_fee_amount: platformFeeAmount,
            transfer_data: {
              destination: refineryAccountId,
            },
          }
        : {};

    // 3) Build a full order row in Supabase (status = pending)
    const productLabel = fuel === "petrol" ? "Petrol (95)" : "Diesel";

    const { data: orderRow, error: orderError } = await supabase
      .from("orders")
      .insert({
        user_email: email,
        fuel,
        product: productLabel,
        litres: qty,
        // legacy numeric amount column in GBP
        amount: totalAmountGbp,
        // new pence columns
        unit_price_pence: unitAmountPence,
        total_pence: totalAmountPence,

        status: "pending",

        // address + contact details
        name,
        address_line1: addressLine1,
        address_line2: addressLine2 || null,
        city,
        postcode,
        delivery_date: deliveryDate,
      })
      .select("id")
      .single();

    if (orderError || !orderRow) {
      console.error("Error inserting order:", orderError);
      return res.status(500).json({ error: "Failed to create order in database" });
    }

    const orderId = orderRow.id as string;

    // 4) Build origin for redirect URLs
    const envAppUrl = process.env.NEXT_PUBLIC_APP_URL;
    const origin =
      (envAppUrl && envAppUrl.startsWith("http")
        ? envAppUrl
        : envAppUrl
        ? `https://${envAppUrl}`
        : req.headers.origin) || "https://dashboard.fuelflow.co.uk";

    // 5) Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email,
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}&orderId=${orderId}`,
      cancel_url: `${origin}/order`,
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: `${productLabel} – ${qty.toLocaleString()} litres`,
            },
            unit_amount: unitAmountPence,
          },
          quantity: qty,
        },
      ],
      payment_intent_data: paymentIntentData,
      metadata: {
        order_id: orderId,
        fuel,
        litres: String(qty),
      },
    });

    // 6) Save the Checkout session ID on the order row
    const { error: updateError } = await supabase
      .from("orders")
      .update({ stripe_session_id: session.id })
      .eq("id", orderId);

    if (updateError) {
      console.error("Failed to store stripe_session_id on order:", updateError);
      // don’t block the user if this fails – the webhook can still reconcile
    }

    return res.status(200).json({
      id: session.id,
      url: session.url,
      orderId,
    });
  } catch (err: any) {
    console.error("Stripe Checkout error:", err);
    const message =
      err?.raw?.message ||
      err?.message ||
      "Unable to create checkout session";

    return res.status(500).json({ error: message });
  }
}
