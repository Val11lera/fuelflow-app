// src/pages/api/stripe/webhook.ts
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const config = { api: { bodyParser: false } };

// --- Server-only Stripe client (never imported on the client) ---
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY as string;
if (!STRIPE_KEY) throw new Error("Missing STRIPE_SECRET_KEY");
const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2024-06-20" });

// ---------- helpers ----------
function readRawBody(req: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function getBaseUrl(req: NextApiRequest) {
  // Prefer an explicit SITE_URL (set to https://dashboard.fuelflow.co.uk)
  const env = process.env.SITE_URL && process.env.SITE_URL.trim();
  if (env) return env.replace(/\/+$/, "");

  // Fallback to headers (Vercel sets these)
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

function sb() {
  const url = process.env.SUPABASE_URL as string;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  if (!url || !key) throw new Error("Missing Supabase server credentials");
  return createClient(url, key);
}

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
  } catch {
    // logging should never break the handler
  }
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

// ---------- main handler ----------
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  const rawBody = await readRawBody(req);
  const sig = req.headers["stripe-signature"] as string;

  let event: Stripe.Event;
  try {
    const whsec = process.env.STRIPE_WEBHOOK_SECRET as string;
    if (!whsec) throw new Error("STRIPE_WEBHOOK_SECRET not set");
    event = stripe.webhooks.constructEvent(rawBody, sig, whsec);
  } catch (err: any) {
    await logRow({ event_type: "bad_signature", error: err?.message });
    return res.status(400).send(`Webhook Error: ${err?.message}`);
  }

  const baseUrl = getBaseUrl(req);
  const supabase = sb();

  try {
    switch (event.type) {
      // ─────────────────────────────────────────────────────────────
      // Checkout flow (your main path)
      // ─────────────────────────────────────────────────────────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        // Try to recover the order id via metadata or the PI
        const orderId =
          (session.metadata && (session.metadata as any).order_id) ||
          (typeof session.payment_intent === "string"
            ? (await stripe.paymentIntents.retrieve(session.payment_intent)).metadata?.order_id
            : undefined);

        await logRow({
          event_type: "checkout.session.completed/received",
          order_id: orderId ?? null,
        });

        // Build invoice items from the session line items
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

        // Update order to paid (kept from your code)
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

        // Send invoice via your internal route (Resend runs there)
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

      // ─────────────────────────────────────────────────────────────
      // Optional: direct PI flows (you kept this; we keep it)
      // ─────────────────────────────────────────────────────────────
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
        });

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

        await logRow({
          event_type: "invoice_sent",
          order_id: orderId ?? null,
          status: "paid",
        });
        break;
      }

      default:
        // ignore other events to keep noise down
        break;
    }
  } catch (e: any) {
    console.error("Webhook handler error:", e);
    await logRow({ event_type: "handler_error", error: String(e?.message || e) });
    // Return 200 so Stripe does not retry forever; error is stored in logs.
    return res.status(200).json({ received: true, error: e?.message });
  }

  return res.status(200).json({ received: true });
}

