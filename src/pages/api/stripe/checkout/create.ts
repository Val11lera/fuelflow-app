import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import supabaseAdmin from "@/lib/supabaseAdmin";

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
      mode, // 'buy' | 'rent' | undefined
    } = req.body || {};

    // RENT approval guard
    if (mode === "rent") {
      if (!email) return res.status(400).json({ error: "Email required for rental approval check" });

      const { data: contract, error: cErr } = await supabaseAdmin
        .from("contracts")
        .select("id,status")
        .eq("email", email)
        .eq("tank_option", "rent")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cErr) return res.status(500).json({ error: "Approval check failed" });
      if (!contract || contract.status !== "approved") {
        return res.status(403).json({ error: "Rental requires admin approval before payment." });
      }
    }

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
      resolvedUnitPrice = resolvedTotal / litresNum;
    }
    if (!Number.isFinite(resolvedTotal) && Number.isFinite(resolvedUnitPrice)) {
      resolvedTotal = resolvedUnitPrice * litresNum;
    }

    if (!Number.isFinite(resolvedUnitPrice) || resolvedUnitPrice <= 0) {
      return res.status(400).json({ error: "unit_price is missing/invalid" });
    }
    if (!Number.isFinite(resolvedTotal) || resolvedTotal <= 0) {
      return res.status(400).json({ error: "total is missing/invalid" });
    }

    const amountMinor = Math.round(resolvedTotal * 100);
    const baseUrl = getBaseUrl(req);

    const productName = `Fuel order — ${fuel ?? "fuel"} (${litresNum}L @ £${resolvedUnitPrice.toFixed(2)}/L)`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: typeof email === "string" ? email : undefined,
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: { name: productName },
            unit_amount: amountMinor,
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/checkout/cancel`,
      metadata: {
        order_id,
        mode: mode || "",
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
    return res.status(500).json({ error: err?.message || "create_session_failed" });
  }
}

