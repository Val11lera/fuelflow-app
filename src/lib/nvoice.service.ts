// src/lib/invoice.service.ts
import { buildInvoicePdf } from "@/lib/invoice-pdf";
import { sendInvoiceEmail } from "@/lib/mailer";

// Shapes you already send from the frontend
export type InvoiceItem = { description: string; quantity: number; unitPrice: number };
export type InvoicePayload = {
  company: { name: string };
  customer: { name: string; email?: string };
  items: InvoiceItem[];
  currency: "GBP" | "USD" | "EUR" | string;
  email?: boolean; // default true
};

// A tiny HTML for the email body
function invoiceEmailHtml(args: { customer: string; total: number; currency: string }) {
  const { customer, total, currency } = args;
  const money = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    currencyDisplay: "symbol"
  }).format(total);
  return `
    <div style="font-family: system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;">
      <h1 style="margin:0 0 12px;">FuelFlow — Invoice</h1>
      <p>Hello ${customer || "Customer"},</p>
      <p>Please find your invoice attached.</p>
      <p style="font-size:14px;color:#555;margin:16px 0 0;">Total: <strong>${money}</strong></p>
      <p style="font-size:12px;color:#888;margin-top:24px">This is an automated message.</p>
    </div>
  `;
}

/**
 * Create the PDF and (optionally) email it.
 * Returns: { ok, filename, emailed, emailId, total }
 */
export async function createAndEmailInvoice(payload: InvoicePayload) {
  if (!payload?.items?.length) {
    return { ok: false, error: "No items in payload" } as const;
  }

  // 1) Build the PDF (your existing working function)
  const { pdfBuffer, filename, total } = await buildInvoicePdf(payload);

  // 2) Email (default on)
  const shouldEmail = payload.email !== false;
  let emailed = false;
  let emailId: string | null = null;

  if (shouldEmail && payload.customer?.email) {
    const subject = "FuelFlow — Invoice";
    const html = invoiceEmailHtml({
      customer: payload.customer.name,
      total,
      currency: payload.currency
    });

    // sendInvoiceEmail in your project accepts attachments with Buffer + filename
    emailId = await sendInvoiceEmail({
      to: [payload.customer.email],
      subject,
      html,
      attachments: [{ filename, content: pdfBuffer }]
    });

    emailed = !!emailId;
  }

  return { ok: true, filename, emailed, emailId, total } as const;
}
