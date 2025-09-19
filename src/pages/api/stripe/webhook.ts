// src/pages/api/stripe/webhook.ts
// src/pages/api/stripe/webhook.ts
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";

export const config = {
  api: { bodyParser: false }, // Stripe requires the raw body
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

function readRawBody(req: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Call your own invoice route on the same deployment
async function callInvoiceRoute(payload: any) {
  const base =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  if (!process.env.INVOICE_SECRET) {
    throw new Error("INVOICE_SECRET not set");
  }

  const resp = await fetch(`${base}/api/invoices/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-invoice-secret": process.env.INVOICE_SECRET,
    } as any,
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Invoice route error: ${resp.status} ${txt}`);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  const sig = req.headers["stripe-signature"] as string;
  const rawBody = await readRawBody(req);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET as string
    );
  } catch (err: any) {
    console.error("⚠️  Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      // Best event for Checkout: finalized + paid
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        // Get line items for details/amounts
        const li = await stripe.checkout.sessions.listLineItems(session.id, {
          limit: 100,
          expand: ["data.price.product"],
        });

        const items = li.data.map((row) => {
          const qty = row.quantity ?? 1;
          const unit = (row.price?.unit_amount ?? (row.amount_total && qty ? Math.round(row.amount_total / qty) : 0)) / 100;
          const name =
            row.description ||
            ((row.price?.product as Stripe.Product | undefined)?.name ?? "Item");

          return {
            description: name,
            quantity: qty,
            unitPrice: unit,
          };
        });

        const payload = {
          customer: {
            name: session.customer_details?.name || "Customer",
            email: (session.customer_details?.email || session.customer_email) as string,
            // address: session.customer_details?.address?.line1, // add if you want
          },
          items,
          currency: (session.currency || "gbp").toUpperCase(),
          // meta: { invoiceNumber: `INV-${Date.now()}` } // optional: can also let the route generate it
        };

        await callInvoiceRoute(payload);
        break;
      }

      // If you charge without Checkout, you may rely on payment_intent.succeeded
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;

        const payload = {
          customer: {
            name: (pi.shipping?.name || (pi.metadata as any)?.customer_name || "Customer"),
            email: (pi.receipt_email || (pi.metadata as any)?.customer_email) as string,
          },
          items: [
            {
              description: (pi.metadata as any)?.description || "Payment",
              quantity: 1,
              unitPrice: (pi.amount_received ?? pi.amount) / 100,
            },
          ],
          currency: (pi.currency || "gbp").toUpperCase(),
        };

        await callInvoiceRoute(payload);
        break;
      }

      default:
        // For all other events, do nothing
        break;
    }
  } catch (e: any) {
    console.error("Webhook handler error:", e);
    // Respond 200 so Stripe doesn't retry forever, but log the error
    return res.status(200).json({ received: true, error: e.message });
  }

  return res.status(200).json({ received: true });
}

