// src/pages/api/stripe/checkout/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";

/** Build an absolute base URL that works on Vercel + locally */
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  try {
    const {
      order_id,
      fuel,
      litres,
      unit_price,
      total,
      email,
      delivery_date,
      full_name,
      address_line1,
      address_line2,
      city,
      postcode,
    } = req.body || {};

    // ---- minimal validation & tolerant calculations ----
    if (!order_id || typeof order_id !== "string") {
      return res.status(400).json({ error: "order_id is required" });
    }

    const litresNum = Number(litres);
    if (!Number.isFinite(litresNum) || litresNum <= 0) {
      return res.status(400).json({ error: "litres must be a positive number" });
    }

    const unitPriceNum = Number(unit_price);
    const totalNum = Number(total);

    let resolvedUnitPrice = Number.isFinite(unitPriceNum) ? unitPriceNum : NaN;
    let resolvedTotal = Number.isFinite(totalNum) ? totalNum : NaN;

    if (!Number.isFinite(resolvedUnitPrice) && Number.isFinite(resolvedTotal)) {
      // derive unit price from total
      resolvedUnitPrice = resolvedTotal / litresNum;
    }
    if (!Number.isFinite(resolvedTotal) && Number.isFinite(resolvedUnitPrice)) {
      // derive total from unit price
      resolvedTotal = resolvedUnitPrice * litresNum;
    }

    if (!Number.isFinite(resolvedUnitPrice) || resolvedUnitPrice <= 0) {
      return res.status(400).json({ error: "unit_price is missing/invalid" });
    }
    if (!Number.isFinite(resolvedTotal) || resolvedTotal <= 0) {
      return res.status(400).json({ error: "total is missing/invalid" });
    }

    const amountMinor = Math.round(resolvedTotal * 100); // pence
    const baseUrl = getBaseUrl(req);

    // Build a readable product name
    const productName = `Fuel order — ${fuel ?? "fuel"} (${litresNum}L @ £${resolvedUnitPrice.toFixed(
      2
    )}/L)`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: typeof email === "string" ? email : undefined,
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: { name: productName },
            unit_amount: amountMinor, // total as single line item
          },
          quantity: 1,
        },
      ],
      // After payment
      success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/checkout/cancel`,
      // Attach everything else as metadata (shows up on PaymentIntent/Charge)
      metadata: {
        order_id,
        fuel: String(fuel ?? ""),
        litres: String(litresNum),
        unit_price: resolvedUnitPrice.toFixed(4),
        total: resolvedTotal.toFixed(2),
        delivery_date: delivery_date ? String(delivery_date) : "",
        email: typeof email === "string" ? email : "",
        full_name: typeof full_name === "string" ? full_name : "",
        address_line1: typeof address_line1 === "string" ? address_line1 : "",
        address_line2: typeof address_line2 === "string" ? address_line2 : "",
        city: typeof city === "string" ? city : "",
        postcode: typeof postcode === "string" ? postcode : "",
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error("Stripe create session error:", err);
    return res
      .status(500)
      .json({ error: err?.message || "create_session_failed" });
  }
}



