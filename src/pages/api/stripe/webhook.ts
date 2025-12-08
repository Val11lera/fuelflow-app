// src/pages/api/stripe/webhook.ts
// src/pages/api/stripe/webhook.ts
// Stripe webhook handler for FuelFlow

import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

function sb() {
  return createClient(
    (process.env.SUPABASE_URL as string) ||
      (process.env.NEXT_PUBLIC_SUPABASE_URL as string),
    process.env.SUPABASE_SERVICE_ROLE_KEY as string
  );
}

/* =========================
   Types
   ========================= */
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
  delivery_date?: string | null;
  user_email?: string | null;
};

/* =========================
   Helpers
   ========================= */

function readRawBody(req: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const CANONICAL_BASE =
  (process.env.SELF_BASE_URL || "").replace(/\/+$/, "") ||
  (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "").replace(
    /\/+$/,
    ""
  ) ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

const WEBHOOK_DEBUG =
  String(process.env.INVOICE_DEBUG_IN_WEBHOOK || "").toLowerCase() === "true";

/* ---------- logging & helpers ---------- */

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
  } catch (e) {
    console.error("[webhook] failed to log row", e);
  }
}

async function saveWebhookEvent(e: Stripe.Event) {
  try {
    await sb()
      .from("webhook_events")
      .upsert([{ id: e.id, type: e.type, raw: e as any }], {
        onConflict: "id",
      });
  } catch (error) {
    console.error("[webhook] failed to save event", error);
  }
}

/** Idempotency guard: has an invoice already been sent for this order? */
async function invoiceAlreadySent(orderId?: string | null): Promise<boolean> {
  if (!orderId) return false;
  try {
    const { data, error } = await sb()
      .from("webhook_logs")
      .select("id")
      .eq("event_type", "invoice_sent")
      .eq("order_id", orderId)
      .limit(1);
    if (error) {
      console.error("[webhook] invoiceAlreadySent error", error);
      return false;
    }
    return (data?.length || 0) > 0;
  } catch (e) {
    console.error("[webhook] invoiceAlreadySent crash", e);
    return false;
  }
}

/** If PI belongs to a Checkout Session, we’ll let `checkout.session.completed` handle invoicing. */
async function hasCheckoutSessionForPI(piId?: string | null): Promise<boolean> {
  if (!piId) return false;
  try {
    const list = await stripe.checkout.sessions.list({
      payment_intent: piId,
      limit: 1,
    });
    return (list.data?.length || 0) > 0;
  } catch (e) {
    console.error("[webhook] hasCheckoutSessionForPI error", e);
    return false;
  }
}

async function fetchOrder(orderId?: string | null): Promise<OrderRow | null> {
  if (!orderId) return null;
  const { data, error } = await sb()
    .from("orders")
    .select(
      "id,product,fuel,litres,unit_price_pence,total_pence,name,address_line1,address_line2,city,postcode,delivery_date,user_email"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    console.error("[webhook] fetchOrder error:", error);
    return null;
  }
  return (data as unknown as OrderRow) || null;
}

function buildItemsFromOrderOrStripe(args: {
  order: OrderRow | null;
  lineItems: Stripe.ApiList<Stripe.LineItem> | null;
  session: Stripe.Checkout.Session | null;
}) {
  const { order, lineItems, session } = args;

  // Prefer order row if present
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

    if (litres && totalMajor != null)
      return [{ description: desc, litres, total: totalMajor }];
    if (litres && unitMajor != null)
      return [{ description: desc, litres, unitPrice: unitMajor }];
  }

  // Fallback: derive from Stripe line items
  const items: Array<{
    description: string;
    litres: number;
    total?: number;
    unitPrice?: number;
  }> = [];

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

  // Last resort: just use session amount_total
  if (items.length === 0) {
    const totalMajor =
      (typeof session?.amount_total === "number" ? session.amount_total : 0) /
      100;
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
  if (/^\d{4}-\d{2}-\d{2}T/.test(dateStr)) return dateStr;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr))
    return new Date(`${dateStr}T12:00:00.000Z`).toISOString();
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

