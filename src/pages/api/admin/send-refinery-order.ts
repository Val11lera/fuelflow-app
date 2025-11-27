// src/pages/api/admin/send-refinery-order.ts
// src/pages/api/admin/send-refinery-order.ts
// Creates a refinery-friendly "order sheet" email (no commission shown)
// and marks the order as sent to the refinery.

import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

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
    unitPriceGbp: number | null;
    totalCustomerGbp: number | null;
    totalForRefineryGbp: number | null;
    deliveryDate: string | null;
    invoiceStoragePath: string | null;
  };
};

type ErrorResponse = { ok: false; error: string };

export type SendRefineryOrderResponse = OkResponse | ErrorResponse;

export const config = {
  api: {
    bodyParser: true,
  },
};

// ----- Supabase (service role) -----

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

// Same % env vars you used in create-checkout-session
function getCommissionPercent(fuel: Fuel | null): number {
  if (fuel === "petrol") {
    return Number(process.env.PETROL_COMMISSION_PERCENT || "0");
  }
  if (fuel === "diesel") {
    return Number(process.env.DIESEL_COMMISSION_PERCENT || "0");
  }
  return 0;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SendRefineryOrderResponse>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (!process.env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY is not set");
    return res
      .status(500)
      .json({ ok: false, error: "Email configuration missing" });
  }

  const toEmail = process.env.REFINERY_NOTIFICATION_EMAIL;
  const fromEmail =
    process.env.REFINERY_FROM_EMAIL || "orders@mail.fuelflow.co.uk";

  if (!toEmail) {
    console.error("REFINERY_NOTIFICATION_EMAIL is not set");
    return res
      .status(500)
      .json({ ok: false, error: "Refinery notification email not configured" });
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

    // --- 1) Check this email is an admin (simple safety check) ---
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
      return res.status(404).json({ ok: false, error: "Order not found" });
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

    const totalPence = o.total_pence ?? null;
    const unitPence = o.unit_price_pence ?? null;

    const totalCustomerGbp =
      totalPence != null ? Math.round(totalPence) / 100 : null;
    const unitPriceGbp =
      unitPence != null ? Math.round(unitPence) / 100 : null;

    // --- 3) Compute the amount refinery should see (hide platform commission) ---
    let totalForRefineryGbp: number | null = null;
    if (totalPence != null) {
      const pct = getCommissionPercent(o.fuel);
      const commissionPence = Math.round(totalPence * (pct / 100));
      const refineryPence = totalPence - commissionPence;
      totalForRefineryGbp = refineryPence / 100;
    }

    // --- 4) Build refinery-friendly order sheet object (for JSON / logging) ---
    const refineryOrder = {
      orderId: o.id,
      customerName: o.name,
      customerEmail: o.user_email,
      address: {
        line1: o.address_line1,
        line2: o.address_line2,
        city: o.city,
        postcode: o.postcode,
      },
      fuel: o.fuel,
      litres: o.litres,
      unitPriceGbp,
      totalCustomerGbp,
      totalForRefineryGbp,
      deliveryDate: o.delivery_date,
      invoiceStoragePath: o.refinery_invoice_storage_path,
    };

    // --- 5) Compose email (branded, similar style to invoices) ---
    const companyName = process.env.COMPANY_NAME || "FuelFlow";
    const companyWebsite =
      process.env.COMPANY_WEBSITE || "https://fuelflow.co.uk";
    const companyLogoUrl = process.env.COMPANY_LOGO_URL || "";
    const supportEmail =
      process.env.SUPPORT_EMAIL || "support@fuelflow.co.uk";

    const subject = `${companyName} – refinery order ${o.id} (${
      o.fuel || ""
    } ${o.litres ?? ""}L)`;

    const addressLines = [
      o.address_line1,
      o.address_line2,
      [o.city, o.postcode].filter(Boolean).join(" "),
    ]
      .filter(Boolean)
      .join("<br />");

    const deliveryDateLabel = o.delivery_date
      ? new Date(o.delivery_date).toLocaleDateString("en-GB")
      : "As soon as possible";

    const unitPriceDisplay =
      unitPriceGbp != null ? `£${unitPriceGbp.toFixed(3)}` : "—";

    const totalCustomerDisplay =
      totalCustomerGbp != null ? `£${totalCustomerGbp.toFixed(2)}` : "—";

    const totalRefineryDisplay =
      totalForRefineryGbp != null
        ? `£${totalForRefineryGbp.toFixed(2)}`
        : "—";

    const html = `
      <div style="background:#f3f4f6; padding:24px 0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; color:#111827;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td align="center">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:720px; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 8px 24px rgba(15,23,42,0.08);">
                <tr>
                  <td style="padding:20px 24px; border-bottom:1px solid #e5e7eb; background:#0f172a;">
                    <table role="presentation" width="100%">
                      <tr>
                        <td style="vertical-align:middle;">
                          ${
                            companyLogoUrl
                              ? `<img src="${companyLogoUrl}" alt="${companyName}" style="height:32px; max-width:180px; display:block;" />`
                              : `<span style="display:inline-block; font-size:18px; font-weight:600; color:#f9fafb;">${companyName}</span>`
                          }
                        </td>
                        <td style="text-align:right; vertical-align:middle;">
                          <span style="display:inline-block; font-size:12px; text-transform:uppercase; letter-spacing:0.08em; color:#9ca3af;">
                            Refinery order confirmation
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:24px;">
                    <p style="margin:0 0 16px 0; font-size:16px; font-weight:600;">New FuelFlow order</p>
                    <p style="margin:0 0 20px 0; font-size:14px; color:#4b5563;">
                      Please find the order details below. Commission amounts are excluded –
                      all totals shown are the amounts <strong>payable to the refinery</strong>.
                    </p>

                    <!-- Key summary bar -->
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px 0; border-collapse:collapse;">
                      <tr>
                        <td style="padding:10px 12px; font-size:12px; text-transform:uppercase; letter-spacing:0.06em; color:#6b7280; border-radius:8px 0 0 8px; border:1px solid #e5e7eb; border-right:none;">
                          Product
                          <div style="margin-top:4px; font-size:14px; font-weight:500; color:#111827; text-transform:capitalize;">
                            ${o.fuel || "—"}
                          </div>
                        </td>
                        <td style="padding:10px 12px; font-size:12px; text-transform:uppercase; letter-spacing:0.06em; color:#6b7280; border:1px solid #e5e7eb; border-right:none;">
                          Litres
                          <div style="margin-top:4px; font-size:14px; font-weight:500; color:#111827;">
                            ${o.litres ?? "—"}
                          </div>
                        </td>
                        <td style="padding:10px 12px; font-size:12px; text-transform:uppercase; letter-spacing:0.06em; color:#6b7280; border:1px solid #e5e7eb; border-right:none;">
                          Delivery date
                          <div style="margin-top:4px; font-size:14px; font-weight:500; color:#111827;">
                            ${deliveryDateLabel}
                          </div>
                        </td>
                        <td style="padding:10px 12px; font-size:12px; text-transform:uppercase; letter-spacing:0.06em; color:#6b7280; border:1px solid #e5e7eb; border-radius:0 8px 8px 0; background:#f9fafb;">
                          Total payable to refinery
                          <div style="margin-top:4px; font-size:16px; font-weight:700; color:#111827;">
                            ${totalRefineryDisplay}
                          </div>
                        </td>
                      </tr>
                    </table>

                    <!-- Detailed table -->
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse; font-size:14px; margin-bottom:8px;">
                      <tbody>
                        <tr>
                          <td style="padding:6px 4px; font-weight:600; color:#4b5563; width:160px;">Order reference</td>
                          <td style="padding:6px 4px; color:#111827;">${o.id}</td>
                        </tr>
                        <tr>
                          <td style="padding:6px 4px; font-weight:600; color:#4b5563;">Customer</td>
                          <td style="padding:6px 4px; color:#111827;">
                            ${o.name || "—"}${
      o.user_email
        ? ` <span style="color:#6b7280;">(${o.user_email})</span>`
        : ""
    }
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:6px 4px; font-weight:600; color:#4b5563;">Delivery address</td>
                          <td style="padding:6px 4px; color:#111827;">${
                            addressLines || "—"
                          }</td>
                        </tr>
                        <tr>
                          <td style="padding:6px 4px; font-weight:600; color:#4b5563;">Unit price (customer)</td>
                          <td style="padding:6px 4px; color:#111827;">${unitPriceDisplay}</td>
                        </tr>
                        <tr>
                          <td style="padding:6px 4px; font-weight:600; color:#4b5563;">Total paid by customer</td>
                          <td style="padding:6px 4px; color:#111827;">${totalCustomerDisplay}</td>
                        </tr>
                        <tr>
                          <td style="padding:6px 4px; font-weight:600; color:#4b5563;">Total payable to refinery</td>
                          <td style="padding:6px 4px; color:#111827; font-weight:600;">${totalRefineryDisplay}</td>
                        </tr>
                      </tbody>
                    </table>

                    <p style="margin:16px 0 4px 0; font-size:13px; color:#6b7280;">
                      This order has already been <strong>paid in full by the customer via ${companyName}</strong>.
                    </p>
                    <p style="margin:0 0 16px 0; font-size:13px; color:#6b7280;">
                      Please arrange delivery and invoice ${companyName} for the
                      <strong>"Total payable to refinery"</strong> amount only.
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style="padding:14px 24px; border-top:1px solid #e5e7eb; background:#f9fafb;">
                    <table role="presentation" width="100%">
                      <tr>
                        <td style="font-size:11px; color:#6b7280;">
                          ${companyName} &middot;
                          <a href="${companyWebsite}" style="color:#4b5563; text-decoration:none;">${companyWebsite.replace(
                            /^https?:\/\//,
                            ""
                          )}</a>
                          ${
                            supportEmail
                              ? `&middot; <a href="mailto:${supportEmail}" style="color:#4b5563; text-decoration:none;">${supportEmail}</a>`
                              : ""
                          }
                        </td>
                        <td style="text-align:right; font-size:11px; color:#9ca3af;">
                          Ref: ${o.id}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </div>
    `;

    const text = `
New refinery order from ${companyName}

Order reference: ${o.id}
Customer: ${o.name || "—"} (${o.user_email || "—"})
Delivery address:
  ${o.address_line1 || ""}
  ${o.address_line2 || ""}
  ${[o.city || "", o.postcode || ""].filter(Boolean).join(" ")}

Delivery date: ${deliveryDateLabel}
Product: ${o.fuel || "—"}
Litres: ${o.litres ?? "—"}
Unit price (customer): ${unitPriceDisplay}
Total paid by customer: ${totalCustomerDisplay}
Total payable to refinery: ${totalRefineryDisplay}

This order has already been paid in full by the customer via ${companyName}.
Please arrange delivery and invoice ${companyName} for the "Total payable to refinery" amount only.
    `.trim();

    // --- 6) Send email via Resend ---
    const resend = new Resend(process.env.RESEND_API_KEY);

    const emailResult = await resend.emails.send({
      from: fromEmail,
      to: toEmail,
      subject,
      html,
      text,
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

    // --- 7) Mark the order as "sent" (so we don't send twice) ---
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

    // Done
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

