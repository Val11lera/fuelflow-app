// src/pages/api/admin/send-refinery-order.ts
// src/pages/api/admin/send-refinery-order.ts
// Creates a refinery-friendly "order sheet" (no commission shown),
// emails it to the refinery (via Resend) WITH a PDF attachment,
// and marks the order as sent.

import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { buildRefineryOrderPdf } from "@/lib/refinery-order-pdf";

type Fuel = "petrol" | "diesel";

type OrderRow = {
  id: string;
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

type Body = {
  orderId?: string;
  adminEmail?: string; // email of the admin clicking the button
};

type OkResponse = { ok: true };
type ErrorResponse = { ok: false; error: string };
export type SendRefineryOrderResponse = OkResponse | ErrorResponse;

/* ---------- Supabase admin client ---------- */
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

/* ---------- Commission helpers (to HIDE it) ---------- */
// Same % env vars you used in create-checkout-session
function getCommissionPercent(fuel: Fuel | string | null): number {
  const f = (fuel || "").toString().toLowerCase();
  if (f === "petrol")
    return Number(process.env.PETROL_COMMISSION_PERCENT || "0");
  if (f === "diesel")
    return Number(process.env.DIESEL_COMMISSION_PERCENT || "0");
  return 0;
}

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

function fmtMoney(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return "—";
  return gbp.format(v);
}

/* ---------- Resend client ---------- */
function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set");
  }
  return new Resend(apiKey);
}

function getFromEmail() {
  return (
    process.env.REFINERY_FROM_EMAIL ||
    process.env.MAIL_FROM ||
    "orders@mail.fuelflow.co.uk"
  );
}

function getRefineryToEmail() {
  // You can set this to the actual refinery address in production
  return (
    process.env.REFINERY_NOTIFICATION_EMAIL ||
    process.env.SUPPORT_EMAIL ||
    "support@fuelflow.co.uk"
  );
}

