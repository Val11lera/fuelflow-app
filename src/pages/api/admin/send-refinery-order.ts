// src/pages/api/admin/send-refinery-order.ts
// src/pages/api/admin/send-refinery-order.ts
// Creates a refinery-friendly "order sheet" (no commission shown),
// emails it to the refinery, and marks the order as sent.

import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

type Fuel = "petrol" | "diesel";

type OrderRow = {
  id: string;
  created_at: string;
  user_email: string | null;
  fuel: Fuel | string | null;
  litres: number | null;
  unit_price_pence: number | null;
  total_pence: number | null;
  delivery_date: string | null;
  name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postcode: string | null;
  status: string | null;
  refinery_notification_status: string | null;
  refinery_invoice_storage_path: string | null;
};

type PaymentRow = {
  created_at: string | null;
  amount: number | null;
  currency: string | null;
  status: string | null;
  pi_id: string | null;
  cs_id: string | null;
};

type Body = {
  orderId?: string;
  adminEmail?: string; // email of the admin clicking the button
};

type OkResponse = {
  ok: true;
  refineryOrder: {
    orderId: string;
    customerName: string | null;
    customerEmail: string | null;
    address: {
      line1: string | null;
      line2: string | null;
      city: string | null;
      postcode: string | null;
    };
    fuel: string | null;
    litres: number | null;
    unitPriceRefineryGbp: number | null;
    totalRefineryGbp: number | null;
    deliveryDate: string | null;
    payment: {
      paidAt: string | null;
      stripePiId: string | null;
      stripeSessionId: string | null;
      currency: string | null;
      grossAmountGbp: number | null;
    } | null;
    invoiceStoragePath: string | null;
  };
};

type ErrorResponse = { ok: false; error: string };

export type SendRefineryOrderResponse = OkResponse | ErrorResponse;

/* ===== Supabase (service role) ===== */

function sbAdmin() {
  const url =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createClient(url, key);
}

/* ===== Email (Resend) ===== */

const resendApiKey = process.env.RESEND_API_KEY || "";
const resend = resendApiKey ? new Resend(resendApiKey) : null;

/* ===== Helpers ===== */

function toGbp(pence: number | null | undefined): number | null {
  if (pence == null) return null;
  return Math.round(pence) / 100;
}

// Same % env vars you used for commission maths (we *don’t* send commission to refinery)
function getCommissionPercent(fuel: Fuel | string | null): number {
  const f = (fuel || "").toString().toLowerCase();
  if (f === "petrol") {
    return Number(process.env.PETROL_COMMISSION_PERCENT || "0");
  }
  if (f === "diesel") {
    return Number(process.env.DIESEL_COMMISSION_PERCENT || "0");
  }
  return 0;
}

