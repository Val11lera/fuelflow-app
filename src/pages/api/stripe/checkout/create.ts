// src/pages/api/stripe/checkout/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

type Fuel = "petrol" | "diesel";

/** Absolute base URL that works on Vercel & locally */
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

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

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
      fuel,               // "petrol" | "diesel"
      litres,             // number
      deliveryDate,       // ISO string
      full_name,
      email,
      address_line1,
      address_line2,
      city,
      postcode,
    } = (req.body ?? {}) as {
      fuel: Fuel;
      litres: number;
      deliveryDate?: string | null;
      full_name?: string;
      email?: string;
      address_line1?: string;
      address_line2?: string;
      city?: string;
      postcode?: string;
    };

    // validate
    const litresNum = Number(litres);
    if ((fuel !== "petrol" && fuel !== "diesel") || !Number.isFinite(litresNum) || litresNum <= 0) {
      return res.status(400).json({ error: "Missing/invalid fuel or litres" });
    }

    // 1) get unit price (GBP/L) from latest_prices, fallback to latest_daily_prices
    let unitPriceGBP: number | null = null;

    const { data: p1, error: err1 } = await supabase
      .from("latest_prices")
      .select("fuel,total_price")
      .eq("fuel", fuel)
      .maybeSingle();

    if (p1?.total_price != null) {
      unitPriceGBP = Number(p1.total_price);
    } else {
      const { data: p2, error: err2 } = await supabase
        .from("latest_daily_prices")
        .select("fuel,total_price")
        .eq("fuel", fuel)
        .maybeSingle();

      if (p2?.total_price != null) {
        unitPriceGBP = Number(p2.total_price);
      } else {
        return res
          .status(500)
          .json({ error: `Price lookup failed: ${(err1 || err2)?.message || "not found"}` });
      }
    }

    const unit_price_pence = Math.round((unitPriceGBP as number) * 100);
    const total_pence = unit_price_pence * litresNum;
    const amount_gbp = total_pence / 100; // legacy "amount" column (NOT NULL) expects GBP

    // 2) insert order — set ALL legacy + new columns that your schema uses
    const f = fuel as string;

    const { data: order, error: insErr } = await supabase
      .from("orders")
      .insert({
        // identity / customer
        user_email: email ?? null,
        // legacy required columns
        product: f,          // keep this as NOT NULL if your schema requires it
        amount: amount_gbp,  // <-- satisfies NOT NULL on "amount" (GBP)
        // modern columns
        fuel: f,
        litres: litresNum,
        unit_price_pence,
        total_pence,
        status: "pending",
        // delivery & contact
        delivery_date: deliveryDate ?? null,
        name: full_name ?? null,
        address_line1: address_line1 ?? null,
        address_line2: address_line2 ?? null,
        city: city ?? null,
        postcode: postcode ?? null,
      })
      .select("id")
      .single();

    if (insErr || !order) {
      return res.status(500).json({
        error: `DB insert failed: ${insErr?.message || "unknown error"}`,
      });
    }

    // 3) Stripe Checkout (one line equal to total payable)
    const base = getBaseUrl(req);
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
            unit_amount: total_pence,
          },
          quantity: 1,
        },
      ],
      success_url: `${base}/checkout/success?orderId=${order.id}`,
      cancel_url: `${base}/checkout/cancel?orderId=${order.id}`,
      metadata: {
        order_id: order.id,
        fuel: String(fuel),
        litres: String(litresNum),
        unit_price_pence: String(unit_price_pence),
        total_pence: String(total_pence),
        delivery_date: deliveryDate ? String(deliveryDate) : "",
        full_name: full_name || "",
        email: email || "",
        address_line1: address_line1 || "",
        address_line2: address_line2 || "",
        city: city || "",
        postcode: postcode || "",
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (e: any) {
    console.error("Stripe create error:", e);
    return res.status(500).json({ error: e?.message || "create_session_failed" });
  }
}


