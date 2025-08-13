// src/pages/api/stripe/webhook.ts
import { buffer } from 'micro';
import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const config = {
  api: { bodyParser: false }, // Stripe needs the raw body
};

// --- Stripe (server-side only) ---
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2024-06-20',
});

// --- Supabase *admin* client (server-only keys) ---
const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

// Small helper to pick a sensible amount field
const getAmount = (pi: Stripe.PaymentIntent) =>
  (pi.amount_received ?? pi.amount) ?? 0;

// Fetch a PaymentIntent again with the charge expanded,
// so we can safely read billing details without TS errors.
async function retrievePIWithCharge(piId: string) {
  const pi = await stripe.paymentIntents.retrieve(piId, {
    expand: ['latest_charge'],
  });
  const charge = (pi.latest_charge as Stripe.Charge) ?? null;
  const chargeEmail = charge?.billing_details?.email ?? null;

  const email =
    pi.receipt_email ||
    chargeEmail ||
    null;

  return { pi, email };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  const sig = req.headers['stripe-signature'] as string | undefined;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET as string;

  if (!sig || !webhookSecret) {
    console.error('Missing stripe-signature or STRIPE_WEBHOOK_SECRET');
    return res.status(400).send('Bad webhook signature');
  }

  let event: Stripe.Event;
  try {
    const buf = await buffer(req);
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err: any) {
    console.error('🔴 Webhook verify error:', err?.message || err);
    return res.status(400).send(`Webhook Error: ${err?.message || 'verify failed'}`);
  }

  // --- Idempotency: skip if we already processed this event ---
  try {
    const { data: already } = await supabase
      .from('webhook_events')
      .select('id')
      .eq('id', event.id)
      .maybeSingle();

    if (already) {
      return res.status(200).json({ received: true, duplicate: true });
    }

    // Persist the raw event first (so retries are safe)
    await supabase.from('webhook_events').insert({
      id: event.id,
      type: event.type,
      raw: event as any,
      received_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('🔴 Failed writing webhook_events:', e);
    return res.status(500).send('DB error (webhook_events)');
  }

  try {
    switch (event.type) {
      /**
       * Direct webhooks on the PI. The object on the event is *not expanded*,
       * so we re-fetch it with latest_charge expanded for billing email.
       */
      case 'payment_intent.succeeded': {
        const piEvent = event.data.object as Stripe.PaymentIntent;

        const { pi, email } = await retrievePIWithCharge(piEvent.id);
        const orderId = (pi.metadata?.order_id as string) || null;

        const { error: upsertPayErr } = await supabase
          .from('payments')
          .upsert(
            {
              pi_id: pi.id,
              amount: getAmount(pi),
              currency: pi.currency,
              status: pi.status,
              email,
              order_id: orderId ?? null,
              processed_at: new Date().toISOString(),
            },
            { onConflict: 'pi_id' }
          );
        if (upsertPayErr) {
          console.error('🔴 upsert payments error:', upsertPayErr);
          return res.status(500).send('DB upsert error (payments)');
        }

        if (orderId) {
          const { error: updOrderErr } = await supabase
            .from('orders')
            .update({
              status: 'paid',
              paid_at: new Date().toISOString(),
              stripe_pi_id: pi.id,
            })
            .eq('id', orderId);
          if (updOrderErr) {
            console.error('🔴 update orders error:', updOrderErr);
            return res.status(500).send('DB update error (orders)');
          }
        }

        console.log('💰 payment_intent.succeeded', pi.id, { orderId, email });
        break;
      }

      /**
       * If you use Checkout, this event is very common. We pull the PI id from the
       * session and then do the same normalized write as above.
       */
      case 'checkout.session.completed': {
        const cs = event.data.object as Stripe.Checkout.Session;
        const orderId = (cs.metadata?.order_id as string) || null;

        if (cs.payment_intent) {
          const { pi, email } = await retrievePIWithCharge(cs.payment_intent as string);

          const { error: upsertPayErr } = await supabase
            .from('payments')
            .upsert(
              {
                pi_id: pi.id,
                amount: getAmount(pi),
                currency: pi.currency,
                status: pi.status,
                email: email ?? cs.customer_details?.email ?? null,
                order_id: orderId ?? null,
                processed_at: new Date().toISOString(),
              },
              { onConflict: 'pi_id' }
            );
          if (upsertPayErr) {
            console.error('🔴 upsert payments (CS) error:', upsertPayErr);
            return res.status(500).send('DB upsert error (payments/CS)');
          }

          if (orderId) {
            const { error: updOrderErr } = await supabase
              .from('orders')
              .update({
                status: 'paid',
                paid_at: new Date().toISOString(),
                stripe_pi_id: pi.id,
              })
              .eq('id', orderId);
            if (updOrderErr) {
              console.error('🔴 update orders (CS) error:', updOrderErr);
              return res.status(500).send('DB update error (orders/CS)');
            }
          }

          console.log('✅ checkout.session.completed', cs.id, { orderId, email });
        }
        break;
      }

      default:
        console.log('ℹ️ Unhandled event:', event.type);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('🔴 Webhook processing error:', err);
    // Let Stripe retry by returning a non-2xx
    return res.status(500).send('Webhook processing error');
  }
}

