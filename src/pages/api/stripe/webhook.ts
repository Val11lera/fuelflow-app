// src/pages/api/stripe/webhook.ts
// src/pages/api/stripe/webhook.ts
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

// --- Supabase (service role) ---
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

// --- raw body reader (unchanged) ---
function readRawBody(req: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// --- call your invoice route (unchanged) ---
async function callInvoiceRoute(payload: any) {
  const base =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  if (!process.env.INVOICE_SECRET) throw new Error("INVOICE_SECRET not set");

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

// --- helpers ---
async function markOrderPaid(orderId: string, stripeIds: {
  sessionId?: string | null;
  paymentIntentId?: string | null;
}) {
  if (!supabase) return;

  // idempotency: if already paid, do nothing
  const { data: current } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .maybeSingle();

  if (current?.status === "paid") return;

  await supabase
    .from("orders")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      stripe_session_id: stripeIds.sessionId ?? null,
      stripe_payment_intent_id: stripeIds.paymentIntentId ?? null,
    })
    .eq("id", orderId);
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
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        // Prefer metadata for stable invoice lines
        const meta = session.metadata || {};
        const orderId = meta.order_id || null;

        // If we have an order id, mark it paid (idempotent)
        if (orderId) {
          await markOrderPaid(orderId, {
            sessionId: session.id,
            paymentIntentId: (session.payment_intent as string) || null,
          });
        }

        // Build invoice from metadata first; fallback to Stripe line items
        let items: Array<{ description: string; quantity: number; unitPrice: number }> = [];

        const litres = Number(meta.litres ?? 0);
        const unitPounds = Number(meta.unit_price_pence ?? 0) / 100;
        const fuel = (meta.fuel as string) || "Fuel";

        if (litres > 0 && unitPounds > 0) {
          items = [
            {
              description: `Fuel order (${fuel})`,
              quantity: litres,
              unitPrice: unitPounds,
            },
          ];
        } else {
          // Fallback: read Stripe line items
          const li = await stripe.checkout.sessions.listLineItems(session.id, {
            limit: 100,
            expand: ["data.price.product"],
          });
          items = li.data.map((row) => {
            const qty = row.quantity ?? 1;
            const unit =
              (row.price?.unit_amount ??
                (row.amount_total && qty ? Math.round(row.amount_total / qty) : 0)) / 100;
            const name =
              row.description ||
              ((row.price?.product as Stripe.Product | undefined)?.name ?? "Item");
            return { description: name, quantity: qty, unitPrice: unit };
          });
        }

        const payload = {
          customer: {
            name: session.customer_details?.name || (meta.full_name as string) || "Customer",
            email:
              (session.customer_details?.email as string) ||
              (session.customer_email as string) ||
              (meta.email as string),
          },
          items,
          currency: (session.currency || "gbp").toUpperCase(),
        };

        await callInvoiceRoute(payload);
        break;
      }

      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const meta = (pi.metadata || {}) as Record<string, string>;
        const orderId = meta.order_id || null;

        if (orderId) {
          await markOrderPaid(orderId, {
            sessionId: null,
            paymentIntentId: pi.id,
          });
        }

        // If you receive PI without Checkout, build a generic invoice
        const payload = {
          customer: {
            name: pi.shipping?.name || meta.customer_name || "Customer",
            email: (pi.receipt_email as string) || (meta.customer_email as string),
          },
          items: [
            {
              description: meta.description || "Payment",
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
        // ignore other events
        break;
    }
  } catch (e: any) {
    console.error("Webhook handler error:", e);
    // Return 200 so Stripe doesn't retry forever; error is logged
    return res.status(200).json({ received: true, error: e.message });
  }

  return res.status(200).json({ received: true });
}

