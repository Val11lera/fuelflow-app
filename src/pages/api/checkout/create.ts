// src/pages/api/stripe/checkout/create.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2024-06-20',
});

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

// Helper to format absolute URLs
function baseUrl(req: NextApiRequest) {
  const env = process.env.SITE_URL && process.env.SITE_URL.trim();
  if (env) return env.replace(/\/+$/, '');
  const proto =
    (req.headers['x-forwarded-proto'] as string) ||
    (req.headers['x-forwarded-protocol'] as string) ||
    'http';
  const host =
    (req.headers['x-forwarded-host'] as string) ||
    (req.headers['host'] as string) ||
    'localhost:3000';
  return `${proto}://${host}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const {
      userEmail,
      fuel,          // 'petrol' | 'diesel'
      litres,        // number
      deliveryDate,  // optional ISO date string
      name,
      address,
      postcode,
    } = req.body as {
      userEmail: string;
      fuel: 'petrol' | 'diesel';
      litres: number;
      deliveryDate?: string | null;
      name?: string;
      address?: string;
      postcode?: string;
    };

    if (!userEmail || !fuel || !litres || litres <= 0) {
      return res.status(400).json({ error: 'Missing or invalid order fields' });
    }

    // 1) Get current unit price for the selected fuel
    const { data: priceRow, error: priceErr } = await supabaseAdmin
      .from('latest_daily_prices')
      .select('fuel,total_price')
      .eq('fuel', fuel)
      .maybeSingle();

    if (priceErr || !priceRow) {
      return res.status(500).json({ error: 'Could not fetch unit price' });
    }

    const unitPrice = Number(priceRow.total_price); // £ per litre
    const total = unitPrice * litres;               // £
    const totalPence = Math.round(total * 100);     // pence (integer)

    // 2) Create a pending order row
    const { data: order, error: orderErr } = await supabaseAdmin
      .from('orders')
      .insert({
        user_email: userEmail,
        fuel,
        litres,
        delivery_date: deliveryDate ?? null,
        name: name ?? null,
        address: address ?? null,
        postcode: postcode ?? null,
        unit_price: unitPrice,
        total_amount_pence: totalPence,
        status: 'pending',
      })
      .select('id')
      .single();

    if (orderErr || !order) {
      return res.status(500).json({ error: 'Failed to create order' });
    }

    // 3) Create Stripe Checkout Session
    const success = `${baseUrl(req)}/checkout/success?orderId=${order.id}`;
    const cancel = `${baseUrl(req)}/checkout/cancel?orderId=${order.id}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: userEmail,
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            product_data: {
              name: `Fuel order - ${fuel}`,
              description: `${litres} litre(s) @ £${unitPrice.toFixed(2)}/L`,
            },
            unit_amount: totalPence,
          },
          quantity: 1,
        },
      ],
      success_url: success,
      cancel_url: cancel,
      metadata: {
        order_id: order.id,
        fuel,
        litres: String(litres),
        unit_price: String(unitPrice),
        email: userEmail,
      },
      payment_intent_data: {
        metadata: {
          order_id: order.id,
          fuel,
          litres: String(litres),
          unit_price: String(unitPrice),
          email: userEmail,
        },
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (e: any) {
    console.error('create checkout error', e);
    return res.status(500).json({ error: 'Checkout creation failed' });
  }
}
