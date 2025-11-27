// src/pages/api/admin/send-refinery-order.ts
// Sends a net-of-commission order email to the refinery

import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import nodemailer from "nodemailer";

/* =========================
   Supabase + Stripe helpers
   ========================= */

function sb() {
  return createClient(
    (process.env.SUPABASE_URL as string) ||
      (process.env.NEXT_PUBLIC_SUPABASE_URL as string),
    process.env.SUPABASE_SERVICE_ROLE_KEY as string
  );
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

type OrderRow = {
  id: string;
  status: string | null;
  fuel: string | null;
  litres: number | null;
  total_pence: number | null;
  name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postcode: string | null;
  delivery_date: string | null;
  user_email: string | null;
  refinery_notification_status: string | null;
  refinery_notified_at: string | null;
  refinery_invoice_storage_path: string | null;
  stripe_payment_intent: string | null;
};

type Body = {
  orderId?: string;
};

type ResponseBody =
  | { ok: true; orderId: string; netAmountPence: number; emailSentTo: string }
  | { error: string };

/* =========================
   Nodemailer helper
   ========================= */

function getTransport() {
  if (!process.env.SMTP_HOST) {
    throw new Error("SMTP_HOST not set (email transport not configured)");
  }

  const port = Number(process.env.SMTP_PORT || "587");

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        }
      : undefined,
  });

  return transporter;
}

