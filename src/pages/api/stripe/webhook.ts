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
    // allow either var to be used
    (process.env.SUPABASE_URL as string) || (process.env.NEXT_PUBLIC_SUPABASE_URL as string),
    process.env.SUPABASE_SERVICE_ROLE_KEY as string
  );
}

// ---------- Order typing ----------
type OrderRow = {
  id?: string;
  product?: string | null;
  fuel?: string | null;
  litres?: number | null;
  unit_price_pence?: number | null;
  total_pence?: number | null;
  name?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  postcode?: string | null;
  delivery_date?: string | null; // YYYY-MM-DD
  user_email?: string | null;
};

// ---------- Helpers ----------
function readRawBody(req: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Canonical base where /api/invoices/create lives (prefer SELF_BASE_URL)
const CANONICAL_BASE =
  (process.env.SELF_BASE_URL || "").replace(/\/+$/, "") ||
  (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "") ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

// Optional: set INVOICE_DEBUG_IN_WEBHOOK=true to echo normalized items & page count
const WEBHOOK_DEBUG =
  String(process.env.INVOICE_DEBUG_IN_WEBHOOK || "").toLowerCase() === "true";

// best-effort logging (ignore errors)
async function logRow(row: {
  event_type: string;
  order_id?: string | null;
  status?: string | null;
  error?: string | null;
  extra?: any;
}) {
  try {
    await sb().from("webhook_logs").insert({
      event_type: row.event_type,
      order_id: row.order_id ?? null,
      status: row.status ?? null,
      error: row.error ?? null,
      extra: row.extra ?? null,
    } as any);
  } catch {}
}

// store the raw event (idempotent)
async function saveWebhookEvent(e: Stripe.Event) {
  try {
    await sb()
      .from("webhook_events")
      .upsert([{ id: e.id, type: e.type, raw: e as any }], { onConflict: "id" });
  } catch {}
}

// Source of truth: pull the order
async function fetchOrder(orderId?: string | null): Promise<OrderRow | null> {
  if (!orderId) return null;
  const { data, error } = await sb()
    .from("orders")
    .select(
      [
        "id",
        "product",
        "fuel",
        "litres",
        "unit_price_pence",
        "total_pence",
        "name",
        "address_line1",
        "address_line2",
        "city",
        "postcode",
        "delivery_date",
        "user_email",
      ].join(",")
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    console.error("[webhook] fetchOrder error:", error);
    return null;
  }
  return (data as unknown as OrderRow) || null;
}

// Build invoice items prioritising order data; fallback to Stripe metadata
function buildItemsFromOrderOrStripe(args: {
  order: OrderRow | null;
  lineItems: Stripe.ApiList<Stripe.LineItem> | null;
  session: Stripe.Checkout.Session | null;
}) {
  const { order, lineItems, session } = args;

  // Prefer the order row (DB is the source of truth)
  if (order && (order.litres || order.total_pence || order.unit_price_pence)) {
    const litres = Number(order.litres || 0);
    const desc =
      order.product ||
      order.fuel ||
      (lineItems?.data?.[0]?.description ?? "Fuel order");

    const totalMajor =
      order.total_pence != null ? Number(order.total_pence) / 100 : undefined;
    const unitMajor =
      order.unit_price_pence != null
        ? Number(order.unit_price_pence) / 100
        : totalMajor && litres
        ? totalMajor / litres
        : undefined;

    // Prefer { litres, total } so the invoice route derives per-litre exactly
    if (litres && totalMajor != null) {
      return [{ description: desc, litres, total: totalMajor }];
    }
    if (litres && unitMajor != null) {
      return [{ description: desc, litres, unitPrice: unitMajor }];
    }
  }

  // Fallback: Stripe line items + metadata
  const items: Array<{ description: string; litres: number; total?: number; unitPrice?: number }> = [];
  if (lineItems) {
    for (const row of lineItems.data) {
      const qty = row.quantity ?? 1;

      const metaLitres =
        Number(
          // @ts-ignore
          (row as any)?.metadata?.litres ??
            (row.price?.metadata as any)?.litres ??
            ((row.price?.product as any)?.metadata?.litres)
        ) || 0;

      const sessionLitres = Number((session?.metadata as any)?.litres || 0);

      const litres = metaLitres || sessionLitres || qty;

      const totalMajor =
        (typeof row.amount_total === "number"
          ? row.amount_total
          : row.price?.unit_amount != null && qty
          ? row.price.unit_amount * qty
          : 0) / 100;

      const name =
        row.description ||
        ((row.price?.product as Stripe.Product | undefined)?.name ?? "Item");

      items.push({ description: name, litres, total: totalMajor });
    }
  }

  if (items.length === 0) {
    const totalMajor =
      (typeof session?.amount_total === "number" ? session!.amount_total : 0) / 100;
    items.push({
      description: "Payment",
      litres: Number((session?.metadata as any)?.litres || 1),
      total: totalMajor,
    });
  }

  return items;
}

function toISODate(dateStr?: string | null): string | undefined {
  if (!dateStr) return undefined;
  // if it's already ISO, keep; else assume YYYY-MM-DD and set noon UTC to avoid TZ off-by-one
  if (/^\d{4}-\d{2}-\d{2}T/.test(dateStr)) return dateStr;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return new Date(`${dateStr}T12:00:00.000Z`).toISOString();
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

async function callInvoiceRoute(payload: any) {
  if (!process.env.INVOICE_SECRET) {
    throw new Error("INVOICE_SECRET not set");
  }
  if (!CANONICAL_BASE) {
    throw new Error("SELF_BASE_URL / SITE_URL / NEXT_PUBLIC_SITE_URL / VERCEL_URL not set");
  }

  const url =
    `${CANONICAL_BASE}/api/invoices/create` + (WEBHOOK_DEBUG ? `?debug=1` : "");
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-invoice-secret": process.env.INVOICE_SECRET,
      ...(WEBHOOK_DEBUG ? { "x-invoice-debug": "1" } : {}),
    } as any,
    body: JSON.stringify(payload),
  });

  const text = await resp.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON (shouldn't happen)
  }

  if (!resp.ok) {
    console.error("[invoice] route call failed", {
      url,
      status: resp.status,
      body: text?.slice(0, 1000),
    });
    throw new Error(`Invoice route error: ${resp.status}`);
  }

  // Log returned storagePath so you can confirm the save
  try {
    await logRow({
      event_type: "invoice_created",
      status: "ok",
      extra: { storagePath: json?.storagePath, id: json?.id },
    });
  } catch {}

  if (WEBHOOK_DEBUG && json?.debug) {
    console.log("[invoice] debug.normalized:", json.debug.normalized);
    console.log("[invoice] pages:", json.debug.pages);
    console.log("[invoice] storagePath:", json.debug.storagePath || json.storagePath);
  }

  return json;
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

        // Our order id (however you set it in checkout create)
        let orderId =
          (session.metadata as any)?.order_id ||
          (typeof session.payment_intent === "string"
            ? (await stripe.paymentIntents.retrieve(session.payment_intent)).metadata?.order_id
            : session.payment_intent?.metadata?.order_id);

        await logRow({
          event_type: "checkout.session.completed/received",
          order_id: orderId ?? null,
        });

        // Pull line items + product expansion for metadata
        const li = await stripe.checkout.sessions.listLineItems(session.id, {
          limit: 100,
          expand: ["data.price.product"],
        });

        // Prefer DB order as source of truth
        const order = await fetchOrder(orderId);

        // Mark order paid (minimal update)
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

        // Build invoice payload
        const items = buildItemsFromOrderOrStripe({ order, lineItems: li, session });

        // Decide dateISO to place file under correct YYYY/MM
        const dateISO =
          toISODate(order?.delivery_date) ||
          toISODate((session.metadata as any)?.deliveryDate) ||
          new Date().toISOString();

        // Lowercase email so Storage path matches policy & explorer
        const emailLower =
          (order?.user_email ||
            order?.name /* if you stored email in name by mistake, ignore */ ||
            session.customer_details?.email ||
            session.customer_email ||
            (session.metadata as any)?.email ||
            "")?.toString()
            .toLowerCase();

        const payload = {
          customer: {
            name: order?.name || session.customer_details?.name || "Customer",
            email: emailLower,
            address_line1: order?.address_line1 ?? null,
            address_line2: order?.address_line2 ?? null,
            city: order?.city ?? null,
            postcode: order?.postcode ?? null,
          },
          items,
          currency: (session.currency || "gbp").toUpperCase(),
          meta: {
            orderId: orderId ?? undefined,
            notes: (session.metadata as any)?.notes ?? undefined,
            dateISO, // <-- ensures correct YYYY/MM folder
          },
        };

        // Trigger invoice (emails + storage save)
        const resp = await callInvoiceRoute(payload);

        await logRow({
          event_type: "invoice_sent",
          order_id: orderId ?? null,
          status: "paid",
          extra: { storagePath: resp?.storagePath },
        });
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

        const order = await fetchOrder(orderId);

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

        // Items
        let items: Array<{ description: string; litres: number; total?: number; unitPrice?: number }>;
        if (order && (order.litres || order.total_pence || order.unit_price_pence)) {
          const litres = Number(order.litres || 0);
          const totalMajor =
            order.total_pence != null ? Number(order.total_pence) / 100 : undefined;
          const unitMajor =
            order.unit_price_pence != null
              ? Number(order.unit_price_pence) / 100
              : totalMajor && litres
              ? totalMajor / litres
              : undefined;

          const desc = order.product || order.fuel || "Payment";
          items = totalMajor != null
            ? [{ description: desc, litres, total: totalMajor }]
            : [{ description: desc, litres, unitPrice: unitMajor || 0 }];
        } else {
          const litres = Number((pi.metadata as any)?.litres || 1);
          const totalMajor = ((pi.amount_received ?? pi.amount) || 0) / 100;
          const desc = (pi.metadata as any)?.description || "Payment";
          items = [{ description: desc, litres, total: totalMajor }];
        }

        const dateISO =
          toISODate(order?.delivery_date) ||
          toISODate((pi.metadata as any)?.deliveryDate) ||
          new Date().toISOString();

        const emailLower =
          (order?.user_email ||
            pi.receipt_email ||
            (pi.metadata as any)?.customer_email ||
            "")?.toString()
            .toLowerCase();

        // Send invoice
        const resp = await callInvoiceRoute({
          customer: {
            name: order?.name || pi.shipping?.name || (pi.metadata as any)?.customer_name || "Customer",
            email: emailLower,
            address_line1: order?.address_line1 ?? null,
            address_line2: order?.address_line2 ?? null,
            city: order?.city ?? null,
            postcode: order?.postcode ?? null,
          },
          items,
          currency: (pi.currency || "gbp").toUpperCase(),
          meta: { orderId: orderId ?? undefined, notes: (pi.metadata as any)?.notes ?? undefined, dateISO },
        });

        await logRow({ event_type: "invoice_sent", order_id: orderId ?? null, status: "paid", extra: { storagePath: resp?.storagePath } });
        break;
      }

      default:
        // ignore others but still ack
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