async function callInvoiceRoute(payload: any) {
  if (!process.env.INVOICE_SECRET) throw new Error("INVOICE_SECRET not set");
  if (!CANONICAL_BASE)
    throw new Error(
      "SELF_BASE_URL / SITE_URL / NEXT_PUBLIC_SITE_URL / VERCEL_URL not set"
    );

  const url = `${CANONICAL_BASE}/api/invoices/create${
    WEBHOOK_DEBUG ? `?debug=1` : ""
  }`;

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
    // ignore
  }

  if (!resp.ok) {
    console.error("[invoice] route call failed", {
      url,
      status: resp.status,
      body: text?.slice(0, 1000),
    });
    throw new Error(`Invoice route error: ${resp.status}`);
  }

  try {
    await logRow({
      event_type: "invoice_created",
      status: "ok",
      extra: { storagePath: json?.storagePath, id: json?.id },
    });
  } catch (e) {
    console.error("[invoice] failed to log invoice_created", e);
  }

  if (WEBHOOK_DEBUG && json?.debug) {
    console.log("[invoice] debug.normalized:", json.debug.normalized);
    console.log("[invoice] pages:", json.debug.pages);
    console.log(
      "[invoice] storagePath:",
      json.debug.storagePath || json.storagePath
    );
  }

  return json;
}

/**
 * Insert or update a payment row for this PI.
 * This version NEVER swallows errors – they are logged in webhook_logs.
 */
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
  const row = {
    pi_id: args.pi_id ?? null,
    amount: args.amount ?? null,
    currency: args.currency ?? null,
    status: args.status ?? null,
    email: args.email ?? null,
    order_id: args.order_id ?? null,
    cs_id: args.cs_id ?? null,
    meta: args.meta ?? null,
  };

  try {
    const { error } = await sb()
      .from("payments")
      .upsert([row as any], { onConflict: "pi_id" });

    if (error) {
      console.error("[payments] upsert error:", error);
      await logRow({
        event_type: "payment_upsert_error",
        order_id: args.order_id ?? null,
        error: error.message,
        extra: row,
      });
    }
  } catch (err: any) {
    console.error("[payments] upsert crash:", err);
    await logRow({
      event_type: "payment_upsert_crash",
      order_id: args.order_id ?? null,
      error: err?.message || String(err),
      extra: row,
    });
  }
}

/* ---------- NEW: refinery helper (very small, additive) ---------- */

async function markRefineryReady(args: {
  orderId?: string | null;
  storagePath?: string | null;
}) {
  const orderId = args.orderId;
  if (!orderId) return; // nothing to do

  const storagePath = args.storagePath ?? null;

  try {
    const { error } = await sb()
      .from("orders")
      .update({
        refinery_notified_at: new Date().toISOString(),
        refinery_notification_status: "ready", // simple status for dashboards
        refinery_invoice_storage_path: storagePath,
      } as any)
      .eq("id", orderId);

    if (error) {
      console.error("[refinery] update failed:", error);
      await logRow({
        event_type: "refinery_update_error",
        order_id: orderId,
        error: error.message,
        extra: { storagePath },
      });
      return;
    }

    await logRow({
      event_type: "refinery_ready",
      order_id: orderId,
      status: "ready",
      extra: { storagePath },
    });
  } catch (err: any) {
    console.error("[refinery] crash:", err);
    await logRow({
      event_type: "refinery_update_crash",
      order_id: orderId,
      error: err?.message || String(err),
      extra: { storagePath },
    });
  }
}