/* =========================
   Main handler
   ========================= */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>
) {
  // 1) Only allow POST
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 2) Check admin secret
  const secretHeader = req.headers["x-refinery-secret"];
  const expectedSecret = process.env.REFINERY_ORDER_SECRET;

  if (
    !expectedSecret ||
    !secretHeader ||
    secretHeader.toString() !== expectedSecret
  ) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // 3) Parse orderId
  const { orderId } = (req.body || {}) as Body;

  if (!orderId) {
    return res.status(400).json({ error: "Missing orderId" });
  }

  try {
    const supabase = sb();

    // 4) Load the order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(
        [
          "id",
          "status",
          "fuel",
          "litres",
          "total_pence",
          "name",
          "address_line1",
          "address_line2",
          "city",
          "postcode",
          "delivery_date",
          "user_email",
          "refinery_notification_status",
          "refinery_notified_at",
          "refinery_invoice_storage_path",
          "stripe_payment_intent",
        ].join(",")
      )
      .eq("id", orderId)
      .maybeSingle();

    if (orderError || !order) {
      console.error("[refinery] order lookup error:", orderError);
      return res.status(404).json({ error: "Order not found" });
    }

    const o = order as unknown as OrderRow;

    if (o.status !== "paid") {
      return res
        .status(400)
        .json({ error: "Order is not paid – cannot notify refinery" });
    }

    // 5) Work out net amount to refinery (no commission)
    let netAmountPence: number;

    if (!o.stripe_payment_intent) {
      // Fallback – no PI stored, use total_pence
      netAmountPence = Number(o.total_pence || 0);
    } else {
      const pi = await stripe.paymentIntents.retrieve(o.stripe_payment_intent);
      const total =
        (typeof pi.amount_received === "number"
          ? pi.amount_received
          : pi.amount) ?? 0;
      const appFee =
        typeof pi.application_fee_amount === "number"
          ? pi.application_fee_amount
          : 0;
      netAmountPence = total - appFee;
    }

    // 6) Build a link to the refinery PDF (same layout as customer invoice)
    let refineryUrl: string | null = null;
    if (o.refinery_invoice_storage_path) {
      const base =
        (process.env.SUPABASE_URL as string) ||
        (process.env.NEXT_PUBLIC_SUPABASE_URL as string);
      if (base) {
        refineryUrl = `${base.replace(
          /\/+$/,
          ""
        )}/storage/v1/object/public/invoices/${encodeURI(
          o.refinery_invoice_storage_path
        )}`;
      }
    }

    // 7) Compose email to refinery (no commission info)
    const refineryTo =
      process.env.REFINERY_ORDER_EMAIL_TO || "orders@refinery.example";

    const litres = Number(o.litres || 0);
    const fuel = (o.fuel || "fuel").toString().toUpperCase();
    const netGbp = (netAmountPence / 100).toFixed(2);
    const deliveryDate = o.delivery_date || "N/A";

    const subject = `Fuel order for ${litres}L ${fuel} – order ${o.id}`;

    const htmlLines: string[] = [];

    htmlLines.push(`<p>Dear Refinery,</p>`);
    htmlLines.push(
      `<p>Please supply the following fuel order. Payment has been received in full via FuelFlow.</p>`
    );

    htmlLines.push(`<h3>Order details</h3>`);
    htmlLines.push(`<ul>`);
    htmlLines.push(`<li><strong>Order ID:</strong> ${o.id}</li>`);
    htmlLines.push(`<li><strong>Fuel:</strong> ${fuel}</li>`);
    htmlLines.push(`<li><strong>Litres:</strong> ${litres}</li>`);
    htmlLines.push(
      `<li><strong>Net amount to refinery:</strong> £${netGbp}</li>`
    );
    htmlLines.push(`<li><strong>Requested delivery date:</strong> ${deliveryDate}</li>`);
    htmlLines.push(`</ul>`);

    htmlLines.push(`<h3>Customer details</h3>`);
    htmlLines.push(`<ul>`);
    htmlLines.push(`<li><strong>Name:</strong> ${o.name || "N/A"}</li>`);
    htmlLines.push(
      `<li><strong>Email:</strong> ${o.user_email || "N/A"}</li>`
    );
    htmlLines.push(`<li><strong>Address line 1:</strong> ${o.address_line1 || "N/A"}</li>`);
    if (o.address_line2) {
      htmlLines.push(
        `<li><strong>Address line 2:</strong> ${o.address_line2}</li>`
      );
    }
    htmlLines.push(`<li><strong>City:</strong> ${o.city || "N/A"}</li>`);
    htmlLines.push(`<li><strong>Postcode:</strong> ${o.postcode || "N/A"}</li>`);
    htmlLines.push(`</ul>`);

    if (refineryUrl) {
      htmlLines.push(
        `<p>You can download the order PDF here (same layout as the customer invoice, but net of commission):</p>`
      );
      htmlLines.push(
        `<p><a href="${refineryUrl}" target="_blank" rel="noopener">Download order PDF</a></p>`
      );
    }

    htmlLines.push(`<p>Best regards,<br/>FuelFlow</p>`);

    const html = htmlLines.join("\n");

    const text = [
      "Dear Refinery,",
      "",
      "Please supply the following fuel order. Payment has been received in full via FuelFlow.",
      "",
      "Order details",
      `- Order ID: ${o.id}`,
      `- Fuel: ${fuel}`,
      `- Litres: ${litres}`,
      `- Net amount to refinery: £${netGbp}`,
      `- Requested delivery date: ${deliveryDate}`,
      "",
      "Customer details",
      `- Name: ${o.name || "N/A"}`,
      `- Email: ${o.user_email || "N/A"}`,
      `- Address line 1: ${o.address_line1 || "N/A"}`,
      ...(o.address_line2 ? [`- Address line 2: ${o.address_line2}`] : []),
      `- City: ${o.city || "N/A"}`,
      `- Postcode: ${o.postcode || "N/A"}`,
      "",
      refineryUrl ? `Order PDF: ${refineryUrl}` : "",
      "",
      "Best regards,",
      "FuelFlow",
    ].join("\n");

    const from =
      process.env.SMTP_FROM || "orders@fuelflow.co.uk";

    // 8) Send the email
    const transporter = getTransport();

    await transporter.sendMail({
      from,
      to: refineryTo,
      subject,
      text,
      html,
    });

    // 9) Update order status so we don’t send twice
    await supabase
      .from("orders")
      .update({
        refinery_notification_status: "sent",
        refinery_notified_at: new Date().toISOString(),
      } as any)
      .eq("id", o.id);

    return res.status(200).json({
      ok: true,
      orderId: o.id,
      netAmountPence,
      emailSentTo: refineryTo,
    });
  } catch (err: any) {
    console.error("[refinery] send-refinery-order error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}
