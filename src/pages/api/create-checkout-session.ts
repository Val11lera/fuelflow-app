// src/pages/api/create-checkout-session.ts
// src/pages/api/create-checkout-session.ts
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

type Fuel = "petrol" | "diesel";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

// Supabase server client (service role – server only)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

// Commission per litre in pence (from env)
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
    const {
      fuel: rawFuel,
      litres: rawLitres,
      email,
      name,
      addressLine1,
      addressLine2,
      city,
      postcode,
      deliveryDate,
    } = req.body as {
      fuel: string; // we’ll normalise below
      litres: number | string;
      email: string;
      name: string;
      addressLine1: string;
      addressLine2?: string;
      city: string;
      postcode: string;
      deliveryDate: string; // ISO date string from the form
    };

    // Normalise fuel (e.g. "Diesel" -> "diesel")
    const fuel = rawFuel?.toLowerCase() as Fuel | undefined;
    const litresNum = Number(rawLitres);

    // Basic validation – this is what was triggering “Missing order details”
    if (
      !fuel ||
      (fuel !== "petrol" && fuel !== "diesel") ||
      !email ||
      !name ||
      !addressLine1 ||
      !city ||
      !postcode ||
      !deliveryDate ||
      !Number.isFinite(litresNum) ||
      litresNum <= 0
    ) {
      return res.status(400).json({ error: "Missing order details" });
    }

    const qty = Math.round(litresNum);

    // 1) Load latest unit price from Supabase (server-side, secure)
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

    const unitPriceGbp = Number(priceRow.total_price); // e.g. 0.74
    const unitAmountPence = Math.round(unitPriceGbp * 100); // e.g. 74
    const totalAmountPence = unitAmountPence * qty;

    // 2) Create the order row in Supabase (with full address etc.)
    const { data: orderRow, error: orderError } = await supabase
      .from("orders")
      .insert({
        user_email: email,
        fuel,
        litres: qty,
        unit_price_pence: unitAmountPence,
        total_pence: totalAmountPence,
        status: "pending",
        name,
        address_line1: addressLine1,
        address_line2: addressLine2 ?? null,
        city,
        postcode,
        delivery_date: deliveryDate,
      })
      .select("id")
      .single();

    if (orderError || !orderRow) {
      console.error("Failed to insert order:", orderError);
      return res.status(500).json({ error: "Failed to create order in DB" });
    }

    const orderId = orderRow.id;

    // 3) Calculate your commission (platform fee)
    const commissionPencePerLitre = getCommissionPencePerLitre(fuel);
    const platformFeeAmount = commissionPencePerLitre * qty; // in pence

    // 4) Prepare Connect split – only if account configured
    const refineryAccountId = process.env.REFINERY_STRIPE_ACCOUNT_ID;

    const paymentIntentData: Stripe.Checkout.SessionCreateParams.PaymentIntentData =
      refineryAccountId && platformFeeAmount > 0
        ? {
            application_fee_amount: platformFeeAmount,
            transfer_data: {
              destination: refineryAccountId,
            },
          }
        : {}; // fallback: all money stays with you

    // 5) Build a valid origin (with https://)
    const envAppUrl = process.env.NEXT_PUBLIC_APP_URL;
    const origin =
      (envAppUrl && envAppUrl.startsWith("http")
        ? envAppUrl
        : envAppUrl
        ? `https://${envAppUrl}`
        : req.headers.origin) || "https://dashboard.fuelflow.co.uk";

    // 6) Create Stripe Checkout session
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
              name: `${
                fuel === "petrol" ? "Petrol (95)" : "Diesel"
              } – ${qty.toLocaleString()} litres`,
            },
            unit_amount: unitAmountPence, // in pence
          },
          quantity: qty,
        },
      ],
      payment_intent_data: paymentIntentData,
    });

    // Save session id back onto the order (helps dashboards & reconciliation)
    await supabase
      .from("orders")
      .update({ stripe_session_id: session.id })
      .eq("id", orderId);

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
