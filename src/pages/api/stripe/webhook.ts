import { buffer } from 'micro';
import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const config = { api: { bodyParser: false } };

function must(name: string, v?: string) {
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

const stripe = new Stripe(must('STRIPE_SECRET_KEY', process.env.STRIPE_SECRET_KEY), {
  apiVersion: '2024-06-20',
});

const supabase = createClient(
  must('SUPABASE_URL', process.env.SUPABASE_URL),
  must('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY)
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).end('Method Not Allowed');
    }

    const buf = await buffer(req);
    const sig = req.headers['stripe-signature'] as string | undefined;
    const secret = must('STRIPE_WEBHOOK_SECRET', process.env.STRIPE_WEBHOOK_SECRET);

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(buf, sig!, secret);
    } catch (err: any) {
      console.error('❌ Webhook verify error:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Idempotency guard
    const { data: existing, error: existsErr } = await supabase
      .from('webhook_events')
      .select('id')
      .eq('id', event.id)
      .maybeSingle();

    if (existsErr) {
      console.error('❌ select webhook_events error:', existsErr);
      return res.status(500).send('DB select error (webhook_events)');
    }
    if (existing) {
      console.log('↩️ duplicate event, skipping', event.id);
      return res.status(200).json({ received: true, duplicate: true });
    }

    // Store raw event
    const { error: insertEvtErr } = await supabase.from('webhook_events').insert({
      id: event.id,
      type: event.type,
      raw: event as any,
    });
    if (insertEvtErr) {
      console.error('❌ insert webhook_events error:', insertEvtErr);
      return res.status(500).send('DB insert error (webhook_events)');
    }

    // Process types
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object as Stripe.PaymentIntent;

      const orderId = (pi.metadata?.order_id as string) || null;
      const email =
        pi.receipt_email ||
        pi.charges?.data?.[0]?.billing_details?.email ||
        null;

      const { error: upsertPayErr } = await supabase
        .from('payments')
        .upsert(
          {
            pi_id: pi.id,
            amount: (pi.amount_received ?? pi.amount) ?? 0,
            currency: pi.currency,
            status: pi.status,
            email,
            order_id: orderId ?? null,
          },
          { onConflict: 'pi_id' }
        );
      if (upsertPayErr) {
        console.error('❌ upsert payments error:', upsertPayErr);
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
          console.error('❌ update orders error:', updOrderErr);
          return res.status(500).send('DB update error (orders)');
        }
      }

      console.log('💰 payment_intent.succeeded', pi.id, { orderId, email });
    } else if (event.type === 'checkout.session.completed') {
      const cs = event.data.object as Stripe.Checkout.Session;
      const orderId = (cs.metadata?.order_id as string) || null;

      if (cs.payment_intent) {
        const pi = await stripe.paymentIntents.retrieve(cs.payment_intent as string);
        const email =
          pi.receipt_email ||
          pi.charges?.data?.[0]?.billing_details?.email ||
          cs.customer_details?.email ||
          null;

        const { error: upsertPayErr } = await supabase
          .from('payments')
          .upsert(
            {
              pi_id: pi.id,
              amount: (pi.amount_received ?? pi.amount) ?? 0,
              currency: pi.currency,
              status: pi.status,
              email,
              order_id: orderId ?? null,
            },
            { onConflict: 'pi_id' }
          );
        if (upsertPayErr) {
          console.error('❌ upsert payments (CS) error:', upsertPayErr);
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
            console.error('❌ update orders (CS) error:', updOrderErr);
            return res.status(500).send('DB update error (orders/CS)');
          }
        }
      }

      console.log('✅ checkout.session.completed', cs.id, { orderId: cs.metadata?.order_id });
    } else {
      console.log('ℹ️ Unhandled event type:', event.type);
    }

    return res.status(200).json({ received: true });
  } catch (fatal: any) {
    console.error('💥 Fatal webhook error:', fatal);
    return res.status(500).send('Fatal webhook error');
  }
}


