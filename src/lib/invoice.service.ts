// src/lib/invoice.service.ts
// src/lib/invoice.service.ts
import { buildInvoicePdf } from "@/lib/invoice-pdf";
import { sendInvoiceEmail } from "@/lib/mailer";

export type InvoiceItem = { description: string; quantity: number; unitPrice: number };
export type InvoicePayload = {
  company: { name: string };
  customer: { name: string; email?: string };
  items: InvoiceItem[];
  currency: string;              // e.g. "GBP"
  email?: boolean;               // default true
};

// ------- helpers -------

function calcTotal(items: InvoiceItem[]) {
  return items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
}

function invoiceEmailHtml(args: { customer: string; total: number; currency: string }) {
  const { customer, total, currency } = args;
  const money = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    currencyDisplay: "symbol",
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

// `buildInvoicePdf` may return different shapes across projects.
// Support the common ones and normalize to { pdfBuffer, filename, total }.
type BuildPdfReturn =
  | Buffer
  | { pdfBuffer: Buffer; filename?: string; total?: number }
  | { buffer: Buffer; filename?: string; total?: number }
  | { data: Uint8Array; filename?: string; total?: number };

function normalizePdf(result: BuildPdfReturn, payload: InvoicePayload) {
  let filename = `INV-${Date.now()}.pdf`;
  let total = calcTotal(payload.items);
  let pdfBuffer: Buffer;

  if (result instanceof Buffer) {
    pdfBuffer = result;
  } else if ((result as any)?.pdfBuffer) {
    const r = result as { pdfBuffer: Buffer; filename?: string; total?: number };
    pdfBuffer = r.pdfBuffer;
    filename = r.filename ?? filename;
    total = r.total ?? total;
  } else if ((result as any)?.buffer) {
    const r = result as { buffer: Buffer; filename?: string; total?: number };
    pdfBuffer = r.buffer;
    filename = r.filename ?? filename;
    total = r.total ?? total;
  } else if ((result as any)?.data) {
    const r = result as { data: Uint8Array; filename?: string; total?: number };
    pdfBuffer = Buffer.from(r.data);
    filename = r.filename ?? filename;
    total = r.total ?? total;
  } else {
    throw new Error("Unsupported buildInvoicePdf return type");
  }

  return { pdfBuffer, filename, total };
}

// ------- main entry you call from your order flow -------

export async function createAndEmailInvoice(payload: InvoicePayload) {
  if (!payload?.items?.length) {
    return { ok: false, error: "No items in payload" } as const;
  }

  // Build the PDF (whatever the function returns, normalize it)
  const pdfResult = (await buildInvoicePdf(payload as any)) as BuildPdfReturn;
  const { pdfBuffer, filename, total } = normalizePdf(pdfResult, payload);

  const shouldEmail = payload.email !== false;
  let emailed = false;
  let emailId: string | null = null;

  if (shouldEmail && payload.customer?.email) {
    const subject = "FuelFlow — Invoice";
    const html = invoiceEmailHtml({
      customer: payload.customer.name,
      total,
      currency: payload.currency,
    });

    // Your mailer accepts Node Buffer attachments
    emailId = await sendInvoiceEmail({
      to: [payload.customer.email],
      subject,
      html,
      attachments: [{ filename, content: pdfBuffer }],
    });

    emailed = !!emailId;
  }

  return { ok: true, filename, emailed, emailId, total } as const;
}
