// src/pages/api/refinery/send-ready-orders.ts
// Sends paid orders (without commission) to the refinery by email.

import type { NextApiRequest, NextApiResponse } from "next";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

type OrderForRefinery = {
  id: string;
  user_email: string | null;
  name: string | null;
  fuel: string | null;
  litres: number | null;
  delivery_date: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postcode: string | null;
  refinery_invoice_storage_path: string | null;
};

const resendApiKey = process.env.RESEND_API_KEY || "";
const refineryEmail = process.env.REFINERY_ORDER_EMAIL || "";
const refinerySecret = process.env.REFINERY_SEND_SECRET || "";

const resend = new Resend(resendApiKey);

// Supabase server client (service role – server only)
function sb() {
  return createClient(
    (process.env.SUPABASE_URL as string) ||
      (process.env.NEXT_PUBLIC_SUPABASE_URL as string),
    process.env.SUPABASE_SERVICE_ROLE_KEY as string
  );
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // 1) Only allow POST
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 2) Simple secret header to protect this endpoint
  const headerSecret = req.headers["x-refinery-secret"];
  if (!headerSecret || headerSecret !== refinerySecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!resendApiKey || !refineryEmail) {
    return res.status(500).json({
      error:
        "Missing RESEND_API_KEY or REFINERY_ORDER_EMAIL environment variables",
    });
  }

  try {
    const supabase = sb();

    // 3) Fetch orders that are ready to send
    const { data: orders, error } = await supabase
      .from("orders")
      .select(
        "id,user_email,name,fuel,litres,delivery_date,address_line1,address_line2,city,postcode,refinery_invoice_storage_path"
      )
      .eq("refinery_notification_status", "ready")
      .limit(20); // send max 20 at a time

    if (error) {
      console.error("[refinery] select error:", error);
      return res.status(500).json({ error: "Failed to load orders" });
    }

    if (!orders || orders.length === 0) {
      return res.status(200).json({ ok: true, sent: 0 });
    }

    const results: { id: string; ok: boolean; error?: string }[] = [];

    for (const row of orders as OrderForRefinery[]) {
      const orderId = row.id;
      try {
        // 4) Build a public link to the invoice PDF (optional)
        let invoiceUrl: string | null = null;
        if (row.refinery_invoice_storage_path) {
          const { data: urlData } = supabase.storage
            .from("invoices")
            .getPublicUrl(row.refinery_invoice_storage_path);
          invoiceUrl = urlData?.publicUrl ?? null;
        }

        // 5) Build a simple, commission-free order email
        const litres = row.litres ?? 0;
        const fuel = (row.fuel || "").toUpperCase();
        const deliveryDate = row.delivery_date || "N/A";

        const subject = `New FuelFlow order ${orderId} – ${litres}L ${fuel}`;

        const html = `
          <p>Dear Refinery Team,</p>

          <p>A new paid order has been placed via FuelFlow. Please arrange delivery as per the details below.</p>

          <h3>Order details</h3>
          <ul>
            <li><strong>Order ID:</strong> ${orderId}</li>
            <li><strong>Fuel:</strong> ${fuel}</li>
            <li><strong>Litres:</strong> ${litres}</li>
            <li><strong>Requested delivery date:</strong> ${deliveryDate}</li>
          </ul>

          <h3>Customer details</h3>
          <ul>
            <li><strong>Name:</strong> ${row.name || "Customer"}</li>
            <li><strong>Email:</strong> ${row.user_email || "N/A"}</li>
            <li><strong>Address:</strong><br/>
              ${row.address_line1 || ""}<br/>
              ${row.address_line2 || ""}<br/>
              ${row.city || ""} ${row.postcode || ""}
            </li>
          </ul>

          <h3>Payment</h3>
          <p>
            The customer has paid FuelFlow in full via Stripe for this order.
            Please supply the fuel as per your agreement with FuelFlow.
          </p>

          ${
            invoiceUrl
              ? `<p>You can view the customer invoice here (for your reference – commission is not shown):<br/>
                 <a href="${invoiceUrl}">${invoiceUrl}</a></p>`
              : ""
          }

          <p>Best regards,<br/>FuelFlow</p>
        `;

        // 6) Send email (NO commission values inside)
        await resend.emails.send({
          from: "orders@fuelflow.co.uk", // use a verified sender
          to: refineryEmail,
          subject,
          html,
        });

        // 7) Mark order as sent
        const { error: updateError } = await supabase
          .from("orders")
          .update({
            refinery_notification_status: "sent",
            refinery_notified_at: new Date().toISOString(),
          })
          .eq("id", orderId);

        if (updateError) {
          console.error("[refinery] update error:", updateError);
          results.push({
            id: orderId,
            ok: false,
            error: updateError.message,
          });
        } else {
          results.push({ id: orderId, ok: true });
        }
      } catch (err: any) {
        console.error("[refinery] send crash for order", orderId, err);
        results.push({
          id: orderId,
          ok: false,
          error: err?.message || String(err),
        });
      }
    }

    return res.status(200).json({
      ok: true,
      sent: results.filter((r) => r.ok).length,
      results,
    });
  } catch (err: any) {
    console.error("[refinery] handler error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}
