import { buffer } from 'micro';
import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2024-06-20',
});

// Admin client (server-only)
const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

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

  // --- Idempotency guard: skip if we already processed this event ---
  const { data: already } = await supabase
    .from('webhook_events')
    .select('id')
    .eq('id', event.id)
    .maybeSingle();

  if (already) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  // store raw event first (so retries are safe)
  await supabase.from('webhook_events').insert({
    id: event.id,
    type: event.type,
    raw: event as any
  });

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;

        // Try to read metadata for linking to your order
        const orderId = (pi.metadata?.order_id as string) || null;

        // Try to pick an email if present
        const email =
          pi.receipt_email ||
          pi.charges?.data?.[0]?.billing_details?.email ||
          null;

        // Upsert payment record
        await supabase
          .from('payments')
          .upsert(
            {
              pi_id: pi.id,
              amount: (pi.amount_received ?? pi.amount) ?? 0,
              currency: pi.currency,
              status: pi.status,
              email,
              order_id: orderId ? orderId : null
            },
            { onConflict: 'pi_id' }
          );

        // If we have an order_id, mark order as paid
        if (orderId) {
          await supabase
            .from('orders')
            .update({
              status: 'paid',
              paid_at: new Date().toISOString(),
              stripe_pi_id: pi.id
            })
            .eq('id', orderId);
        }

        console.log('💰 payment_intent.succeeded processed', pi.id, orderId);
        break;
      }

      case 'checkout.session.completed': {
        const cs = event.data.object as Stripe.Checkout.Session;
        const orderId = (cs.metadata?.order_id as string) || null;

        // You can fetch the PI for more detail
        if (cs.payment_intent) {
          const pi = await stripe.paymentIntents.retrieve(cs.payment_intent as string);

          const email =
            pi.receipt_email ||
            pi.charges?.data?.[0]?.billing_details?.email ||
            cs.customer_details?.email ||
            null;

          await supabase.from('payments').upsert(
            {
              pi_id: pi.id,
              amount: (pi.amount_received ?? pi.amount) ?? 0,
              currency: pi.currency,
              status: pi.status,
              email,
              order_id: orderId ? orderId : null
            },
            { onConflict: 'pi_id' }
          );

          if (orderId) {
            await supabase
              .from('orders')
              .update({
                status: 'paid',
                paid_at: new Date().toISOString(),
                stripe_pi_id: pi.id
              })
              .eq('id', orderId);
          }
        }

        console.log('✅ checkout.session.completed processed', cs.id, orderId);
        break;
      }

      default:
        console.log('Unhandled event:', event.type);
    }

    return res.status(200).json({ received: true });
  } catch (err: any) {
    // If DB write fails, let Stripe retry by returning a non-2xx or 500
    console.error('Processing error:', err);
    return res.status(500).send('Webhook processing error');
  }
}


