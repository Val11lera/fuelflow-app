// src/pages/api/checkout/create-session.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2024-06-20',
});

// server-only admin client
const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const { email, product, amount_pence, currency = 'gbp' } = req.body ?? {};

    if (!email || !product || !amount_pence) {
      return res.status(400).json({ error: 'email, product, amount_pence are required' });
    }

    // 1) create a pending order in Supabase
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        email,
        product,
        amount: amount_pence,      // store smallest unit (pence)
        status: 'ordered'
      })
      .select('id')
      .single();

    if (orderErr || !order) {
      console.error('order insert error', orderErr);
      return res.status(500).json({ error: 'Failed to create order' });
    }

    // 2) create Stripe Checkout Session with order_id in metadata
    const origin =
      (req.headers.origin as string) ||
      process.env.NEXT_PUBLIC_SITE_URL ||   // optional: set this in env if needed
      `https://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency,
            product_data: { name: product },
            unit_amount: Number(amount_pence),
          },
          quantity: 1,
        },
      ],
      metadata: {
        order_id: order.id, // <-- the link your webhook uses
      },
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout/cancel?order_id=${order.id}`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error('create-session error', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
