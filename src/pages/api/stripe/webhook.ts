// src/pages/api/stripe/webhook.ts
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const config = { api: { bodyParser: false } };

// ---------- Stripe + Supabase ----------
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

function sbAdmin() {
  return createClient(
    process.env.SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string
  );
}

// ---------- utils ----------
function readRawBody(req: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/** Prefer explicit SITE_URL, else derive from headers */
function getBaseUrl(req: NextApiRequest) {
  const env = (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "").trim();
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

async function logRow(row: {
  event_type: string;
  order_id?: string | null;
  status?: string | null;
  error?: string | null;
}) {
  try {
    await sbAdmin().from("webhook_logs").insert({
      event_type: row.event_type,
      order_id: row.order_id ?? null,
      status: row.status ?? null,
      error: row.error ?? null,
    });
  } catch {
    /* ignore */
  }
}

async function saveWebhookEvent(e: Stripe.Event) {
  try {
    await sbAdmin()
      .from("webhook_events")
      .insert({ id: e.id, type: e.type, raw: e as any })
      .onConflict("id")
      .ignore();
  } catch { /* ignore */ }
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

// ---------- webhook handler ----------
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
    await logRow({ event_type: "bad_signature", error: err?.message });
    return res.status(400).send(`Webhook Error: ${err?.message}`);
  }

  // store the raw event (useful for audits)
  await saveWebhookEvent(event);

  const baseUrl = getBaseUrl(req);
  const supabase = sbAdmin();

  try {
    switch (event.type) {
      // Fired when Checkout is completed and the payment is paid
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        const csId = session.id;
        const piId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? null;

        const orderId =
          (session.metadata && (session.metadata as any).order_id) ||
          (piId
            ? (await stripe.paymentIntents.retrieve(piId)).metadata?.order_id
            : undefined);

        await logRow({
          event_type: "checkout.session.completed/received",
          order_id: orderId ?? null,
          status: session.payment_status || "unknown",
        });

        // --- update order to paid (if we can link it) ---
        if (orderId) {
          const { error: updErr } = await supabase
            .from("orders")
            .update({
              status: "paid",
              paid_at: new Date().toISOString(),
              stripe_payment_intent_id: piId,
              stripe_session_id: csId,
            })
            .eq("id", orderId);

          if (updErr) throw new Error(`Supabase order update failed: ${updErr.message}`);
        }

        // --- create / upsert a payment row for reconciliation ---
        // Grab line items to compute a clean total and snapshot of metadata
        const itemsResp = await stripe.checkout.sessions.listLineItems(session.id, {
          limit: 100,
          expand: ["data.price.product"],
        });

        const amountPence = Number(session.amount_total ?? 0); // already in pence
        const email =
          session.customer_details?.email || session.customer_email || (session.metadata as any)?.email || "";

        await supabase
          .from("payments")
          .upsert({
            pi_id: piId ?? `cs:${csId}`,     // ensure uniqueness even if PI is null
            cs_id: csId,
            amount: amountPence,
            currency: (session.currency || "gbp").toUpperCase(),
            status: session.payment_status || "paid",
            email,
            order_id: orderId ?? null,
            meta: {
              session_metadata: session.metadata || {},
              items: itemsResp.data.map((row) => ({
                description:
                  row.description ||
                  ((row.price?.product as Stripe.Product | undefined)?.name ?? "Item"),
                quantity: row.quantity ?? 1,
                unitPrice:
                  (row.price?.unit_amount ??
                    (row.amount_total && row.quantity
                      ? Math.round(row.amount_total / row.quantity)
                      : 0)) / 100,
              })),
            },
          }, { onConflict: "pi_id" });

        // --- send the invoice email via your internal route ---
        const itemsForInvoice = itemsResp.data.map((row) => {
          const qty = row.quantity ?? 1;
          const unit =
            (row.price?.unit_amount ??
              (row.amount_total && qty ? Math.round(row.amount_total / qty) : 0)) / 100;
          const name =
            row.description ||
            ((row.price?.product as Stripe.Product | undefined)?.name ?? "Item");
          return { description: name, quantity: qty, unitPrice: unit };
        });

        await callInvoiceRoute(baseUrl, {
          customer: {
            name: session.customer_details?.name || "Customer",
            email,
          },
          items: itemsForInvoice,
          currency: (session.currency || "gbp").toUpperCase(),
        });

        await logRow({ event_type: "invoice_sent", order_id: orderId ?? null, status: "paid" });
        break;
      }

      // Backup path (in case you ever confirm off-session etc.)
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;

        const orderId =
          (pi.metadata && (pi.metadata as any).order_id) ||
          (typeof pi.latest_charge === "string"
            ? (await stripe.charges.retrieve(pi.latest_charge)).metadata?.order_id
            : undefined);

        await logRow({
          event_type: "payment_intent.succeeded/received",
          order_id: orderId ?? null,
          status: pi.status,
        });

        // upsert payment row
        await supabase
          .from("payments")
          .upsert(
            {
              pi_id: pi.id,
              amount: Number(pi.amount_received ?? pi.amount ?? 0),
              currency: (pi.currency || "gbp").toUpperCase(),
              status: pi.status || "succeeded",
              email: (pi.receipt_email || (pi.metadata as any)?.customer_email) ?? null,
              order_id: orderId ?? null,
              cs_id: (pi.metadata as any)?.checkout_session_id ?? null,
              meta: pi.metadata || {},
            },
            { onConflict: "pi_id" }
          );

        // mark order paid (if linked)
        if (orderId) {
          const { error: updErr } = await supabase
            .from("orders")
            .update({ status: "paid", paid_at: new Date().toISOString(), stripe_payment_intent_id: pi.id })
            .eq("id", orderId);
          if (updErr) throw new Error(`Supabase order update failed: ${updErr.message}`);
        }

        // simple one-line item invoice (fallback)
        await callInvoiceRoute(getBaseUrl(req), {
          customer: {
            name: pi.shipping?.name || (pi.metadata as any)?.customer_name || "Customer",
            email: (pi.receipt_email || (pi.metadata as any)?.customer_email) ?? "",
          },
          items: [
            {
              description: (pi.metadata as any)?.description || "Payment",
              quantity: 1,
              unitPrice: (pi.amount_received ?? pi.amount ?? 0) / 100,
            },
          ],
          currency: (pi.currency || "gbp").toUpperCase(),
        });

        await logRow({ event_type: "invoice_sent", order_id: orderId ?? null, status: "paid" });
        break;
      }

      default:
        // ignore other events
        break;
    }
  } catch (e: any) {
    console.error("Webhook handler error:", e);
    await logRow({ event_type: "handler_error", error: String(e?.message || e) });
    // Return 200 so Stripe doesn’t retry forever, but keep the error for debugging
    return res.status(200).json({ received: true, error: e?.message });
  }

  return res.status(200).json({ received: true });
}


