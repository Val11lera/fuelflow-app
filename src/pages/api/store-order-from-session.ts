// src/pages/api/store-order-from-session.ts
// Creates or returns an order row using a Stripe Checkout session id

import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

// Supabase service client (server-side)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
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
    const { sessionId } = req.body as { sessionId?: string };

    if (!sessionId) {
      return res.status(400).json({ error: "Missing sessionId" });
    }

    // 1) If we already created an order for this session, just return it
    {
      const { data: existing, error } = await supabase
        .from("orders")
        .select("id")
        .eq("stripe_session_id", sessionId)
        .maybeSingle();

      if (error) {
        console.error("Error checking existing order:", error);
      } else if (existing?.id) {
        return res.status(200).json({ orderId: existing.id });
      }
    }

    // 2) Fetch session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (session.payment_status !== "paid") {
      return res.status(400).json({ error: "Payment not completed" });
    }

    const m = session.metadata || {};
    const email =
      (m.app_user_email as string) ||
      (session.customer_email as string) ||
      "";
    const fuel = (m.fuel as string) || "diesel";
    const litres = Number(m.litres || 0);
    const unit_price_pence = Number(m.unit_price_pence || 0);
    const total_pence =
      Number(m.total_pence || 0) ||
      (typeof session.amount_total === "number"
        ? session.amount_total
        : 0);

    if (!email || !litres || !total_pence) {
      console.warn("Missing metadata on session:", sessionId, m);
    }

    // 3) Insert the order row
    const { data: inserted, error: insertErr } = await supabase
      .from("orders")
      .insert({
        user_email: email.toLowerCase(),
        product: fuel, // if your column is called "product", change this key to product: fuel
        litres,
        unit_price_pence,
        total_pence,
        status: "paid",
        stripe_session_id: sessionId,
      })
      .select("id")
      .maybeSingle();

    if (insertErr || !inserted?.id) {
      console.error("Failed to insert order:", insertErr);
      return res.status(500).json({ error: "Failed to create order" });
    }

    return res.status(200).json({ orderId: inserted.id });
  } catch (err: any) {
    console.error("store-order-from-session error:", err);
    return res
      .status(500)
      .json({ error: err?.message || "Unexpected error" });
  }
}