/* =========================
   Main handler
   ========================= */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
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
    console.error("[webhook] bad signature", err);
    await logRow({ event_type: "bad_signature", error: err?.message });
    return res.status(400).send(`Webhook Error: ${err?.message}`);
  }

  await saveWebhookEvent(event);

  try {
    switch (event.type) {
      /* ============================================================
         PRIMARY path for invoicing: Checkout Session completed
         ============================================================ */
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        const piId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id || null;

        // Resolve orderId robustly:
        // 1) metadata.order_id
        // 2) success_url ?orderId=...
        // 3) payment_intent.metadata.order_id
        let orderId: string | undefined = undefined;

        if ((session.metadata as any)?.order_id) {
          orderId = (session.metadata as any).order_id;
        }

        if (!orderId && typeof session.success_url === "string") {
          try {
            const u = new URL(session.success_url);
            const fromQuery = u.searchParams.get("orderId");
            if (fromQuery) orderId = fromQuery;
          } catch {
            // ignore parse errors
          }
        }

        if (!orderId && piId) {
          try {
            const pi = await stripe.paymentIntents.retrieve(piId);
            if ((pi.metadata as any)?.order_id) {
              orderId = (pi.metadata as any).order_id;
            }
          } catch (e) {
            console.error(
              "[webhook] failed to fetch PI for orderId resolution",
              e
            );
          }
        }

        await logRow({
          event_type: "checkout.session.completed/received",
          order_id: orderId ?? null,
          extra: {
            session_id: session.id,
            pi_id: piId,
            metadata: session.metadata || null,
          },
        });

        // Mark order as paid
        if (orderId) {
          const { error } = await sb()
            .from("orders")
            .update({
              status: "paid",
              paid_at: new Date().toISOString(),
              stripe_session_id: session.id,
              stripe_payment_intent: piId ?? null,
            } as any)
            .eq("id", orderId);

          if (error)
            throw new Error(`Supabase order update failed: ${error.message}`);

          await logRow({
            event_type: "order_updated_to_paid",
            order_id: orderId,
            status: "paid",
          });
        } else {
          await logRow({
            event_type: "missing_order_id_on_session",
            status: "pending",
            extra: {
              session_id: session.id,
              metadata: session.metadata || null,
            },
          });
        }

        // Upsert payment record
        await upsertPaymentRow({
          pi_id: piId,
          amount:
            (typeof session.amount_total === "number"
              ? session.amount_total
              : null) ?? null,
          currency: (session.currency || "gbp").toUpperCase(),
          status: session.payment_status || "paid",
          email:
            (session.customer_details?.email ||
              session.customer_email ||
              (session.metadata as any)?.email) ?? null,
          order_id: orderId ?? null,
          cs_id: session.id,
          meta: session.metadata ? { ...(session.metadata as any) } : null,
        });

        // Idempotency: if we already sent an invoice for this order, skip.
        if (await invoiceAlreadySent(orderId)) {
          await logRow({
            event_type: "invoice_skip_already_sent",
            order_id: orderId ?? null,
          });
          break;
        }

        // Build invoice
        const li = await stripe.checkout.sessions.listLineItems(session.id, {
          limit: 100,
          expand: ["data.price.product"],
        });

        const order = await fetchOrder(orderId ?? null);
        const items = buildItemsFromOrderOrStripe({
          order,
          lineItems: li,
          session,
        });

        const dateISO =
          toISODate(order?.delivery_date) ||
          toISODate((session.metadata as any)?.deliveryDate) ||
          new Date().toISOString();

        const emailLower =
          (
            order?.user_email ||
            session.customer_details?.email ||
            session.customer_email ||
            (session.metadata as any)?.email ||
            ""
          )
            .toString()
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
            dateISO,
          },
        };

        const resp = await callInvoiceRoute(payload);

        await logRow({
          event_type: "invoice_sent",
          order_id: orderId ?? null,
          status: "paid",
          extra: { storagePath: resp?.storagePath },
        });

        // NEW: mark refinery as ready (uses same invoice PDF path)
        await markRefineryReady({
          orderId: orderId ?? null,
          storagePath: resp?.storagePath,
        });

        break;
      }

      /* ============================================================
         SECONDARY path — only when there is NO Checkout Session
         (e.g. manual PI confirmation, some API flows)
         ============================================================ */
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const piId = pi.id;

        const orderId =
          (pi.metadata as any)?.order_id ||
          (typeof pi.latest_charge === "string"
            ? (await stripe.charges.retrieve(pi.latest_charge)).metadata
                ?.order_id
            : undefined);

        await logRow({
          event_type: "payment_intent.succeeded/received",
          order_id: orderId ?? null,
          extra: { pi_id: piId, metadata: pi.metadata || null },
        });

        const order = await fetchOrder(orderId);

        // Mark order as paid in Supabase if we have an orderId
        if (orderId) {
          const { error } = await sb()
            .from("orders")
            .update({
              status: "paid",
              paid_at: new Date().toISOString(),
            })
            .eq("id", orderId);

          if (error)
            throw new Error(`Supabase update failed: ${error.message}`);

          await logRow({
            event_type: "order_updated_to_paid",
            order_id: orderId,
            status: "paid",
          });
        }

        // Upsert payment row
        await upsertPaymentRow({
          pi_id: piId,
          amount: (pi.amount_received ?? pi.amount) ?? null,
          currency: (pi.currency || "gbp").toUpperCase(),
          status: pi.status,
          email:
            (pi.receipt_email || (pi.metadata as any)?.customer_email) ?? null,
          order_id: orderId ?? null,
          meta: pi.metadata ?? null,
        });

        // Idempotency: if already invoiced for this order, skip
        if (await invoiceAlreadySent(orderId)) {
          await logRow({
            event_type: "invoice_skip_already_sent",
            order_id: orderId ?? null,
          });
          break;
        }

        // Build invoice line items
        let items: Array<{
          description: string;
          litres: number;
          total?: number;
          unitPrice?: number;
        }>;

        if (
          order &&
          (order.litres || order.total_pence || order.unit_price_pence)
        ) {
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

          items =
            totalMajor != null
              ? [{ description: desc, litres, total: totalMajor }]
              : [{ description: desc, litres, unitPrice: unitMajor || 0 }];
        } else {
          // Fallback to PI metadata
          const litres = Number((pi.metadata as any)?.litres || 1);
          const totalMajor = ((pi.amount_received ?? pi.amount) || 0) / 100;
          const desc = (pi.metadata as any)?.description || "Payment";
          items = [{ description: desc, litres, total: totalMajor }];
        }

        const dateISO =
          toISODate(order?.delivery_date) ||
          toISODate((pi.metadata as any)?.deliveryDate) ||
          new Date().toISOString();

        const emailLower = (
          order?.user_email ||
          pi.receipt_email ||
          (pi.metadata as any)?.customer_email ||
          ""
        )
          .toString()
          .toLowerCase();

        const resp = await callInvoiceRoute({
          customer: {
            name:
              order?.name ||
              pi.shipping?.name ||
              (pi.metadata as any)?.customer_name ||
              "Customer",
            email: emailLower,
            address_line1: order?.address_line1 ?? null,
            address_line2: order?.address_line2 ?? null,
            city: order?.city ?? null,
            postcode: order?.postcode ?? null,
          },
          items,
          currency: (pi.currency || "gbp").toUpperCase(),
          meta: {
            orderId: orderId ?? undefined,
            notes: (pi.metadata as any)?.notes ?? undefined,
            dateISO,
          },
        });

        await logRow({
          event_type: "invoice_sent",
          order_id: orderId ?? null,
          status: "paid",
          extra: { storagePath: resp?.storagePath },
        });

        // Mark refinery as ready for non-Checkout flows as well
        await markRefineryReady({
          orderId: orderId ?? null,
          storagePath: resp?.storagePath,
        });

        break;
      }

  // Build invoice from PI / order
  let items: Array<{
    description: string;
    litres: number;
    total?: number;
    unitPrice?: number;
  }>;

  if (
    order &&
    (order.litres || order.total_pence || order.unit_price_pence)
  ) {
    const litres = Number(order.litres || 0);
    const totalMajor =
      order.total_pence != null
        ? Number(order.total_pence) / 100
        : undefined;
    const unitMajor =
      order.unit_price_pence != null
        ? Number(order.unit_price_pence) / 100
        : totalMajor && litres
        ? totalMajor / litres
        : undefined;
    const desc = order.product || order.fuel || "Payment";

    items =
      totalMajor != null
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

  const emailLower = (
    order?.user_email ||
    pi.receipt_email ||
    (pi.metadata as any)?.customer_email ||
    ""
  )
    .toString()
    .toLowerCase();

  const resp = await callInvoiceRoute({
    customer: {
      name:
        order?.name ||
        pi.shipping?.name ||
        (pi.metadata as any)?.customer_name ||
        "Customer",
      email: emailLower,
      address_line1: order?.address_line1 ?? null,
      address_line2: order?.address_line2 ?? null,
      city: order?.city ?? null,
      postcode: order?.postcode ?? null,
    },
    items,
    currency: (pi.currency || "gbp").toUpperCase(),
    meta: {
      orderId: orderId ?? undefined,
      notes: (pi.metadata as any)?.notes ?? undefined,
      dateISO,
    },
  });

  await logRow({
    event_type: "invoice_sent",
    order_id: orderId ?? null,
    status: "paid",
    extra: { storagePath: resp?.storagePath },
  });

  // NEW: mark refinery as ready for non-Checkout flows as well
  await markRefineryReady({
    orderId: orderId ?? null,
    storagePath: resp?.storagePath,
  });

  break;
}

        const orderId =
          (pi.metadata as any)?.order_id ||
          (typeof pi.latest_charge === "string"
            ? (await stripe.charges.retrieve(pi.latest_charge)).metadata
                ?.order_id
            : undefined);

        await logRow({
          event_type: "payment_intent.succeeded/received",
          order_id: orderId ?? null,
          extra: { pi_id: piId, metadata: pi.metadata || null },
        });

        const order = await fetchOrder(orderId);

        if (orderId) {
          const { error } = await sb()
            .from("orders")
            .update({
              status: "paid",
              paid_at: new Date().toISOString(),
            })
            .eq("id", orderId);

          if (error)
            throw new Error(`Supabase update failed: ${error.message}`);

          await logRow({
            event_type: "order_updated_to_paid",
            order_id: orderId,
            status: "paid",
          });
        }

        await upsertPaymentRow({
          pi_id: piId,
          amount: (pi.amount_received ?? pi.amount) ?? null,
          currency: (pi.currency || "gbp").toUpperCase(),
          status: pi.status,
          email:
            (pi.receipt_email || (pi.metadata as any)?.customer_email) ?? null,
          order_id: orderId ?? null,
          meta: pi.metadata ?? null,
        });

        // Idempotency: if already invoiced for this order, skip
        if (await invoiceAlreadySent(orderId)) {
          await logRow({
            event_type: "invoice_skip_already_sent",
            order_id: orderId ?? null,
          });
          break;
        }

        // Build invoice from PI
        let items: Array<{
          description: string;
          litres: number;
          total?: number;
          unitPrice?: number;
        }>;

        if (
          order &&
          (order.litres || order.total_pence || order.unit_price_pence)
        ) {
          const litres = Number(order.litres || 0);
          const totalMajor =
            order.total_pence != null
              ? Number(order.total_pence) / 100
              : undefined;
          const unitMajor =
            order.unit_price_pence != null
              ? Number(order.unit_price_pence) / 100
              : totalMajor && litres
              ? totalMajor / litres
              : undefined;
          const desc = order.product || order.fuel || "Payment";

          items =
            totalMajor != null
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

        const emailLower = (
          order?.user_email ||
          pi.receipt_email ||
          (pi.metadata as any)?.customer_email ||
          ""
        )
          .toString()
          .toLowerCase();

        const resp = await callInvoiceRoute({
          customer: {
            name:
              order?.name ||
              pi.shipping?.name ||
              (pi.metadata as any)?.customer_name ||
              "Customer",
            email: emailLower,
            address_line1: order?.address_line1 ?? null,
            address_line2: order?.address_line2 ?? null,
            city: order?.city ?? null,
            postcode: order?.postcode ?? null,
          },
          items,
          currency: (pi.currency || "gbp").toUpperCase(),
          meta: {
            orderId: orderId ?? undefined,
            notes: (pi.metadata as any)?.notes ?? undefined,
            dateISO,
          },
        });

        await logRow({
          event_type: "invoice_sent",
          order_id: orderId ?? null,
          status: "paid",
          extra: { storagePath: resp?.storagePath },
        });

        // NEW: mark refinery as ready for non-Checkout flows as well
        await markRefineryReady({
          orderId: orderId ?? null,
          storagePath: resp?.storagePath,
        });

        break;
      }

      /* ============================================================
         REFUNDS (full & partial)
         ============================================================ */
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const piId =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent?.id || null;

        let orderId: string | null =
          (charge.metadata as any)?.order_id || null;

        if (!orderId && piId) {
          try {
            const pi = await stripe.paymentIntents.retrieve(piId);
            orderId = (pi.metadata as any)?.order_id || null;
          } catch (e) {
            console.error("[webhook] refund: failed to fetch PI", e);
          }
        }

        const total = typeof charge.amount === "number" ? charge.amount : null;
        const refunded =
          typeof charge.amount_refunded === "number"
            ? charge.amount_refunded
            : null;

        let newStatus: string | null = null;
        if (total != null && refunded != null) {
          if (refunded === 0) newStatus = "paid";
          else if (refunded < total) newStatus = "partially_refunded";
          else newStatus = "refunded";
        }

        if (orderId && newStatus) {
          const { error } = await sb()
            .from("orders")
            .update({ status: newStatus })
            .eq("id", orderId);

          if (error)
            throw new Error(
              `Supabase order refund update failed: ${error.message}`
            );

          await logRow({
            event_type: "order_refund_status_update",
            order_id: orderId,
            status: newStatus,
            extra: {
              pi_id: piId,
              charge_id: charge.id,
              total,
              refunded,
            },
          });
        } else {
          await logRow({
            event_type: "order_refund_status_missing_order",
            status: newStatus,
            extra: {
              pi_id: piId,
              charge_id: charge.id,
              total,
              refunded,
            },
          });
        }

        // Record refund in payments table as a negative amount
        const currency = (charge.currency || "gbp").toUpperCase();
        const refundAmount =
          typeof charge.amount_refunded === "number"
            ? -charge.amount_refunded
            : null;

        if (refundAmount !== null) {
          await upsertPaymentRow({
            pi_id: piId,
            amount: refundAmount,
            currency,
            status: newStatus || "refunded",
            email:
              (charge.billing_details?.email as string | undefined) || null,
            order_id: orderId,
            cs_id: null,
            meta: {
              charge_id: charge.id,
              reason: (charge.refunds?.data?.[0]?.reason as string) || null,
            },
          });
        }

        break;
      }

      default:
        // Ignore other events but still return 200 so Stripe is happy
        break;
    }
  } catch (e: any) {
    console.error("Webhook handler error:", e);
    await logRow({
      event_type: "handler_error",
      error: String(e?.message || e),
    });
    return res.status(200).json({ received: true, error: e?.message });
  }

  return res.status(200).json({ received: true });
}

