// src/lib/mailer.ts
import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY!);

export async function sendInvoiceEmail(params: {
  to: string;
  invoiceNumber: string;
  orderId: string;
  totalGBP: string;
  signedUrl?: string; // optional online view link
  pdf: Buffer;        // invoice attachment
}) {
  const from = process.env.RESEND_FROM || "FuelFlow <no-reply@fuelflow.co.uk>";
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://dashboard.fuelflow.co.uk";

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial">
      <h2 style="margin:0 0 8px">Payment received</h2>
      <p style="margin:0 0 12px">Thanks for your payment. Your invoice <b>${params.invoiceNumber}</b> is attached.</p>
      <p style="margin:0 0 12px">Total: <b>${params.totalGBP}</b></p>
      ${params.signedUrl ? `<p>View online: <a href="${params.signedUrl}">${params.invoiceNumber}.pdf</a></p>` : ""}
      <p style="margin-top:16px">See all invoices: <a href="${site}/documents">${site}/documents</a></p>
      <p style="font-size:12px;color:#666">Order reference: ${params.orderId}</p>
    </div>
  `;

  await resend.emails.send({
    from,
    to: params.to,
    subject: `FuelFlow payment received — Invoice ${params.invoiceNumber}`,
    html,
    attachments: [
      {
        filename: `${params.invoiceNumber}.pdf`,
        content: params.pdf,
        contentType: "application/pdf",
      },
    ],
  });
}
