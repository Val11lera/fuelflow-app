// src/pages/api/stripe/webhook.ts
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const config = {
  api: { bodyParser: false }, // Stripe needs the raw body
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

function readRawBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  const sig = req.headers["stripe-signature"] as string | undefined;
  if (!sig) return res.status(400).send("Missing stripe-signature header");

  let event: Stripe.Event;

  try {
    const raw = await readRawBody(req);
    event = stripe.webhooks.constructEvent(
      raw,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET as string
    );
    // optional: store raw webhook for audit
    try {
      await supabase.from("webhook_events").insert({
        id: event.id,
        type: event.type,
        raw: event as any,
      });
    } catch {}
  } catch (err: any) {
    console.error("Webhook signature verification failed.", err?.message);
    return res.status(400).send(`Webhook Error: ${err?.message ?? "bad signature"}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const pi = session.payment_intent as string | null;
        const orderId = (session.metadata?.order_id as string) || null;

        await supabase
          .from("payments")
          .insert({
            cs_id: session.id,
            pi_id: pi || `pi_${session.id}`, // fallback to keep unique
            amount: session.amount_total ?? 0,
            currency: session.currency || "gbp",
            status: session.payment_status || "complete",
            email: session.customer_details?.email ?? session.customer_email ?? null,
            order_id: orderId,
            meta: { session },
          })
          .select("id");

        if (pi && orderId) {
          await supabase
            .from("orders")
            .update({ status: "paid", paid_at: new Date().toISOString(), stripe_pi_id: pi })
            .eq("id", orderId);
        }
        break;
      }

      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const orderId = (pi.metadata?.order_id as string) || null;

        await supabase
          .from("payments")
          .upsert(
            {
              pi_id: pi.id,
              amount: pi.amount_received ?? pi.amount ?? 0,
              currency: pi.currency || "gbp",
              status: pi.status,
              email: (pi.receipt_email as string) || null,
              order_id: orderId,
              meta: { payment_intent: pi },
            },
            { onConflict: "pi_id" }
          )
          .select("id");

        if (orderId) {
          await supabase
            .from("orders")
            .update({ status: "paid", paid_at: new Date().toISOString(), stripe_pi_id: pi.id })
            .eq("id", orderId);
        }
        break;
      }

      default:
        // no-op for other events
        break;
    }

    return res.status(200).json({ received: true });
  } catch (e: any) {
    console.error("Webhook handling error:", e);
    return res.status(500).json({ error: e?.message || "webhook_failed" });
  }
}


