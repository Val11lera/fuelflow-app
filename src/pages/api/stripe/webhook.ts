// src/pages/api/stripe/webhook.ts
// src/pages/api/stripe/webhook.ts
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const config = { api: { bodyParser: false } };

/* ---------- Secrets (server-side only!) ---------- */
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

function sbAdmin() {
  return createClient(
    process.env.SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } }
  );
}

/* ---------- Small utils ---------- */
function readRawBody(req: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function getBaseUrl(req: NextApiRequest) {
  const env = process.env.SITE_URL && process.env.SITE_URL.trim();
  if (env) return env.replace(/\/+$/, "");
  const proto =
    (req.headers["x-forwarded-proto"] as string) ||
    (req.headers["x-forwarded-protocol"] as string) ||
    "https";
  const host =
    (req.headers["x-forwarded-host"] as string) ||
    (req.headers["host"] as string) ||
    "localhost:3000";
  return `${proto}://${host}`;
}

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

/* ---------- Optional: tiny log table you already had ---------- */
async function logRow(row: {
  event_type: string;
  order_id?: string | null;
  status?: string | null;
  error?: string | null;
}) {
  try {
    await sbAdmin()
      .from("webhook_logs")
      .insert({
        event_type: row.event_type,
        order_id: row.order_id ?? null,
        status: row.status ?? null,
        error: row.error ?? null,
      });
  } catch {
    /* ignore */
  }
}

/* ---------- NEW: safe “save event” without .onConflict chain ---------- */
async function saveWebhookEvent(e: Stripe.Event) {
  try {
    // Works on all supabase-js v2 versions
    await sbAdmin()
      .from("webhook_events")
      .upsert(
        { id: e.id, type: e.type, raw: e as any },
        { onConflict: "id" }
      );
  } catch {
    /* ignore */
  }
}

/* ---------- Payments upsert helper ---------- */
async function upsertPaymentFromPI(
  pi: Stripe.PaymentIntent,
  orderId: string | undefined,
  csId?: string | null
) {
  const supabase = sbAdmin();
  const amount = (pi.amount_received ?? pi.amount) ?? 0; // pence (integer)
  const email =
    pi.receipt_email ||
    (pi.metadata as any)?.customer_email ||
    (pi.latest_charge as any)?.billing_details?.email ||
    null;

  await supabase
    .from("payments")
    .upsert(
      {
        pi_id: pi.id,
        amount,
        currency: (pi.currency || "gbp").toUpperCase(),
        status: (pi.status || "succeeded"),
        email,
        order_id: orderId ?? null,
        cs_id: csId ?? null,
        meta: pi.metadata ? (pi.metadata as any) : null,
      },
      { onConflict: "pi_id" }
    );
}

/* ---------- Main handler ---------- */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  // Verify Stripe signature
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
    await logRow({ event_type: "bad_signature", error: err?.message });
    return res.status(400).send(`Webhook Error: ${err?.message}`);
  }

  // Save the event idempotently (no duplicates on retries)
  await saveWebhookEvent(event);

  const baseUrl = getBaseUrl(req);
  const supabase = sbAdmin();

  try {
    switch (event.type) {
      /* ---------------- Checkout completed ---------------- */
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        // Derive orderId from session metadata, or from the PI if needed
        let orderId: string | undefined =
          (session.metadata && (session.metadata as any).order_id) || undefined;

        let pi: Stripe.PaymentIntent | null = null;
        if (typeof session.payment_intent === "string") {
          pi = await stripe.paymentIntents.retrieve(session.payment_intent);
          orderId = orderId || (pi.metadata as any)?.order_id || undefined;
        } else if (session.payment_intent) {
          pi = session.payment_intent as Stripe.PaymentIntent;
          orderId = orderId || (pi.metadata as any)?.order_id || undefined;
        }

        await logRow({
          event_type: "checkout.session.completed/received",
          order_id: orderId ?? null,
        });

        // Mark order paid (if we have it)
        if (orderId) {
          const { error } = await supabase
            .from("orders")
            .update({
              status: "paid",
              paid_at: new Date().toISOString(),
              stripe_session_id: session.id,
              stripe_payment_intent_id: pi?.id ?? null,
            })
            .eq("id", orderId);
          if (error) throw new Error(`Supabase update failed: ${error.message}`);

          await logRow({
            event_type: "order_updated_to_paid",
            order_id: orderId,
            status: "paid",
          });
        } else {
          await logRow({
            event_type: "missing_order_id_on_session",
            status: "pending",
          });
        }

        // Upsert payment row (reconciliation)
        if (pi) {
          await upsertPaymentFromPI(pi, orderId, session.id);
        }

        // Build invoice items from Checkout line items
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

        // Send invoice email
        await callInvoiceRoute(baseUrl, {
          customer: {
            name: session.customer_details?.name || "Customer",
            email:
              (session.customer_details?.email ||
                session.customer_email ||
                (session.metadata && (session.metadata as any).email)) ?? "",
          },
          items,
          currency: (session.currency || "gbp").toUpperCase(),
        });

        await logRow({
          event_type: "invoice_sent",
          order_id: orderId ?? null,
          status: "paid",
        });
        break;
      }

      /* ---------------- Payment Intent succeeded ---------------- */
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const orderId =
          (pi.metadata && (pi.metadata as any).order_id) || undefined;

        await logRow({
          event_type: "payment_intent.succeeded/received",
          order_id: orderId ?? null,
        });

        // Mark order paid
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

          await logRow({
            event_type: "order_updated_to_paid",
            order_id: orderId,
            status: "paid",
          });
        }

        // Upsert payment row
        await upsertPaymentFromPI(pi, orderId, null);

        // Send invoice email (single-line item)
        await callInvoiceRoute(baseUrl, {
          customer: {
            name: pi.shipping?.name || (pi.metadata as any)?.customer_name || "Customer",
            email: (pi.receipt_email || (pi.metadata as any)?.customer_email) ?? "",
          },
          items: [
            {
              description: (pi.metadata as any)?.description || "Payment",
              quantity: 1,
              unitPrice: ((pi.amount_received ?? pi.amount) || 0) / 100,
            },
          ],
          currency: (pi.currency || "gbp").toUpperCase(),
        });

        await logRow({
          event_type: "invoice_sent",
          order_id: orderId ?? null,
          status: "paid",
        });
        break;
      }

      default: {
        // Ignore other event types
        break;
      }
    }
  } catch (e: any) {
    console.error("Webhook handler error:", e);
    await logRow({ event_type: "handler_error", error: String(e?.message || e) });
    // Still 200 so Stripe does not retry forever (since we saved the event already)
    return res.status(200).json({ received: true, error: e?.message });
  }

  return res.status(200).json({ received: true });
}


