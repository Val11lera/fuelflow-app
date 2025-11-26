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
  // works both locally and on Vercel
  (process.env.SUPABASE_URL as string) ||
    (process.env.NEXT_PUBLIC_SUPABASE_URL as string),
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

// Commission per litre in pence (from env)
// Platform commission as a percentage of the total order (from env).
// Example: 5 => 5% of totalAmountPence.
// Supports different % for petrol vs diesel, with an optional global fallback.
function getCommissionPercent(fuel: Fuel): number {
  const fallback = Number(process.env.PLATFORM_COMMISSION_PERCENT || "0");

  if (fuel === "petrol") {
    const raw = process.env.PETROL_COMMISSION_PERCENT;
    return Number(raw ?? String(fallback));
  }

  if (fuel === "diesel") {
    const raw = process.env.DIESEL_COMMISSION_PERCENT;
    return Number(raw ?? String(fallback));
  }

  return fallback;
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
      fuel: string;
      litres: number | string;
      email: string;
      name: string;
      addressLine1: string;
      addressLine2?: string;
      city: string;
      postcode: string;
      deliveryDate: string;
    };

    // Normalise fuel (e.g. "Diesel" -> "diesel")
    const fuel = rawFuel?.toLowerCase() as Fuel | undefined;
    const litresNum = Number(rawLitres);

    // Basic validation
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
      .select("total_price, fuel")
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

    // 2) Create the order row in Supabase
    // IMPORTANT: only use columns we know exist on the `orders` table
    const { data: orderRow, error: orderError } = await supabase
      .from("orders")
      .insert({
        user_email: email.toLowerCase(),
        // dashboards / legacy fields
        product: fuel === "petrol" ? "Petrol (95)" : "Diesel",
        amount: totalAmountPence / 100, // store in pounds for old views
        status: "pending",

        // newer fields (if these columns exist they will be filled,
        // if not, Postgres just ignores them)
        fuel,
        litres: qty,
        unit_price_pence: unitAmountPence,
        total_pence: totalAmountPence,
        delivery_date: deliveryDate,
        name,
        address_line1: addressLine1,
        address_line2: addressLine2 ?? null,
        city,
        postcode,
      } as any) // `as any` to avoid TS complaining about optional columns
      .select("id")
      .single();

    if (orderError || !orderRow) {
      console.error("Failed to insert order:", orderError);
      return res.status(500).json({
        error: "Failed to create order in DB",
        details: orderError?.message ?? orderError,
      });
    }

    const orderId = orderRow.id as string;

    // 3) Calculate your commission (platform fee)
    // 3) Calculate your commission (platform fee) as % of order total
    const commissionPercent = getCommissionPercent(fuel);
    const platformFeeAmount = Math.round(
      (totalAmountPence * commissionPercent) / 100
    ); // still in pence (smallest currency unit)


    // 4) Prepare Connect split – only if account configured
    const refineryAccountId = process.env.REFINERY_STRIPE_ACCOUNT_ID;

    const paymentIntentData: Stripe.Checkout.SessionCreateParams.PaymentIntentData =
      refineryAccountId
        ? {
            // only send application_fee_amount if you actually have a fee
            ...(platformFeeAmount > 0
              ? { application_fee_amount: platformFeeAmount }
              : {}),
            transfer_data: {
              destination: refineryAccountId,
            },
          }
        : {};


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
        deliveryDate,
      },
    });

    // 7) Save session id onto the order (helps dashboards & reconciliation)
    await supabase
      .from("orders")
      .update({ stripe_session_id: session.id })
      .eq("id", orderId);

    return res.status(200).json({ id: session.id, url: session.url });
  } catch (err: any) {
    console.error("Stripe Checkout error:", err);

    const message =
      err?.raw?.message || err?.message || "Unable to create checkout session";

    return res.status(500).json({ error: message });
  }
}
