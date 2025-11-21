// src/pages/api/create-checkout-session.ts
// src/pages/api/create-checkout-session.ts
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

type Fuel = "petrol" | "diesel";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

// server-side Supabase client (service role)
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
    } = (req.body || {}) as {
      fuel?: string;
      litres?: number | string;
      email?: string;
      name?: string;
      addressLine1?: string;
      addressLine2?: string;
      city?: string;
      postcode?: string;
      deliveryDate?: string;
    };

    const fuel = rawFuel?.toLowerCase() as Fuel | undefined;
    const litresNum = Number(rawLitres);
    const lowerEmail = (email || "").trim().toLowerCase();

    if (
      !fuel ||
      (fuel !== "diesel" && fuel !== "petrol") ||
      !lowerEmail ||
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

    // 1) Load latest unit price from Supabase
    const { data: priceRow, error: priceError } = await supabase
      .from("latest_daily_prices")
      .select("total_price")
      .eq("fuel", fuel)
      .order("price_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (priceError || !priceRow) {
      console.error("[create-checkout-session] price error", priceError);
      return res.status(500).json({ error: "Price not available" });
    }

    const unitPriceGbp = Number(priceRow.total_price); // e.g. 0.74
    const unitAmountPence = Math.round(unitPriceGbp * 100); // 74
    const totalAmountPence = unitAmountPence * qty;
    const totalAmountGbp = totalAmountPence / 100;

    // 2) Create order row in Supabase (PENDING)
    const { data: orderRow, error: orderError } = await supabase
      .from("orders")
      .insert({
        user_email: lowerEmail,
        email: lowerEmail,
        product: fuel === "petrol" ? "Petrol (95)" : "Diesel",
        fuel,
        litres: qty,
        unit_price_pence: unitAmountPence,
        total_pence: totalAmountPence,
        amount: totalAmountGbp,
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
      console.error("[create-checkout-session] order insert error", orderError);
      return res
        .status(500)
        .json({ error: "Failed to create order in database" });
    }

    const orderId: string = orderRow.id;

    // 3) Build origin for redirect URLs
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

    // 4) Create Stripe Checkout Session with full metadata
    const metadata = {
      order_id: orderId,
      email: lowerEmail,
      fuel,
      litres: String(qty),
      deliveryDate,
      flow: "fuel_order",
    };

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: lowerEmail,
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name:
                fuel === "petrol"
                  ? `Petrol (95) – ${qty} litres`
                  : `Diesel – ${qty} litres`,
            },
            unit_amount: unitAmountPence, // pence
          },
          quantity: qty,
        },
      ],
      metadata,
      payment_intent_data: {
        metadata,
      },
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}&orderId=${orderId}`,
      cancel_url: `${origin}/order`,
    });

    // 5) Save Checkout Session ID on order (helps dashboards/reconciliation)
    try {
      await supabase
        .from("orders")
        .update({ stripe_session_id: session.id })
        .eq("id", orderId);
    } catch (e) {
      console.error(
        "[create-checkout-session] failed to save stripe_session_id",
        e
      );
    }

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error("[create-checkout-session] error", err);
    return res
      .status(500)
      .json({ error: err?.message || "Unable to create checkout session" });
  }
}
