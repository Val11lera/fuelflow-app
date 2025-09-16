// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { sendInvoiceEmail } from '@/lib/mailer';
import { buildInvoicePdf } from '@/lib/invoice-pdf'; // your existing PDF generator

type Money = number;

type InvoiceItem = {
  description: string;
  quantity: number;
  unitPrice: Money;
};

type InvoicePayload = {
  company: { name: string };
  customer: { name?: string; email?: string };
  items: InvoiceItem[];
  currency?: string;
  email?: boolean;   // whether we should email the invoice
  notes?: string;
};

function parseBody<T>(body: unknown): T | null {
  try {
    if (typeof body === 'string') return JSON.parse(body) as T;
    return body as T;
  } catch {
    return null;
  }
}

function invoiceHtml(payload: InvoicePayload, total: number, filename: string) {
  const currency = payload.currency || 'GBP';
  const customer = payload.customer?.name || 'Customer';
  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
      <h2 style="margin:0 0 8px">${payload.company?.name || 'FuelFlow'} — Invoice</h2>
      <p style="margin:0 0 16px">Hello ${customer}, please find your invoice attached.</p>
      <p style="margin:0">Total: <strong>${currency} ${total.toFixed(2)}</strong></p>
      <p style="margin:16px 0 0; color:#666; font-size:12px">Attachment: ${filename}</p>
    </div>
  `;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const payload = parseBody<InvoicePayload>(req.body);
  if (!payload) {
    return res.status(400).json({ ok: false, error: 'Invalid JSON body' });
  }

  // Validate
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    return res.status(400).json({ ok: false, error: 'No items in payload' });
  }
  const to = payload.email ? payload.customer?.email?.trim() : undefined;
  if (payload.email && !to) {
    return res.status(400).json({ ok: false, error: 'Missing customer.email' });
  }

  // Totals
  const total = payload.items.reduce(
    (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
    0
  );

  // Build PDF
  let pdfBuffer: Buffer;
  const filename = `INV-${Date.now()}.pdf`;
  try {
    pdfBuffer = await buildInvoicePdf(payload);
  } catch (err) {
    console.error('PDF build failed:', err);
    return res.status(500).json({ ok: false, error: 'Failed to generate PDF' });
  }

  // Email (optional)
  let emailed = false;
  let emailId: string | null = null;

  if (payload.email && to) {
    const subject = `${payload.company?.name || 'FuelFlow'} — Invoice`;
    const html = invoiceHtml(payload, total, filename);

    // NOTE: sendInvoiceEmail returns string | null (the email id or null). No .ok checks anywhere.
    const id = await sendInvoiceEmail({
      to,
      subject,
      html,
      attachments: [{ filename, content: pdfBuffer }],
    });

    emailed = !!id;
    emailId = id;
  }

  return res.status(200).json({
    ok: true,
    filename,
    total,
    emailed,
    emailId,
    debug: {
      hasResendKey: !!process.env.RESEND_API_KEY,
      mailFrom: process.env.MAIL_FROM || null,
      ts: new Date().toISOString(),
    },
  });
}
