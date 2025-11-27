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

type RefOrder = {
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

type OkResponse = { ok: true; refineryOrder: RefOrder };
type ErrorResponse = { ok: false; error: string };

export type SendRefineryOrderResponse = OkResponse | ErrorResponse;

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

    // --- ENV CHECKS (gives clear errors in the popup) ---
    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.REFINERY_FROM_EMAIL;
    const refineryEmail = process.env.REFINERY_NOTIFICATION_EMAIL;

    if (!resendApiKey) {
      return res
        .status(500)
        .json({ ok: false, error: "Missing RESEND_API_KEY env var" });
    }
    if (!fromEmail) {
      return res
        .status(500)
        .json({ ok: false, error: "Missing REFINERY_FROM_EMAIL env var" });
    }
    if (!refineryEmail) {
      return res.status(500).json({
        ok: false,
        error: "Missing REFINERY_NOTIFICATION_EMAIL env var",
      });
    }

    const resend = new Resend(resendApiKey);
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

    // --- 3) Compute amount refinery sees (no commission) ---
    let totalForRefineryGbp: number | null = null;
    if (totalPence != null) {
      const pct = getCommissionPercent(o.fuel);
      const commissionPence = Math.round(totalPence * (pct / 100));
      const refineryPence = totalPence - commissionPence;
      totalForRefineryGbp = refineryPence / 100;
    }

    // --- 4) Build refinery-friendly order object ---
    const refineryOrder: RefOrder = {
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

    // --- 5) Compose email (similar layout style to your invoices) ---
    const subject = `FuelFlow order ${o.id} - ${o.fuel || ""} ${
      o.litres ?? ""
    }L`;

    const addressLines = [
      o.address_line1,
      o.address_line2,
      [o.city, o.postcode].filter(Boolean).join(" "),
    ]
      .filter(Boolean)
      .join("<br />");

    const html = `
      <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color:#0b1220; font-size:14px; line-height:1.5;">
        <h1 style="font-size:18px; margin-bottom:6px;">New FuelFlow order</h1>
        <p style="margin-top:0; margin-bottom:16px;">
          Please find the order details below. Commission amounts are excluded – totals shown are the amounts payable to the refinery.
        </p>

        <table style="border-collapse:collapse; width:100%; max-width:640px;">
          <tbody>
            <tr>
              <td style="padding:4px 8px; font-weight:600;">Order reference</td>
              <td style="padding:4px 8px;">${o.id}</td>
            </tr>
            <tr>
              <td style="padding:4px 8px; font-weight:600;">Customer</td>
              <td style="padding:4px 8px;">${o.name || "—"} (${o.user_email || "—"})</td>
            </tr>
            <tr>
              <td style="padding:4px 8px; font-weight:600;">Delivery address</td>
              <td style="padding:4px 8px;">${addressLines || "—"}</td>
            </tr>
            <tr>
              <td style="padding:4px 8px; font-weight:600;">Delivery date</td>
              <td style="padding:4px 8px;">${
                o.delivery_date
                  ? new Date(o.delivery_date).toLocaleDateString("en-GB")
                  : "As soon as possible"
              }</td>
            </tr>
            <tr>
              <td style="padding:4px 8px; font-weight:600;">Product</td>
              <td style="padding:4px 8px; text-transform:capitalize;">${
                o.fuel || "—"
              }</td>
            </tr>
            <tr>
              <td style="padding:4px 8px; font-weight:600;">Litres</td>
              <td style="padding:4px 8px;">${o.litres ?? "—"}</td>
            </tr>
            <tr>
              <td style="padding:4px 8px; font-weight:600;">Unit price (customer)</td>
              <td style="padding:4px 8px;">${
                unitPriceGbp != null ? `£${unitPriceGbp.toFixed(3)}` : "—"
              }</td>
            </tr>
            <tr>
              <td style="padding:4px 8px; font-weight:600;">Total paid by customer</td>
              <td style="padding:4px 8px;">${
                totalCustomerGbp != null ? `£${totalCustomerGbp.toFixed(2)}` : "—"
              }</td>
            </tr>
            <tr>
              <td style="padding:4px 8px; font-weight:600;">Total payable to refinery</td>
              <td style="padding:4px 8px; font-weight:600;">${
                totalForRefineryGbp != null
                  ? `£${totalForRefineryGbp.toFixed(2)}`
                  : "—"
              }</td>
            </tr>
          </tbody>
        </table>

        <p style="margin-top:16px; font-size:12px; color:#6b7280;">
          This order has already been paid by the customer via FuelFlow. Please arrange delivery and invoice FuelFlow for the
          <strong>“Total payable to refinery”</strong> amount only.
        </p>
      </div>
    `;

    const text = `
New FuelFlow order

Order reference: ${o.id}
Customer: ${o.name || "—"} (${o.user_email || "—"})
Delivery address:
  ${o.address_line1 || ""}
  ${o.address_line2 || ""}
  ${[o.city || "", o.postcode || ""].filter(Boolean).join(" ")}

Delivery date: ${
      o.delivery_date
        ? new Date(o.delivery_date).toLocaleDateString("en-GB")
        : "As soon as possible"
    }
Product: ${o.fuel || "—"}
Litres: ${o.litres ?? "—"}
Unit price (customer): ${
      unitPriceGbp != null ? `£${unitPriceGbp.toFixed(3)}` : "—"
    }
Total paid by customer: ${
      totalCustomerGbp != null ? `£${totalCustomerGbp.toFixed(2)}` : "—"
    }
Total payable to refinery: ${
      totalForRefineryGbp != null ? `£${totalForRefineryGbp.toFixed(2)}` : "—"
    }

This order has already been paid by the customer via FuelFlow.
Please arrange delivery and invoice FuelFlow for the "Total payable to refinery" amount only.
    `.trim();

    // --- 6) Send email via Resend ---
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: fromEmail,
      to: refineryEmail,
      subject,
      html,
      text,
    });

    if (emailError) {
      console.error("[send-refinery-order] Resend error:", emailError);
      return res.status(500).json({
        ok: false,
        error:
          emailError.message ||
          "Failed to send refinery email (Resend error)",
      });
    }

    if (!emailData?.id) {
      console.error(
        "[send-refinery-order] Resend returned no email id:",
        emailData
      );
      return res.status(500).json({
        ok: false,
        error: "Failed to send refinery email (no id returned)",
      });
    }

    // --- 7) Mark the order as "sent" only after email succeeds ---
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
          "Email sent but failed to update order status in database. Please check Supabase.",
      });
    }

    return res.status(200).json({
      ok: true,
      refineryOrder,
    });
  } catch (err: any) {
    console.error("[send-refinery-order] crash:", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Server error",
    });
  }
}


