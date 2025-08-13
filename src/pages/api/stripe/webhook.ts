import { buffer } from 'micro';
import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';

export const config = {
  api: { bodyParser: false }, // Raw body required for signature verification
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2024-06-20', // supported version
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  const buf = await buffer(req);
  const sig = req.headers['stripe-signature'] as string | undefined;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  try {
    const event = stripe.webhooks.constructEvent(buf, sig!, webhookSecret!);

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        console.log('💰 PI succeeded:', pi.id, pi.amount);
        break;
      }
      case 'checkout.session.completed': {
        const cs = event.data.object as Stripe.Checkout.Session;
        console.log('✅ Checkout completed:', cs.id);
        break;
      }
      default:
        console.log('Unhandled event:', event.type);
    }

    return res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('Webhook verify error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
}


