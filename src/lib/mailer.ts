// src/lib/mailer.ts
// src/lib/mailer.ts
import "server-only";
import { Resend } from "resend";

/** Ensure the SDK is only initialised on the server and env is present */
const RESEND_API_KEY = process.env.RESEND_API_KEY;
if (!RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY is missing. Add it in Vercel → Env Vars.");
}
export const resend = new Resend(RESEND_API_KEY);

export type InvoiceEmailParams = {
  to: string;                 // recipient email
  invoiceNumber: string;      // e.g. FF-2025-00123
  orderId: string;            // DB order id
  totalGBP: string;           // already formatted, e.g. £1,234.56
  signedUrl?: string;         // optional view-online link
  pdf: Buffer;                // PDF bytes (from PDFKit)
};

/**
 * Sends the payment confirmation email with the PDF invoice attached.
 * Uses Resend (no SMTP password needed).
 */
export async function sendInvoiceEmail(p: InvoiceEmailParams) {
  const from =
    process.env.RESEND_FROM || "FuelFlow <no-reply@fuelflow.co.uk>";
  const site =
    process.env.NEXT_PUBLIC_SITE_URL || "https://dashboard.fuelflow.co.uk";

  const subject = `FuelFlow payment received — Invoice ${p.invoiceNumber}`;

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;line-height:1.45">
      <h2 style="margin:0 0 10px">Payment received</h2>
      <p style="margin:0 0 12px">Thanks for your payment. Your invoice <b>${p.invoiceNumber}</b> is attached.</p>
      <p style="margin:0 0 12px">Total: <b>${p.totalGBP}</b></p>
      ${p.signedUrl ? `<p style="margin:0 0 12px">View online: <a href="${p.signedUrl}">${p.invoiceNumber}.pdf</a></p>` : ""}
      <p style="margin:16px 0 0">You can also view invoices in your dashboard: <a href="${site}/documents">${site}/documents</a></p>
      <p style="margin-top:16px;font-size:12px;color:#666">Order reference: ${p.orderId}</p>
    </div>
  `;

  const text =
    `Payment received.\n\n` +
    `Invoice: ${p.invoiceNumber}\n` +
    `Total: ${p.totalGBP}\n` +
    (p.signedUrl ? `View online: ${p.signedUrl}\n` : ``) +
    `Order reference: ${p.orderId}\n` +
    `Dashboard: ${site}/documents\n`;

  // Resend expects base64 for attachments
  const attachment = {
    filename: `${p.invoiceNumber}.pdf`,
    content: p.pdf.toString("base64"),
    contentType: "application/pdf",
  } as const;

  const { data, error } = await resend.emails.send({
    from,
    to: p.to,
    subject,
    html,
    text,
    attachments: [attachment],
  });

  if (error) {
    // Re-throw with a readable message so your webhook logs show why it failed
    throw new Error(
      `Resend email failed: ${error.message ?? JSON.stringify(error)}`
    );
  }
  return data; // contains id, etc.
}

export default resend;
