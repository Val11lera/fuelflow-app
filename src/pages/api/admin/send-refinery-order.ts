// src/pages/api/admin/send-refinery-order.ts
// src/pages/api/admin/send-refinery-order.ts
// Creates a refinery-friendly order email + PDF (no commission or customer totals shown)
// and marks the order as sent to the refinery.

import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { buildRefineryOrderPdf, RefineryOrderForPdf } from "@/lib/refinery-order-pdf";

type Fuel = "petrol" | "diesel";

type OrderRow = {
  id: string;
  user_email: string | null;
  fuel: Fuel | null;
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
  adminEmail?: string;
};

type OkResponse = { ok: true };
type ErrorResponse = { ok: false; error: string };
export type SendRefineryOrderResponse = OkResponse | ErrorResponse;

/* ---------- Supabase (service role) ---------- */

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

/* ---------- Helpers ---------- */

function getCommissionPercent(fuel: Fuel | null): number {
  if (fuel === "petrol") {
    return Number(process.env.PETROL_COMMISSION_PERCENT || "0");
  }
  if (fuel === "diesel") {
    return Number(process.env.DIESEL_COMMISSION_PERCENT || "0");
  }
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

function fmtDate(dateIso: string | null) {
  if (!dateIso) return "Not set";
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return "Not set";
  return d.toLocaleDateString("en-GB");
}

/**
 * Simple refinery reference – just for their paperwork.
 * REF-YYYYMMDD-<last 6 of order id>
 */
function makeRefineryRef(orderId: string) {
  const d = new Date();
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const tail = orderId.replace(/[^A-Za-z0-9]/g, "").slice(-6) || "REF000";
  return `REF-${y}${m}${day}-${tail}`;
}

/**
 * HTML email body – **no unit price and no total paid by customer**;
 * only "Total payable to refinery".
 */
function renderRefineryOrderHtml(props: {
  product: string | null;
  litres: number | null;
  deliveryDate: string | null;
  orderId: string;
  refineryRef: string;
  customerName: string | null;
  customerEmail: string | null;
  addressLines: string;
  totalForRefineryGbp: number | null;
}) {
  const {
    product,
    litres,
    deliveryDate,
    orderId,
    refineryRef,
    customerName,
    customerEmail,
    addressLines,
    totalForRefineryGbp,
  } = props;

  const deliveryDateStr = fmtDate(deliveryDate);

  const customerLine = `${customerName || "—"}${
    customerEmail ? ` (${customerEmail})` : ""
  }`;

  return `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>New FuelFlow order</title>
      <style>
        body {
          margin: 0;
          padding: 0;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background-color: #f5f6fb;
          color: #14151f;
        }
        .outer {
          background-color: #f5f6fb;
          padding: 24px 0;
        }
        .card {
          max-width: 700px;
          margin: 0 auto;
          background-color: #ffffff;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.12);
        }
        .header {
          background-color: #050816;
          color: #ffffff;
          padding: 16px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .logo {
          font-size: 18px;
          font-weight: 600;
        }
        .header-right {
          font-size: 12px;
          opacity: 0.8;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .content {
          padding: 24px;
        }
        h1 {
          font-size: 18px;
          margin: 0 0 8px 0;
        }
        p {
          margin: 0 0 12px 0;
          font-size: 14px;
          line-height: 1.5;
        }
        .summary-table {
          width: 100%;
          border-collapse: collapse;
          margin: 18px 0 24px 0;
        }
        .summary-table th,
        .summary-table td {
          padding: 10px 12px;
          border: 1px solid #e2e4f0;
          font-size: 13px;
        }
        .summary-table th {
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-weight: 600;
          background-color: #f8f9ff;
          color: #4b5563;
        }
        .summary-table td {
          font-weight: 600;
        }
        .field-label {
          font-size: 12px;
          font-weight: 600;
          color: #4b5563;
          margin-bottom: 2px;
        }
        .field-value {
          font-size: 14px;
          color: #111827;
        }
        .field-row {
          margin-bottom: 12px;
        }
        .footer-note {
          margin-top: 18px;
          font-size: 12px;
          color: #4b5563;
        }
        .footer-note strong {
          font-weight: 600;
        }
        .footer-bar {
          margin-top: 24px;
          padding: 14px 24px;
          border-top: 1px solid #e5e7eb;
          font-size: 11px;
          color: #6b7280;
          background-color: #f9fafb;
        }
      </style>
    </head>
    <body>
      <div class="outer">
        <div class="card">
<div class="header">
  <div class="logo">
    <img
      src="https://dashboard.fuelflow.co.uk/logo-email.png"
      alt="FuelFlow"
    />
  </div>
  <div class="header-right">Refinery order confirmation</div>
</div>
          <div class="content">
            <h1>New FuelFlow order</h1>
            <p>
              Please find the order details below. Commission amounts are excluded –
              all totals shown are the amounts <strong>payable to the refinery</strong>.
            </p>

            <table class="summary-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Litres</th>
                  <th>Delivery date</th>
                  <th>Total payable to refinery</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>${product || "—"}</td>
                  <td>${litres != null ? litres : "—"}</td>
                  <td>${deliveryDateStr}</td>
                  <td>${fmtMoney(totalForRefineryGbp)}</td>
                </tr>
              </tbody>
            </table>

            <div class="field-row">
              <div class="field-label">Order reference</div>
              <div class="field-value">${orderId}</div>
            </div>

            <div class="field-row">
              <div class="field-label">Refinery reference</div>
              <div class="field-value">${refineryRef}</div>
            </div>

            <div class="field-row">
              <div class="field-label">Customer</div>
              <div class="field-value">${customerLine}</div>
            </div>

            <div class="field-row">
              <div class="field-label">Delivery address</div>
              <div class="field-value">${addressLines || "—"}</div>
            </div>

            <div class="field-row">
              <div class="field-label">Total payable to refinery</div>
              <div class="field-value">${fmtMoney(totalForRefineryGbp)}</div>
            </div>

            <div class="footer-note">
              This order has already been <strong>paid in full by the customer via FuelFlow</strong>.
              Please arrange delivery and invoice FuelFlow for the
              <strong>"Total payable to refinery"</strong> amount only.
            </div>
          </div>

          <div class="footer-bar">
            FuelFlow · fuelflow.co.uk · support@fuelflow.co.uk · Ref: ${orderId}
          </div>
        </div>
      </div>
    </body>
  </html>
  `;
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

    if (!process.env.RESEND_API_KEY) {
      return res
        .status(500)
        .json({ ok: false, error: "Missing RESEND_API_KEY env var" });
    }

    const refineryTo = process.env.REFINERY_NOTIFICATION_EMAIL;
    if (!refineryTo) {
      return res.status(500).json({
        ok: false,
        error: "Missing REFINERY_NOTIFICATION_EMAIL env var",
      });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const supabase = sbAdmin();

    // 1) Verify admin
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

    // 2) Load order
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
      return res
        .status(400)
        .json({ ok: false, error: "Order already marked as sent to refinery" });
    }

    // 3) Money calculations (no commission exposed)
    const totalPence = o.total_pence ?? null;
    const unitPence = o.unit_price_pence ?? null;

    const totalCustomerGbp =
      totalPence != null ? Math.round(totalPence) / 100 : null;
    const unitPriceGbp =
      unitPence != null ? Math.round(unitPence) / 100 : null;

    let totalForRefineryGbp: number | null = null;
    if (totalPence != null) {
      const pct = getCommissionPercent(o.fuel);
      const commissionPence = Math.round(totalPence * (pct / 100));
      const refineryPence = totalPence - commissionPence;
      totalForRefineryGbp = refineryPence / 100;
    }

    const addressLines = [
      o.address_line1,
      o.address_line2,
      o.city,
      o.postcode,
    ]
      .filter(Boolean)
      .join(", ");

    // 4) Build HTML email (no unit price, no customer-total)
    const refineryRef = makeRefineryRef(o.id);

    const html = renderRefineryOrderHtml({
      product: o.fuel,
      litres: o.litres,
      deliveryDate: o.delivery_date,
      orderId: o.id,
      refineryRef,
      customerName: o.name,
      customerEmail: o.user_email,
      addressLines,
      totalForRefineryGbp,
    });

    // 5) Build refinery PDF using dedicated helper
    const litresQty = o.litres ?? 0;
    const unitPriceForCustomer =
      litresQty && totalCustomerGbp != null
        ? totalCustomerGbp / litresQty
        : unitPriceGbp ?? 0;

const refineryPdfInput: RefineryOrderForPdf = {
  orderId: o.id,
  refineryRef,
  customerName: o.name,
  customerEmail: o.user_email,
    deliveryAddress: addressLines,      // ✅ use the correct key from RefineryOrderForPdf
  deliveryDate: o.delivery_date,
  product: o.fuel || "Fuel",
  litres: litresQty,
  unitPriceCustomerGbp: unitPriceForCustomer ?? 0,
  totalForRefineryGbp: totalForRefineryGbp ?? 0,
};


    const { pdfBuffer, filename: pdfFilename } =
      await buildRefineryOrderPdf(refineryPdfInput);

    // 6) Send email via Resend with PDF attached
    const subject = `FuelFlow order ${o.id} – ${o.fuel || "Fuel"} ${
      o.litres ?? ""
    }L`;

    const emailResult = await resend.emails.send({
      from:
        process.env.REFINERY_FROM_EMAIL ||
        `FuelFlow <orders@mail.fuelflow.co.uk>`,
      to: [refineryTo],
      subject,
      html,
      attachments: [
        {
          filename: pdfFilename || `refinery-order-${o.id}.pdf`,
          content: pdfBuffer.toString("base64"),
        },
      ],
    });

    if ((emailResult as any).error) {
      console.error(
        "[send-refinery-order] Resend error:",
        (emailResult as any).error
      );
      return res
        .status(500)
        .json({ ok: false, error: "Failed to send refinery email" });
    }

    // 7) Mark order as sent
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
      return res.status(500).json({
        ok: false,
        error:
          "Refinery email sent but failed to update order status in database",
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("[send-refinery-order] crash:", err);
    return res
      .status(500)
      .json({ ok: false, error: err?.message || "Server error" });
  }
}