/* ---------- HTML renderer (no commission) ---------- */
function renderRefineryOrderHtml(opts: {
  orderId: string;
  fuel: string | null;
  litres: number | null;
  deliveryDate: string | null;
  customerName: string | null;
  customerEmail: string | null;
  address: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    postcode: string | null;
  };
  unitPriceGbp: number | null;
  totalCustomerGbp: number | null;
  totalForRefineryGbp: number | null;
}) {
  const {
    orderId,
    fuel,
    litres,
    deliveryDate,
    customerName,
    customerEmail,
    address,
    unitPriceGbp,
    totalCustomerGbp,
    totalForRefineryGbp,
  } = opts;

  const deliveryDateStr = deliveryDate
    ? new Date(deliveryDate).toLocaleDateString("en-GB")
    : "Not set";

  const addrLines = [
    address.line1,
    address.line2,
    address.city,
    address.postcode,
  ]
    .filter(Boolean)
    .join("<br />");

  const productLabel = fuel ? fuel[0].toUpperCase() + fuel.slice(1) : "—";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>FuelFlow refinery order ${orderId}</title>
<style>
  body {
    margin: 0;
    padding: 0;
    background: #f2f4f8;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #111827;
  }
  .wrapper {
    max-width: 720px;
    margin: 0 auto;
    padding: 24px 12px 40px;
  }
  .card {
    background: #ffffff;
    border-radius: 12px;
    box-shadow: 0 18px 40px rgba(15, 23, 42, 0.22);
    overflow: hidden;
    border: 1px solid #e5e7eb;
  }
  .header {
    background: #020617;
    color: #ffffff;
    padding: 18px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .brand-badge {
    width: 30px;
    height: 30px;
    border-radius: 999px;
    background: radial-gradient(circle at 30% 10%, #facc15, #f97316);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
  }
  .brand-badge span {
    color: #020617;
  }
  .header-title {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: #a5b4fc;
    font-weight: 500;
  }
  .body {
    padding: 24px 24px 10px;
  }
  h1 {
    font-size: 20px;
    margin: 0 0 8px;
  }
  p {
    margin: 0 0 8px;
    font-size: 13px;
    line-height: 1.6;
  }
  .muted {
    color: #6b7280;
  }
  .summary-grid {
    margin-top: 16px;
    border-radius: 10px;
    border: 1px solid #e5e7eb;
    overflow: hidden;
  }
  .summary-row {
    display: flex;
    background: #f9fafb;
  }
  .summary-cell {
    flex: 1;
    padding: 10px 14px;
    border-right: 1px solid #e5e7eb;
  }
  .summary-cell:last-child {
    border-right: none;
  }
  .summary-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #6b7280;
    margin-bottom: 4px;
  }
  .summary-value {
    font-size: 14px;
    font-weight: 600;
    color: #111827;
  }
  .summary-value-emph {
    font-size: 16px;
    font-weight: 700;
    color: #0f172a;
  }
  .section {
    margin-top: 20px;
    padding-top: 14px;
    border-top: 1px solid #e5e7eb;
  }
  .field-row {
    margin-bottom: 10px;
  }
  .field-label {
    font-size: 11px;
    font-weight: 600;
    color: #6b7280;
    margin-bottom: 2px;
  }
  .field-value {
    font-size: 13px;
    color: #111827;
  }
  .footer-note {
    margin-top: 18px;
    padding: 10px 12px;
    background: #fef3c7;
    border-radius: 8px;
    font-size: 11px;
    color: #92400e;
  }
  .footer-note b {
    font-weight: 700;
  }
  .page-footer {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid #e5e7eb;
    font-size: 11px;
    color: #6b7280;
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 6px;
  }
  .page-footer a {
    color: #4b5563;
    text-decoration: none;
  }
</style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <div class="brand">
          <div class="brand-badge"><span>⛽️</span></div>
          <div>FuelFlow</div>
        </div>
        <div class="header-title">Refinery order confirmation</div>
      </div>

      <div class="body">
        <h1>New FuelFlow order</h1>
        <p class="muted">
          Please find the order details below.
          Commission amounts are excluded – all totals shown are the amounts
          <b>payable to the refinery</b>.
        </p>

        <div class="summary-grid">
          <div class="summary-row">
            <div class="summary-cell">
              <div class="summary-label">Product</div>
              <div class="summary-value">${productLabel}</div>
            </div>
            <div class="summary-cell">
              <div class="summary-label">Litres</div>
              <div class="summary-value">${litres ?? "—"}</div>
            </div>
            <div class="summary-cell">
              <div class="summary-label">Delivery date</div>
              <div class="summary-value">${deliveryDateStr}</div>
            </div>
            <div class="summary-cell">
              <div class="summary-label">Total payable to refinery</div>
              <div class="summary-value-emph">${fmtMoney(
                totalForRefineryGbp
              )}</div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="field-row">
            <div class="field-label">Order reference</div>
            <div class="field-value">${orderId}</div>
          </div>

          <div class="field-row">
            <div class="field-label">Customer</div>
            <div class="field-value">
              ${customerName || "—"}
              ${
                customerEmail
                  ? `(<a href="mailto:${customerEmail}">${customerEmail}</a>)`
                  : ""
              }
            </div>
          </div>

          <div class="field-row">
            <div class="field-label">Delivery address</div>
            <div class="field-value">${addrLines || "—"}</div>
          </div>

          <div class="field-row">
            <div class="field-label">Unit price (customer)</div>
            <div class="field-value">${fmtMoney(unitPriceGbp)}</div>
          </div>

          <div class="field-row">
            <div class="field-label">Total paid by customer</div>
            <div class="field-value">${fmtMoney(totalCustomerGbp)}</div>
          </div>

          <div class="field-row">
            <div class="field-label">Total payable to refinery</div>
            <div class="field-value"><b>${fmtMoney(
              totalForRefineryGbp
            )}</b></div>
          </div>
        </div>

        <div class="footer-note">
          This order has already been <b>paid in full by the customer via FuelFlow</b>.
          Please arrange delivery and invoice FuelFlow for the
          <b>"Total payable to refinery"</b> amount only.
        </div>

        <div class="page-footer">
          <span>FuelFlow · <a href="https://fuelflow.co.uk">fuelflow.co.uk</a> · <a href="mailto:support@fuelflow.co.uk">support@fuelflow.co.uk</a></span>
          <span>Ref: ${orderId}</span>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/* ---------- Handler ---------- */

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

    const supabase = sbAdmin();

    // 1) Check this email is an admin
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

    // 2) Load the order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(
        "id,user_email,fuel,litres,unit_price_pence,total_pence,delivery_date,name,address_line1,address_line2,city,postcode,status,refinery_notification_status,refinery_invoice_storage_path"
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

    if (o.refinery_notification_status === "sent") {
      return res.status(400).json({
        ok: false,
        error: "Order already marked as sent to refinery",
      });
    }

    const totalPence = o.total_pence ?? null;
    const unitPence = o.unit_price_pence ?? null;

    const totalCustomerGbp =
      totalPence != null ? Math.round(totalPence) / 100 : null;
    const unitPriceGbp =
      unitPence != null ? Math.round(unitPence) / 100 : null;

    // 3) Compute amount refinery should see (hide platform commission)
    let totalForRefineryGbp: number | null = null;
    if (totalPence != null) {
      const pct = getCommissionPercent(o.fuel);
      const commissionPence = Math.round(totalPence * (pct / 100));
      const refineryPence = totalPence - commissionPence;
      totalForRefineryGbp = refineryPence / 100;
    }

    const refineryOrderForPdf = {
      orderId: o.id,
      product: (o.fuel || "") as string,
      litres: o.litres,
      deliveryDate: o.delivery_date,
      customerName: o.name,
      customerEmail: o.user_email,
      address: {
        line1: o.address_line1,
        line2: o.address_line2,
        city: o.city,
        postcode: o.postcode,
      },
      unitPriceGbp,
      totalCustomerGbp,
      totalForRefineryGbp,
    };

    // 4) Build PDF
    const { pdfBuffer, filename } = await buildRefineryOrderPdf(
      refineryOrderForPdf
    );

    // 5) Build HTML email
    const html = renderRefineryOrderHtml(refineryOrderForPdf);
    const subject = `FuelFlow order ${o.id} – ${o.fuel || "fuel"} ${
      o.litres ?? ""
    }L`;

    const resend = getResend();
    const from = getFromEmail();
    const to = getRefineryToEmail();

    // 6) Send email via Resend with PDF attachment
    const emailResult = await resend.emails.send({
      from,
      to,
      subject,
      html,
      attachments: [
        {
          filename,
          content: pdfBuffer,
        },
      ],
      headers: {
        "X-Entity-Ref-ID": o.id,
      },
    });

    if (emailResult.error) {
      console.error(
        "[send-refinery-order] Resend error:",
        emailResult.error
      );
      return res
        .status(500)
        .json({ ok: false, error: "Failed to send refinery email" });
    }

    // 7) Mark the order as "sent" in DB
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

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("[send-refinery-order] crash:", err);
    return res
      .status(500)
      .json({ ok: false, error: err?.message || "Server error" });
  }
}

