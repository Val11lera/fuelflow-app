import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

// Service-role admin client (bypasses RLS)
const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

// If you prefer "public_orders", set ORDERS_TABLE=public_orders in .env
const ORDERS_TABLE = (process.env.ORDERS_TABLE || "orders").trim();

/** Build an absolute URL that works locally & on Vercel */
function baseUrl(req: NextApiRequest) {
  const env = process.env.SITE_URL && process.env.SITE_URL.trim();
  if (env) return env.replace(/\/+$/, "");
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

async function getUnitPriceGBPPerL(fuel: "petrol" | "diesel") {
  // Try database price view first
  const { data, error } = await supabase
    .from("latest_daily_prices")
    .select("fuel,total_price")
    .eq("fuel", fuel)
    .maybeSingle();

  if (!error && data && Number.isFinite(Number(data.total_price))) {
    return Number(data.total_price);
  }
  // Fallback so you can still test if the view is missing
  return fuel === "diesel" ? 0.49 : 0.46;
}

async function insertOrderRow(row: Record<string, any>) {
  // Try configured table first, then auto-fallback to public_orders
  let table = ORDERS_TABLE;

  let ins = await supabase.from(table).insert(row).select("id").single();
  if (ins.error && /relation .* does not exist/i.test(ins.error.message)) {
    table = "public_orders";
    ins = await supabase.from(table).insert(row).select("id").single();
  }

  if (ins.error || !ins.data) {
    const msg = ins.error?.message || `Insert failed into ${table}`;
    return { ok: false as const, error: msg };
  }
  return { ok: true as const, id: ins.data.id, table };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  try {
    const {
      userEmail,
      fuel,
      litres,
      deliveryDate,
      name,
      address,
      postcode,
    } = req.body as {
      userEmail: string;
      fuel: "petrol" | "diesel";
      litres: number;
      deliveryDate?: string | null;
      name?: string;
      address?: string;
      postcode?: string;
    };

    if (!userEmail || !fuel || !litres || litres <= 0) {
      return res.status(400).json({ error: "Missing or invalid order fields" });
    }

    // 1) Price (DB first, fallback if needed)
    const unitPrice = await getUnitPriceGBPPerL(fuel);
    const total = unitPrice * litres;
    const totalPence = Math.round(total * 100);

    // 2) Create order row
    const row = {
      user_email: userEmail,
      fuel,
      litres,
      delivery_date: deliveryDate ?? null,
      name: name ?? null,
      address: address ?? null,
      postcode: postcode ?? null,
      unit_price: unitPrice,
      total_amount_pence: totalPence,
      status: "pending",
    };
    const inserted = await insertOrderRow(row);
    if (!inserted.ok) {
      console.error("Order insert error:", inserted.error);
      return res.status(500).json({ error: "Failed to create order", details: inserted.error });
    }

    const orderId = inserted.id;
    const success = `${baseUrl(req)}/checkout/success?orderId=${orderId}`;
    const cancel = `${baseUrl(req)}/checkout/cancel?orderId=${orderId}`;

    // 3) Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: userEmail,
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: `Fuel order - ${fuel}`,
              description: `${litres} litre(s) @ £${unitPrice.toFixed(2)}/L`,
            },
            unit_amount: totalPence,
          },
          quantity: 1,
        },
      ],
      success_url: success,
      cancel_url: cancel,
      metadata: {
        order_id: orderId,
        fuel,
        litres: String(litres),
        unit_price: String(unitPrice),
        email: userEmail,
      },
      payment_intent_data: {
        metadata: {
          order_id: orderId,
          fuel,
          litres: String(litres),
          unit_price: String(unitPrice),
          email: userEmail,
        },
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (e: any) {
    console.error("create checkout error", e);
    return res.status(500).json({ error: e?.message || "Checkout creation failed" });
  }
}

