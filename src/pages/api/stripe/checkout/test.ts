import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2024-06-20',
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const origin = req.headers.origin || `https://${req.headers.host}`;

    // pick up optional order_id if you included it in the form
    const orderId = (req.body?.order_id as string) || null;

    // Create a simple one-off payment for £50.00 (5000 pence) GBP
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            product_data: { name: 'Test Payment' },
            unit_amount: 5000, // £50.00
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout/cancel`,
      metadata: orderId ? { order_id: orderId } : undefined,
    });

    // Redirect the browser to Stripe Checkout
    res.writeHead(303, { Location: session.url as string });
    res.end();
  } catch (err: any) {
    console.error('Create session error:', err);
    res.status(500).json({ error: err.message || 'create_session_failed' });
  }
}