function buildRefineryEmailHtml(args: {
  refineryOrder: OkResponse["refineryOrder"];
  refineryName?: string;
}) {
  const { refineryOrder } = args;
  const o = refineryOrder;
  const fmt = (n: number | null) =>
    n == null ? "—" : `£${n.toFixed(2)}`;

  const addrLines = [
    o.address.line1,
    o.address.line2,
    o.address.city,
    o.address.postcode,
  ]
    .filter(Boolean)
    .join("<br />");

  const paidAt = o.payment?.paidAt
    ? new Date(o.payment.paidAt).toLocaleString("en-GB")
    : "—";

  return `<!doctype html>
<html>
  <head>
    <meta charSet="utf-8" />
    <title>New FuelFlow Order – ${o.orderId}</title>
    <style>
      body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:#0b1220; color:#f9fafb; margin:0; padding:24px; }
      .card { max-width:640px; margin:0 auto; background:#020617; border-radius:16px; border:1px solid rgba(148,163,184,0.35); padding:24px; }
      h1 { font-size:20px; margin:0 0 4px 0; }
      h2 { font-size:16px; margin:16px 0 8px 0; }
      .muted { color:#9ca3af; font-size:12px; }
      table { width:100%; border-collapse:collapse; margin-top:8px; }
      th, td { text-align:left; padding:8px 6px; font-size:13px; }
      th { background:#020617; border-bottom:1px solid #1f2937; color:#e5e7eb; }
      tr:nth-child(even) td { background:#020617; }
      tr:nth-child(odd) td { background:#020617; }
      .pill { display:inline-block; padding:2px 8px; border-radius:999px; font-size:11px; background:#047857; color:white; }
      .footer { margin-top:16px; font-size:11px; color:#6b7280; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>New paid fuel order for delivery</h1>
      <div class="muted">Order reference: ${o.orderId}</div>

      <h2>Customer</h2>
      <table>
        <tbody>
          <tr>
            <th scope="row">Name</th>
            <td>${o.customerName || "—"}</td>
          </tr>
          <tr>
            <th scope="row">Email</th>
            <td>${o.customerEmail || "—"}</td>
          </tr>
          <tr>
            <th scope="row">Delivery address</th>
            <td>${addrLines || "—"}</td>
          </tr>
          <tr>
            <th scope="row">Requested delivery date</th>
            <td>${o.deliveryDate || "—"}</td>
          </tr>
        </tbody>
      </table>

      <h2>Order details</h2>
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Litres</th>
            <th>Unit price (to refinery)</th>
            <th>Total payable to refinery</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${o.fuel || "—"}</td>
            <td>${o.litres ?? "—"}</td>
            <td>${fmt(o.unitPriceRefineryGbp)}</td>
            <td>${fmt(o.totalRefineryGbp)}</td>
          </tr>
        </tbody>
      </table>

      <h2>Payment</h2>
      <table>
        <tbody>
          <tr>
            <th scope="row">Status</th>
            <td><span class="pill">Paid</span></td>
          </tr>
          <tr>
            <th scope="row">Paid at</th>
            <td>${paidAt}</td>
          </tr>
          <tr>
            <th scope="row">Stripe Payment Intent</th>
            <td>${o.payment?.stripePiId || "—"}</td>
          </tr>
          <tr>
            <th scope="row">Stripe Session</th>
            <td>${o.payment?.stripeSessionId || "—"}</td>
          </tr>
          <tr>
            <th scope="row">Gross amount (customer)</th>
            <td>${fmt(o.payment?.grossAmountGbp ?? null)}</td>
          </tr>
          <tr>
            <th scope="row">Currency</th>
            <td>${(o.payment?.currency || "GBP").toUpperCase()}</td>
          </tr>
        </tbody>
      </table>

      <div class="footer">
        This summary excludes FuelFlow commission and shows only the amount payable to the refinery.
        If you need a formal invoice PDF, please reply to this email.
      </div>
    </div>
  </body>
</html>`;
}

