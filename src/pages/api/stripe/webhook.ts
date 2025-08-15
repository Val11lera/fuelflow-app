import { buffer } from 'micro';
import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2024-06-20',
});

// Server-only admin client
const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

// simple UUID validator so we don't send bad values to a uuid column
const isUUID = (v?: string | null) =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  // 1) verify signature
  const buf = await buffer(req);
  const sig = req.headers['stripe-signature'] as string | undefined;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig!, secret!);
  } catch (err: any) {
    console.error('Webhook verify error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // 2) idempotency: skip if we already processed this event
  const { data: already } = await supabase
    .from('webhook_events')
    .select('id')
    .eq('id', event.id)
    .maybeSingle();

  if (already) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  // store raw event early so Stripe retries are safe
  const { error: rawErr } = await supabase.from('webhook_events').insert({
    id: event.id,
    type: event.type,
    raw: event as any,
  });
  if (rawErr) {
    console.error('Failed to store raw event:', rawErr);
    // not fatal – continue
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;

        const orderId = (pi.metadata?.order_id as string) || null;

        const email =
          pi.receipt_email ??
          (pi.charges as any)?.data?.[0]?.billing_details?.email ??
          null;

        const amount = Number(pi.amount_received ?? pi.amount ?? 0);
        const currency = pi.currency ?? 'gbp';
        const status = pi.status ?? 'unknown';

        const { error: upsertPayErr } = await supabase
          .from('payments')
          .upsert(
            {
              pi_id: pi.id,
              amount,
              currency,
              status,
              email,
              order_id: isUUID(orderId) ? orderId : null,
            },
            { onConflict: 'pi_id' }
          );

        if (upsertPayErr) {
          console.error('Supabase upsert error (payments):', upsertPayErr);
          throw upsertPayErr;
        }

        if (isUUID(orderId)) {
          const { error: updOrderErr } = await supabase
            .from('orders')
            .update({
              status: 'paid',
              paid_at: new Date().toISOString(),
              stripe_pi_id: pi.id,
            })
            .eq('id', orderId);

          if (updOrderErr) {
            console.error('Supabase update error (orders):', updOrderErr);
            throw updOrderErr;
          }
        }

        console.log('💰 payment_intent.succeeded processed', pi.id, orderId);
        break;
      }

      case 'checkout.session.completed': {
        const cs = event.data.object as Stripe.Checkout.Session;
        const orderId = (cs.metadata?.order_id as string) || null;

        if (cs.payment_intent) {
          const pi = await stripe.paymentIntents.retrieve(cs.payment_intent as string);

          const email =
            pi.receipt_email ??
            (pi.charges as any)?.data?.[0]?.billing_details?.email ??
            cs.customer_details?.email ??
            null;

          const amount = Number(pi.amount_received ?? pi.amount ?? 0);
          const currency = pi.currency ?? 'gbp';
          const status = pi.status ?? 'unknown';

          const { error: upsertPayErr } = await supabase
            .from('payments')
            .upsert(
              {
                pi_id: pi.id,
                amount,
                currency,
                status,
                email,
                order_id: isUUID(orderId) ? orderId : null,
              },
              { onConflict: 'pi_id' }
            );

          if (upsertPayErr) {
            console.error('Supabase upsert error (payments):', upsertPayErr);
            throw upsertPayErr;
          }

          if (isUUID(orderId)) {
            const { error: updOrderErr } = await supabase
              .from('orders')
              .update({
                status: 'paid',
                paid_at: new Date().toISOString(),
                stripe_pi_id: pi.id,
              })
              .eq('id', orderId);

            if (updOrderErr) {
              console.error('Supabase update error (orders):', updOrderErr);
              throw updOrderErr;
            }
          }
        }

        console.log('✅ checkout.session.completed processed', cs.id, orderId);
        break;
      }

      default:
        console.log('Unhandled event type:', event.type);
    }

    return res.status(200).json({ received: true });
  } catch (err: any) {
    // letting Stripe retry by returning a 500
    console.error('Processing error:', err);
    return res.status(500).send('Webhook processing error');
  }
}


