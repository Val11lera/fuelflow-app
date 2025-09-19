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

function readRawBody(req: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/** Absolute base URL (works locally & in prod) */
function getBaseUrl(req: NextApiRequest) {
  const env = process.env.SITE_URL && process.env.SITE_URL.trim();
  if (env) return env.replace(/\/+$/, "");
  const proto =
    (req.headers["x-forwarded-proto"] as string) ||
    (req.headers["x-forwarded-protocol"] as string) ||
    "http";
  const host =
    (req.headers["x-forwarded-host"] as string) ||
    (req.headers["host"] as string) ||
    "localhost:3000";
  return `${proto}://${host}`;
}

/** Server-side Supabase (service role) for writes */
function sb() {
  return createClient(
    process.env.SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string
  );
}

/** Call our own invoice route */
async function callInvoiceRoute(baseUrl: string, payload: any) {
  const secret = process.env.INVOICE_SECRET;
  if (!secret) throw new Error("INVOICE_SECRET not set");

  const r = await fetch(`${baseUrl}/api/invoices/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-invoice-secret": secret,
    },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Invoice route error: ${r.status} ${txt}`);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  const rawBody = await readRawBody(req);
  const sig = req.headers["stripe-signature"] as string;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET as string
    );
  } catch (err: any) {
    console.error("⚠️  Stripe signature verification failed:", err?.message);
    return res.status(400).send(`Webhook Error: ${err?.message}`);
  }

  const baseUrl = getBaseUrl(req);
  const supabase = sb();

  try {
    switch (event.type) {
      /**
       * PRIMARY PATH: Stripe Checkout finishes and is paid
       */
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        // order_id is set in /api/stripe/checkout/create.ts metadata
        const orderId =
          (session.metadata && (session.metadata as any).order_id) ||
          (typeof session.payment_intent === "string"
            ? (await stripe.paymentIntents.retrieve(session.payment_intent)).metadata
                ?.order_id
            : undefined);

        // Pull line items for invoice lines
        const itemsResp = await stripe.checkout.sessions.listLineItems(session.id, {
          limit: 100,
          expand: ["data.price.product"],
        });

        const items = itemsResp.data.map((row) => {
          const qty = row.quantity ?? 1;
          const unit =
            (row.price?.unit_amount ??
              (row.amount_total && qty ? Math.round(row.amount_total / qty) : 0)) / 100;
          const name =
            row.description ||
            ((row.price?.product as Stripe.Product | undefined)?.name ?? "Item");

          return { description: name, quantity: qty, unitPrice: unit };
        });

        // Update order → paid
        if (orderId) {
          const { error } = await supabase
            .from("orders")
            .update({
              status: "paid",
              paid_at: new Date().toISOString(),
              stripe_session_id: session.id,
              stripe_payment_intent_id:
                typeof session.payment_intent === "string"
                  ? session.payment_intent
                  : session.payment_intent?.id ?? null,
            })
            .eq("id", orderId);

          if (error) throw new Error(`Supabase update failed: ${error.message}`);
        } else {
          console.warn("No order_id on session metadata — order status not updated.");
        }

        // Generate + email invoice
        await callInvoiceRoute(baseUrl, {
          customer: {
            name: session.customer_details?.name || "Customer",
            email:
              (session.customer_details?.email ||
                session.customer_email ||
                (session.metadata && (session.metadata as any).email)) ??
              "",
          },
          items,
          currency: (session.currency || "gbp").toUpperCase(),
        });

        break;
      }

      /**
       * BACKUP PATH: If you charge via PaymentIntents directly
       */
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;

        const orderId =
          (pi.metadata && (pi.metadata as any).order_id) ||
          (typeof pi.latest_charge === "string"
            ? (await stripe.charges.retrieve(pi.latest_charge)).metadata?.order_id
            : undefined);

        if (orderId) {
          const { error } = await supabase
            .from("orders")
            .update({
              status: "paid",
              paid_at: new Date().toISOString(),
              stripe_payment_intent_id: pi.id,
            })
            .eq("id", orderId);

          if (error) throw new Error(`Supabase update failed: ${error.message}`);
        }

        await callInvoiceRoute(baseUrl, {
          customer: {
            name: pi.shipping?.name || (pi.metadata as any)?.customer_name || "Customer",
            email: (pi.receipt_email || (pi.metadata as any)?.customer_email) ?? "",
          },
          items: [
            {
              description: (pi.metadata as any)?.description || "Payment",
              quantity: 1,
              unitPrice: (pi.amount_received ?? pi.amount) / 100,
            },
          ],
          currency: (pi.currency || "gbp").toUpperCase(),
        });

        break;
      }

      default:
        // ignore others
        break;
    }
  } catch (e: any) {
    // Return 200 so Stripe doesn't retry forever, but log for us.
    console.error("Webhook handler error:", e);
    return res.status(200).json({ received: true, error: e?.message });
  }

  return res.status(200).json({ received: true });
}

