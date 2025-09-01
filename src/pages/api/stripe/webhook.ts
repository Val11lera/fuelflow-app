import { buffer } from "micro";
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

// ---------- helpers ----------
function safeEmailFromPI(
  pi: Stripe.PaymentIntent,
  extraEmail?: string | null
): string | null {
  const charges =
    (pi as any)?.charges as
      | { data?: Array<{ billing_details?: { email?: string } }> }
      | undefined;

  return (
    pi.receipt_email ??
    charges?.data?.[0]?.billing_details?.email ??
    extraEmail ??
    null
  );
}

function safeAmountFromPI(pi: Stripe.PaymentIntent): number {
  if (typeof pi.amount_received === "number") return pi.amount_received;
  if (typeof pi.amount === "number") return pi.amount;
  return 0;
}

function buildMetaFromSession(
  cs: Stripe.Checkout.Session | null,
  pi: Stripe.PaymentIntent | null,
  email: string | null
) {
  return {
    source: cs ? "checkout.session.completed" : "payment_intent.succeeded",
    checkout_session: cs
      ? {
          id: cs.id,
          customer_email: cs.customer_details?.email ?? null,
          customer_name: cs.customer_details?.name ?? null,
          customer_address: cs.customer_details?.address ?? null,
          metadata: cs.metadata ?? {},
          amount_total: cs.amount_total ?? null,
          currency: cs.currency ?? null,
        }
      : null,
    payment_intent: pi
      ? {
          id: pi.id,
          amount: safeAmountFromPI(pi),
          currency: pi.currency,
          status: pi.status,
          metadata: pi.metadata ?? {},
          latest_charge:
            (pi as any)?.latest_charge ??
            ((pi as any)?.charges?.data?.[0]?.id ?? null),
        }
      : null,
    resolved_email: email,
    order_hint: {
      order_id:
        (cs?.metadata?.order_id as string | undefined) ||
        (pi?.metadata?.order_id as string | undefined) ||
        null,
      fuel:
        (cs?.metadata?.fuel as string | undefined) ||
        (pi?.metadata?.fuel as string | undefined) ||
        null,
      litres:
        (cs?.metadata?.litres as string | undefined) ||
        (pi?.metadata?.litres as string | undefined) ||
        null,
      unit_price:
        (cs?.metadata?.unit_price as string | undefined) ||
        (pi?.metadata?.unit_price as string | undefined) ||
        null,
      total:
        (cs?.metadata?.total as string | undefined) ||
        (pi?.metadata?.total as string | undefined) ||
        null,
      delivery_date:
        (cs?.metadata?.delivery_date as string | undefined) ||
        (pi?.metadata?.delivery_date as string | undefined) ||
        null,
      full_name:
        (cs?.metadata?.full_name as string | undefined) ||
        (pi?.metadata?.full_name as string | undefined) ||
        null,
      address_line1:
        (cs?.metadata?.address_line1 as string | undefined) ||
        (pi?.metadata?.address_line1 as string | undefined) ||
        null,
      address_line2:
        (cs?.metadata?.address_line2 as string | undefined) ||
        (pi?.metadata?.address_line2 as string | undefined) ||
        null,
      city:
        (cs?.metadata?.city as string | undefined) ||
        (pi?.metadata?.city as string | undefined) ||
        null,
      postcode:
        (cs?.metadata?.postcode as string | undefined) ||
        (pi?.metadata?.postcode as string | undefined) ||
        null,
    },
  };
}

// mark order paid in either "orders" or "public_orders"
async function markOrderPaid(orderId: string, piId: string) {
  let upd = await supabase
    .from("orders")
    .update({ status: "paid", paid_at: new Date().toISOString(), stripe_pi_id: piId })
    .eq("id", orderId);

  if (upd.error && /relation .* does not exist/i.test(upd.error.message)) {
    upd = await supabase
      .from("public_orders")
      .update({ status: "paid", paid_at: new Date().toISOString(), stripe_pi_id: piId })
      .eq("id", orderId);
  }
  return upd;
}

// ---------- handler ----------
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  // 1) Verify signature
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

  // 2) Idempotency guard: persist raw event first, then process
  try {
    const { data: existing } = await supabase
      .from("webhook_events")
      .select("id")
      .eq("id", event.id)
      .maybeSingle();

    if (existing) {
      return res.status(200).json({ received: true, duplicate: true });
    }

    const { error: insertEvtErr } = await supabase
      .from("webhook_events")
      .insert({ id: event.id, type: event.type, raw: event as any });

    if (insertEvtErr) {
      console.error("DB insert error (webhook_events):", insertEvtErr);
      return res.status(500).send("DB error (webhook_events)");
    }
  } catch (e) {
    console.error("Idempotency check error:", e);
    return res.status(500).send("Idempotency error");
  }

  // 3) Process
  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const piBasic = event.data.object as Stripe.PaymentIntent;
        const pi = await stripe.paymentIntents.retrieve(piBasic.id, {
          expand: ["latest_charge", "charges.data.billing_details"],
        });

        const orderId = (pi.metadata?.order_id as string) || null;
        const email = safeEmailFromPI(pi, null);
        const amount = safeAmountFromPI(pi);
        const meta = buildMetaFromSession(null, pi, email);

        const { error: upsertPayErr } = await supabase.from("payments").upsert(
          {
            pi_id: pi.id,
            amount,
            currency: pi.currency,
            status: pi.status,
            email,
            order_id: orderId,
            cs_id: null,
            meta,
          },
          { onConflict: "pi_id" }
        );
        if (upsertPayErr) {
          console.error("DB upsert error (payments):", upsertPayErr);
          return res.status(500).send("DB upsert error (payments)");
        }

        if (orderId) {
          const { error: updOrderErr } = await markOrderPaid(orderId, pi.id);
          if (updOrderErr) {
            console.error("DB update error (orders):", updOrderErr);
            return res.status(500).send("DB update error (orders)");
          }
        }
        break;
      }

      case "checkout.session.completed": {
        const cs = event.data.object as Stripe.Checkout.Session;
        if (!cs.payment_intent) break;

        const pi = await stripe.paymentIntents.retrieve(
          cs.payment_intent as string,
          { expand: ["latest_charge", "charges.data.billing_details"] }
        );

        const orderId =
          (cs.metadata?.order_id as string) ||
          (pi.metadata?.order_id as string) ||
          null;

        const email = safeEmailFromPI(pi, cs.customer_details?.email ?? null);
        const amount = safeAmountFromPI(pi);
        const meta = buildMetaFromSession(cs, pi, email);

        const { error: upsertPayErr } = await supabase.from("payments").upsert(
          {
            pi_id: pi.id,
            amount,
            currency: pi.currency,
            status: pi.status,
            email,
            order_id: orderId,
            cs_id: cs.id,
            meta,
          },
          { onConflict: "pi_id" }
        );
        if (upsertPayErr) {
          console.error("DB upsert error (payments):", upsertPayErr);
          return res.status(500).send("DB upsert error (payments)");
        }

        if (orderId) {
          const { error: updOrderErr } = await markOrderPaid(orderId, pi.id);
          if (updOrderErr) {
            console.error("DB update error (orders):", updOrderErr);
            return res.status(500).send("DB update error (orders)");
          }
        }
        break;
      }

      default:
        console.log("Unhandled event:", event.type);
    }

    return res.status(200).json({ received: true });
  } catch (err: any) {
    console.error("Processing error:", err);
    return res.status(500).send("Webhook processing error");
  }
}


