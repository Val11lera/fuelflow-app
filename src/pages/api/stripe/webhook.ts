import { buffer } from "micro";
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

// service role (bypasses RLS)
const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  const sig = req.headers["stripe-signature"] as string | undefined;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) {
    return res.status(400).send("Missing Stripe signature or webhook secret");
  }

  let event: Stripe.Event;
  try {
    const buf = await buffer(req);
    event = stripe.webhooks.constructEvent(buf, sig, secret);
  } catch (err: any) {
    console.error("Webhook verify error:", err?.message || err);
    return res.status(400).send(`Webhook Error: ${err?.message ?? "invalid"}`);
  }

  // idempotency store
  try {
    const { data: exists } = await supabase.from("webhook_events").select("id").eq("id", event.id).maybeSingle();
    if (exists) return res.status(200).json({ received: true, duplicate: true });

    const { error: insEvtErr } = await supabase.from("webhook_events").insert({
      id: event.id,
      type: event.type,
      raw: event as any,
    });
    if (insEvtErr) {
      console.error("DB insert error (webhook_events):", insEvtErr);
      return res.status(500).send("DB error (webhook_events)");
    }
  } catch (e) {
    console.error("Idempotency check error:", e);
    return res.status(500).send("Idempotency error");
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const cs = event.data.object as Stripe.Checkout.Session;
        const piId = cs.payment_intent as string | undefined;
        let orderId = (cs.metadata?.order_id as string) || undefined;

        // Expand PaymentIntent for reliable email + amount
        const pi = piId
          ? await stripe.paymentIntents.retrieve(piId, { expand: ["latest_charge", "charges.data.billing_details"] })
          : null;

        const email =
          pi?.receipt_email ??
          (pi as any)?.charges?.data?.[0]?.billing_details?.email ??
          cs.customer_details?.email ??
          null;

        const amountPence =
          (typeof pi?.amount_received === "number" && pi?.amount_received) ||
          (typeof pi?.amount === "number" && pi?.amount) ||
          (typeof cs.amount_total === "number" && cs.amount_total) ||
          0;

        // upsert payment
        await supabase
          .from("payments")
          .upsert(
            {
              pi_id: pi?.id || "unknown",
              amount: amountPence,
              currency: (pi?.currency || cs.currency || "gbp") as string,
              status: (pi?.status || "succeeded") as string,
              email,
              order_id: orderId || null,
              cs_id: cs.id,
              meta: {
                checkout_session: { id: cs.id, metadata: cs.metadata || {} },
                payment_intent: { id: pi?.id || null, metadata: pi?.metadata || {} },
              },
            },
            { onConflict: "pi_id" }
          );

        // mark order paid
        if (orderId) {
          await supabase
            .from("orders")
            .update({ status: "paid", paid_at: new Date().toISOString(), stripe_pi_id: pi?.id || null })
            .eq("id", orderId);
        }

        break;
      }

      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const orderId = (pi.metadata?.order_id as string) || null;
        const email =
          pi.receipt_email || (pi as any)?.charges?.data?.[0]?.billing_details?.email || null;

        const amountPence =
          (typeof pi.amount_received === "number" && pi.amount_received) ||
          (typeof pi.amount === "number" && pi.amount) ||
          0;

        await supabase
          .from("payments")
          .upsert(
            {
              pi_id: pi.id,
              amount: amountPence,
              currency: pi.currency,
              status: pi.status,
              email,
              order_id: orderId,
              cs_id: null,
              meta: { payment_intent: { id: pi.id, metadata: pi.metadata || {} } },
            },
            { onConflict: "pi_id" }
          );

        if (orderId) {
          await supabase
            .from("orders")
            .update({ status: "paid", paid_at: new Date().toISOString(), stripe_pi_id: pi.id })
            .eq("id", orderId);
        }
        break;
      }

      default:
        // ignore others
        break;
    }

    return res.status(200).json({ received: true });
  } catch (err: any) {
    console.error("Processing error:", err);
    return res.status(500).send("Webhook processing error");
  }
}


