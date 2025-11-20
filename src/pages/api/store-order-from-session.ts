// src/pages/api/store-order-from-session.ts
// src/pages/api/store-order-from-session.ts
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

// Service-role client so RLS can never block this route
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  {
    auth: { persistSession: false },
  }
);

type Ok = { orderId: string };
type Err = { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Ok | Err>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;

    const sessionId = body?.sessionId as string | undefined;
    if (!sessionId) {
      return res.status(400).json({ error: "Missing sessionId" });
    }

    // 1) Fetch Stripe Checkout Session
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent", "line_items"],
    });

    if (session.payment_status !== "paid") {
      return res.status(400).json({
        error: `Session is not paid (status: ${session.payment_status})`,
      });
    }

    const md = session.metadata || {};
    const fuel = (md.fuel as string | undefined) || "diesel";

    const litres =
      md.litres !== undefined ? Number(md.litres) : undefined;

    const unitPricePence =
      md.unit_price_pence !== undefined
        ? Number(md.unit_price_pence)
        : undefined;

    const totalPence =
      md.total_pence !== undefined
        ? Number(md.total_pence)
        : (session.amount_total as number | null | undefined) ?? null;

    const email = (
      session.customer_details?.email ||
      session.customer_email ||
      (md.email as string | undefined) ||
      ""
    ).toLowerCase();

    if (!email) {
      throw new Error("Missing email on Stripe session");
    }

    // 2) If we already have an order for this session, just return it
    const { data: existing, error: existingErr } = await supabase
      .from("orders")
      .select("id")
      .eq("stripe_session_id", sessionId)
      .maybeSingle();

    if (existingErr) throw existingErr;
    if (existing) {
      return res.status(200).json({ orderId: existing.id });
    }

    // 3) Insert new order row
    const { data, error: insertErr } = await supabase
      .from("orders")
      .insert({
        user_email: email,
        fuel,
        litres: litres ?? null,
        unit_price_pence: unitPricePence ?? null,
        total_pence: totalPence ?? null,
        status: "paid",
        stripe_session_id: sessionId,
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("Supabase insert error:", insertErr);
      throw insertErr;
    }

    return res.status(200).json({ orderId: data.id });
  } catch (err: any) {
    console.error("store-order-from-session error:", err);
    const msg =
      err?.message ||
      err?.error_description ||
      "Failed to create order";
    return res.status(500).json({ error: msg });
  }
}
