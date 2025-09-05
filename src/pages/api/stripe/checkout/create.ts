// src/pages/api/stripe/checkout/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

/** Build an absolute base URL that works behind proxies (Vercel, etc.) */
function getBaseUrl(req: NextApiRequest) {
  const proto =
    (req.headers["x-forwarded-proto"] as string) ||
    (req.headers["x-forwarded-protocol"] as string) ||
    "https";
  const host =
    (req.headers["x-forwarded-host"] as string) ||
    (req.headers["host"] as string) ||
    "localhost:3000";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

// service role client (bypasses RLS)
const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const {
      fuel, // "petrol" | "diesel"
      litres,
      deliveryDate,
      full_name,
      email,
      address_line1,
      address_line2,
      city,
      postcode,
    } = (req.body || {}) as {
      fuel: "petrol" | "diesel";
      litres: number | string;
      deliveryDate?: string | null;
      full_name?: string | null;
      email?: string | null;
      address_line1?: string | null;
      address_line2?: string | null;
      city?: string | null;
      postcode?: string | null;
    };

    const litresNum = Number(litres);
    if (!fuel || !Number.isFinite(litresNum) || litresNum <= 0) {
      return res.status(400).json({ error: "Missing/invalid fuel or litres" });
    }

    // 1) price lookup (view -> fallback)
    let unitPriceGBP: number | null = null;

    let { data: v1 } = await supabase
      .from("latest_prices")
      .select("fuel,total_price")
      .eq("fuel", fuel)
      .maybeSingle();

    if (v1?.total_price != null) unitPriceGBP = Number(v1.total_price);
    if (unitPriceGBP == null) {
      const { data: v2, error: e2 } = await supabase
        .from("latest_daily_prices")
        .select("fuel,total_price")
        .eq("fuel", fuel)
        .maybeSingle();
      if (v2?.total_price != null) unitPriceGBP = Number(v2.total_price);
      if (unitPriceGBP == null) {
        return res.status(500).json({ error: `Price lookup failed: ${e2?.message || "not found"}` });
      }
    }

    const unit_price_pence = Math.round((unitPriceGBP as number) * 100);
    const total_pence = Math.round(unit_price_pence * litresNum); // charge as a single line item

    // 2) write order (server-side, service role, so RLS-safe)
    const { data: order, error: insErr } = await supabase
      .from("orders")
      .insert({
        user_email: email || null,
        fuel,
        litres: litresNum,
        delivery_date: deliveryDate ?? null,
        name: full_name ?? null,
        address_line1: address_line1 ?? null,
        address_line2: address_line2 ?? null,
        city: city ?? null,
        postcode: postcode ?? null,
        unit_price_pence,
        total_pence,
        status: "pending",
      })
      .select("id")
      .single();

    if (insErr || !order) {
      return res.status(500).json({ error: `DB insert failed: ${insErr?.message || "unknown error"}` });
    }

    // 3) Stripe Checkout
    const success = `${getBaseUrl(req)}/checkout/success?orderId=${order.id}`;
    const cancel = `${getBaseUrl(req)}/checkout/cancel?orderId=${order.id}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email || undefined,
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: `Fuel order — ${fuel}`,
              description: `${litresNum} L @ £${(unit_price_pence / 100).toFixed(2)}/L`,
            },
            unit_amount: total_pence, // charge the total as one line
          },
          quantity: 1,
        },
      ],
      success_url: success,
      cancel_url: cancel,
      metadata: {
        order_id: order.id,
        fuel,
        litres: String(litresNum),
        unit_price_pence: String(unit_price_pence),
        total_pence: String(total_pence),
        delivery_date: deliveryDate || "",
        full_name: full_name || "",
        email: email || "",
        address_line1: address_line1 || "",
        address_line2: address_line2 || "",
        city: city || "",
        postcode: postcode || "",
      },
      payment_intent_data: {
        metadata: {
          order_id: order.id,
          fuel,
          litres: String(litresNum),
          unit_price_pence: String(unit_price_pence),
          total_pence: String(total_pence),
          delivery_date: deliveryDate || "",
          full_name: full_name || "",
          email: email || "",
          address_line1: address_line1 || "",
          address_line2: address_line2 || "",
          city: city || "",
          postcode: postcode || "",
        },
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (e: any) {
    console.error("Stripe create error:", e);
    return res.status(500).json({ error: e?.message || "create_session_failed" });
  }
}

