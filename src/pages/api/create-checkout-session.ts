// src/pages/api/create-checkout-session.ts
// src/pages/api/create-checkout-session.ts
// src/pages/api/create-checkout-session.ts

import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

// Supabase server client (service role – server only)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

// Commission per litre in pence (from env)
function getCommissionPencePerLitre(fuel: "petrol" | "diesel"): number {
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
    const { fuel, litres, email } = req.body as {
      fuel: "petrol" | "diesel";
      litres: number;
      email: string;
    };

    if (!fuel || !litres || litres <= 0 || !email) {
      return res.status(400).json({ error: "Invalid request data" });
    }

    const emailLower = email.toLowerCase().trim();
    const qty = Math.round(litres); // litres as integer quantity

    // 1) Load latest unit price from Supabase (server-side, secure)
    const { data: priceRow, error } = await supabase
      .from("latest_daily_prices")
      .select("total_price")
      .eq("fuel", fuel)
      .order("price_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !priceRow) {
      console.error("Error loading price from Supabase:", error);
      return res.status(500).json({ error: "Price not available" });
    }

    const unitPriceGbp = Number(priceRow.total_price); // e.g. 1.40
    const unitAmountPence = Math.round(unitPriceGbp * 100); // e.g. 140

    const totalAmountPence = unitAmountPence * qty;

    // 2) Calculate your commission (platform fee)
    const commissionPencePerLitre = getCommissionPencePerLitre(fuel);
    const platformFeeAmount = commissionPencePerLitre * qty; // in pence

    // 3) Try to insert order in Supabase and get orderId (order reference)
    let orderId: string | null = null;
    try {
      const { data: orderRow, error: orderErr } = await supabase
        .from("orders")
        .insert({
          user_email: emailLower,
          fuel,
          litres: qty,
          unit_price_pence: unitAmountPence,
          total_pence: totalAmountPence,
          status: "pending",
        })
        .select("id")
        .single();

      if (orderErr) {
        console.error("Error inserting order (non-fatal):", orderErr);
      } else if (orderRow?.id) {
        orderId = orderRow.id as string;
      }
    } catch (e) {
      console.error("Unexpected error inserting order (non-fatal):", e);
    }

    // 4) Prepare Connect split + metadata for the PaymentIntent
    const refineryAccountId = process.env.REFINERY_STRIPE_ACCOUNT_ID;

    const paymentIntentData: Stripe.Checkout.SessionCreateParams.PaymentIntentData =
      {
        metadata: {
          // orderId may be null; that's fine
          ...(orderId ? { order_id: orderId } : {}),
          fuel,
          litres: String(qty),
          email: emailLower,
        },
      };

    if (refineryAccountId && platformFeeAmount > 0) {
      paymentIntentData.application_fee_amount = platformFeeAmount;
      paymentIntentData.transfer_data = {
        destination: refineryAccountId,
      };
    }

    // 5) Build a valid origin (with https://)
    const envAppUrl = process.env.NEXT_PUBLIC_APP_URL;
    const origin =
      (envAppUrl && envAppUrl.startsWith("http")
        ? envAppUrl
        : envAppUrl
        ? `https://${envAppUrl}`
        : req.headers.origin) || "https://dashboard.fuelflow.co.uk";

    // Build success URL (include orderId only if we have it)
    const baseSuccess = `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
    const successUrl = orderId
      ? `${baseSuccess}&orderId=${encodeURIComponent(orderId)}`
      : baseSuccess;

    // 6) Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: emailLower,
      success_url: successUrl,
      cancel_url: `${origin}/order`, // back to order page on cancel
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: `${
                fuel === "petrol" ? "Petrol (95)" : "Diesel"
              } – ${qty.toLocaleString()} litres`,
            },
            unit_amount: unitAmountPence, // in pence
          },
          quantity: qty,
        },
      ],
      // orderId may be null; Stripe is fine with that
      client_reference_id: orderId || undefined,
      metadata: {
        ...(orderId ? { order_id: orderId } : {}),
        fuel,
        litres: String(qty),
        email: emailLower,
      },
      payment_intent_data: paymentIntentData,
    });

    // 7) Create payments row linked to the order (best-effort)
    try {
      const piId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null;

      await supabase.from("payments").insert({
        order_id: orderId, // may be null
        amount: totalAmountPence,
        currency: "gbp",
        status: "created", // your webhook should update this to "succeeded/paid"
        email: emailLower,
        cs_id: session.id,
        pi_id: piId,
      });
    } catch (e) {
      console.error("Failed to insert payments row (non-fatal):", e);
    }

    return res.status(200).json({ id: session.id, url: session.url });
  } catch (err: any) {
    console.error("Stripe Checkout error:", err);

    const message =
      err?.raw?.message || // Stripe errors
      err?.message ||
      "Unable to create checkout session";

    return res.status(500).json({ error: message });
  }
}

