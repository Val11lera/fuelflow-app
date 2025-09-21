// src/pages/api/stripe/webhook.ts
// src/pages/api/stripe/webhook.ts
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const config = { api: { bodyParser: false } };

// ---------- Stripe + Supabase ----------
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

function sb() {
  return createClient(
    process.env.SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string
  );
}

// ---------- Helpers ----------
function readRawBody(req: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Always call the same host (where /api/invoices/create lives)
const CANONICAL_BASE =
  (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "") ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

// best-effort logging (ignore errors)
async function logRow(row: {
  event_type: string;
  order_id?: string | null;
  status?: string | null;
  error?: string | null;
}) {
  try {
    await sb().from("webhook_logs").insert({
      event_type: row.event_type,
      order_id: row.order_id ?? null,
      status: row.status ?? null,
      error: row.error ?? null,
    });
  } catch {}
}

// store the raw event (idempotent)
async function saveWebhookEvent(e: Stripe.Event) {
  try {
    await sb()
      .from("webhook_events")
      .upsert(
        [{ id: e.id, type: e.type, raw: e as any }],
        { onConflict: "id" }
      );
  } catch {}
}

async function callInvoiceRoute(payload: any) {
  if (!process.env.INVOICE_SECRET) {
    throw new Error("INVOICE_SECRET not set");
  }
  if (!CANONICAL_BASE) {
    throw new Error("SITE_URL / NEXT_PUBLIC_SITE_URL / VERCEL_URL not set");
  }

  const url = `${CANONICAL_BASE}/api/invoices/create`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-invoice-secret": process.env.INVOICE_SECRET,
    } as any,
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    // clear server log for diagnosis
    console.error(
      "[invoice] route call failed",
      JSON.stringify({ url, status: resp.status, body: txt?.slice(0, 500) })
    );
    throw new Error(`Invoice route error: ${resp.status}`);
  }
}

// optional reconciliation: keep minimal + safe
async function upsertPaymentRow(args: {
  pi_id?: string | null;
  amount?: number | null; // pence
  currency?: string | null;
  status?: string | null;
  email?: string | null;
  order_id?: string | null;
  cs_id?: string | null;
  meta?: any;
}) {
  try {
    const row = {
      pi_id: args.pi_id ?? undefined,
      amount: args.amount ?? undefined,
      currency: args.currency ?? undefined,
      status: args.status ?? undefined,
      email: args.email ?? undefined,
      order_id: args.order_id ?? undefined,
      cs_id: args.cs_id ?? undefined,
      meta: args.meta ?? undefined,
    };
    // upsert by pi_id when we have it, otherwise insert
    if (row.pi_id) {
      await sb().from("payments").upsert([row as any], { onConflict: "pi_id" });
    } else {
      await sb().from("payments").insert(row as any);
    }
  } catch {
    // don't block webhook on reconciliation
  }
}

// ---------- Handler ----------
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
    await logRow({ event_type: "bad_signature", error: err?.message });
    return res.status(400).send(`Webhook Error: ${err?.message}`);
  }

  // store raw event (idempotent)
  await saveWebhookEvent(event);

  try {
    switch (event.type) {
      // Checkout success
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        // Try to find order id the same way your Checkout create code sets metadata
        let orderId =
          (session.metadata as any)?.order_id ||
          (typeof session.payment_intent === "string"
            ? (await stripe.paymentIntents.retrieve(session.payment_intent)).metadata?.order_id
            : session.payment_intent?.metadata?.order_id);

        await logRow({
          event_type: "checkout.session.completed/received",
          order_id: orderId ?? null,
        });

        // Build invoice line items from Checkout
        const li = await stripe.checkout.sessions.listLineItems(session.id, {
          limit: 100,
          expand: ["data.price.product"],
        });

        const items = li.data.map((row) => {
          const qty = row.quantity ?? 1;
          const unit =
            (row.price?.unit_amount ??
              (row.amount_total && qty ? Math.round(row.amount_total / qty) : 0)) / 100;
          const name =
            row.description ||
            ((row.price?.product as Stripe.Product | undefined)?.name ?? "Item");
          return { description: name, quantity: qty, unitPrice: unit };
        });

        // Mark order paid (keep minimal to avoid schema mismatches)
        if (orderId) {
          const { error } = await sb()
            .from("orders")
            .update({
              status: "paid",
              paid_at: new Date().toISOString(),
            })
            .eq("id", orderId);
          if (error) throw new Error(`Supabase update failed: ${error.message}`);
          await logRow({ event_type: "order_updated_to_paid", order_id: orderId, status: "paid" });
        } else {
          await logRow({ event_type: "missing_order_id_on_session", status: "pending" });
        }

        // Reconciliation row (non-blocking)
        await upsertPaymentRow({
          pi_id:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id,
          amount:
            (typeof session.amount_total === "number" ? session.amount_total : null) ??
            null,
          currency: (session.currency || "gbp").toUpperCase(),
          status: session.payment_status || "paid",
          email:
            (session.customer_details?.email ||
              session.customer_email ||
              (session.metadata as any)?.email) ??
            null,
          order_id: orderId ?? null,
          cs_id: session.id,
          meta: session.metadata ?? null,
        });

        // Trigger invoice email
        await callInvoiceRoute({
          customer: {
            name: session.customer_details?.name || "Customer",
            email:
              (session.customer_details?.email ||
                session.customer_email ||
                (session.metadata as any)?.email) ?? "",
          },
          items,
          currency: (session.currency || "gbp").toUpperCase(),
        });

        await logRow({ event_type: "invoice_sent", order_id: orderId ?? null, status: "paid" });
        break;
      }

      // Direct PI payments path (if ever used)
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;

        const orderId =
          (pi.metadata as any)?.order_id ||
          (typeof pi.latest_charge === "string"
            ? (await stripe.charges.retrieve(pi.latest_charge)).metadata?.order_id
            : undefined);

        await logRow({ event_type: "payment_intent.succeeded/received", order_id: orderId ?? null });

        if (orderId) {
          const { error } = await sb()
            .from("orders")
            .update({
              status: "paid",
              paid_at: new Date().toISOString(),
            })
            .eq("id", orderId);
          if (error) throw new Error(`Supabase update failed: ${error.message}`);
          await logRow({ event_type: "order_updated_to_paid", order_id: orderId, status: "paid" });
        }

        // Reconciliation row (non-blocking)
        await upsertPaymentRow({
          pi_id: pi.id,
          amount: (pi.amount_received ?? pi.amount) ?? null,
          currency: (pi.currency || "gbp").toUpperCase(),
          status: pi.status,
          email: (pi.receipt_email || (pi.metadata as any)?.customer_email) ?? null,
          order_id: orderId ?? null,
          meta: pi.metadata ?? null,
        });

        // Send invoice
        await callInvoiceRoute({
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

        await logRow({ event_type: "invoice_sent", order_id: orderId ?? null, status: "paid" });
        break;
      }

      default:
        // ignore others
        break;
    }
  } catch (e: any) {
    console.error("Webhook handler error:", e);
    await logRow({ event_type: "handler_error", error: String(e?.message || e) });
    // ack so Stripe doesn't keep retrying forever
    return res.status(200).json({ received: true, error: e?.message });
  }

  return res.status(200).json({ received: true });
}