/* ===== Handler ===== */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SendRefineryOrderResponse>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { orderId, adminEmail } = (req.body || {}) as Body;

    if (!orderId) {
      return res
        .status(400)
        .json({ ok: false, error: "Missing orderId in request body" });
    }

    if (!adminEmail) {
      return res
        .status(400)
        .json({ ok: false, error: "Missing adminEmail in request body" });
    }

    if (!resend) {
      return res
        .status(500)
        .json({ ok: false, error: "Email service not configured" });
    }

    const refineryTo = process.env.REFINERY_NOTIFICATION_EMAIL;
    const fromEmail =
      process.env.REFINERY_FROM_EMAIL || "FuelFlow <no-reply@fuelflow.co.uk>";

    if (!refineryTo) {
      return res
        .status(500)
        .json({ ok: false, error: "REFINERY_NOTIFICATION_EMAIL not set" });
    }

    const supabase = sbAdmin();

    // --- 1) Check this email is an admin ---
    const { data: adminRow, error: adminError } = await supabase
      .from("admins")
      .select("email")
      .eq("email", adminEmail.toLowerCase())
      .maybeSingle();

    if (adminError) {
      console.error("[send-refinery-order] admin lookup error:", adminError);
      return res
        .status(500)
        .json({ ok: false, error: "Failed to verify admin" });
    }

    if (!adminRow) {
      return res
        .status(403)
        .json({ ok: false, error: "Not authorised (admin only)" });
    }

    // --- 2) Load the order ---
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(
        "id,created_at,user_email,fuel,litres,unit_price_pence,total_pence,delivery_date,name,address_line1,address_line2,city,postcode,status,refinery_notification_status,refinery_invoice_storage_path"
      )
      .eq("id", orderId)
      .maybeSingle();

    if (orderError) {
      console.error("[send-refinery-order] order query error:", orderError);
      return res
        .status(500)
        .json({ ok: false, error: "Failed to load order" });
    }

    if (!order) {
      return res
        .status(404)
        .json({ ok: false, error: "Order not found" });
    }

    const o = order as unknown as OrderRow;

    if (o.status !== "paid") {
      return res.status(400).json({
        ok: false,
        error: `Order is not paid (current status: ${o.status || "unknown"})`,
      });
    }

    // Optional guard: don't resend if already marked sent
    if (o.refinery_notification_status === "sent") {
      return res.status(400).json({
        ok: false,
        error: "Order already marked as sent to refinery",
      });
    }

    // --- 3) Find the successful payment row (for confirmation details) ---
    const { data: paymentRow, error: paymentError } = await supabase
      .from("payments")
      .select(
        "created_at, amount, currency, status, pi_id, cs_id"
      )
      .eq("order_id", o.id)
      .in("status", ["paid", "succeeded"] as any)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (paymentError) {
      console.error(
        "[send-refinery-order] payment query error:",
        paymentError
      );
    }

    const p = (paymentRow || null) as PaymentRow | null;

    // --- 4) Compute the amount refinery should see (hide commission) ---
    const totalPence = o.total_pence ?? null;
    const unitPence = o.unit_price_pence ?? null;

    let totalRefineryGbp: number | null = null;
    let unitRefineryGbp: number | null = null;

    if (totalPence != null) {
      const pct = getCommissionPercent(o.fuel);
      const commissionPence = Math.round(totalPence * (pct / 100));
      const refineryPence = totalPence - commissionPence;
      totalRefineryGbp = refineryPence / 100;
    }

    if (unitPence != null) {
      const pct = getCommissionPercent(o.fuel);
      const commissionPerLitre = Math.round(unitPence * (pct / 100));
      const refineryUnitPence = unitPence - commissionPerLitre;
      unitRefineryGbp = refineryUnitPence / 100;
    }

    const refineryOrder: OkResponse["refineryOrder"] = {
      orderId: o.id,
      customerName: o.name,
      customerEmail: o.user_email,
      address: {
        line1: o.address_line1,
        line2: o.address_line2,
        city: o.city,
        postcode: o.postcode,
      },
      fuel: (o.fuel || "") as string | null,
      litres: o.litres,
      unitPriceRefineryGbp: unitRefineryGbp,
      totalRefineryGbp,
      deliveryDate: o.delivery_date,
      payment: p
        ? {
            paidAt: p.created_at,
            stripePiId: p.pi_id,
            stripeSessionId: p.cs_id,
            currency: p.currency || "GBP",
            grossAmountGbp: toGbp(p.amount),
          }
        : null,
      invoiceStoragePath: o.refinery_invoice_storage_path,
    };

    // --- 5) Build the HTML email (similar structure to your invoices) ---
    const html = buildRefineryEmailHtml({ refineryOrder });

    const subject = `New paid fuel order – ${refineryOrder.fuel || "Fuel"} – ${
      refineryOrder.litres ?? ""
    }L – ${refineryOrder.orderId}`;

    const { error: emailError } = await resend.emails.send({
      from: fromEmail,
      to: refineryTo,
      subject,
      html,
    });

    if (emailError) {
      console.error("[send-refinery-order] email send error:", emailError);
      return res
        .status(500)
        .json({ ok: false, error: "Failed to send refinery email" });
    }

    // --- 6) Mark the order as "sent" (so we don't send twice) ---
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        refinery_notification_status: "sent",
        refinery_notified_at: new Date().toISOString(),
      } as any)
      .eq("id", o.id);

    if (updateError) {
      console.error(
        "[send-refinery-order] failed to update order status:",
        updateError
      );
      return res
        .status(500)
        .json({ ok: false, error: "Failed to update order status" });
    }

    return res.status(200).json({
      ok: true,
      refineryOrder,
    });
  } catch (err: any) {
    console.error("[send-refinery-order] crash:", err);
    return res
      .status(500)
      .json({ ok: false, error: err?.message || "Server error" });
  }
}


