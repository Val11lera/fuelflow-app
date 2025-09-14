// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import PDFDocument from 'pdfkit';
import { sendInvoiceEmail } from '@/lib/mailer';

type Line = { description: string; qty: number; unitPrice: number };
type Payload = {
  invoiceNumber?: string;
  issuedAt?: string;           // ISO date string
  currency?: string;           // e.g. "GBP"
  company: { name: string; address: string };
  customer: { name: string; email: string; address: string };
  lines: Line[];
  notes?: string;
  email?: boolean;             // if true we email the PDF
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  let body: Payload;
  try {
    body = req.body;
  } catch {
    return res.status(400).json({ ok: false, error: 'Invalid JSON body' });
  }

  try {
    const pdfBuffer = await renderInvoice(body);

    let emailed = false;
    if (body.email && body.customer?.email) {
      const filename = `${body.invoiceNumber || 'invoice'}.pdf`;
      const base64 = pdfBuffer.toString('base64');

      await sendInvoiceEmail({
        to: body.customer.email,
        bcc: process.env.MAIL_BCC, // optional, set on Vercel if you want a copy
        subject: `Invoice ${body.invoiceNumber ?? ''}`.trim(),
        html: `
          <p>Hi ${escapeHtml(body.customer.name)},</p>
          <p>Please find your invoice attached.</p>
          <p>Thank you,<br/>${escapeHtml(body.company.name)}</p>
        `,
        attachment: { filename, base64 },
      });
      emailed = true;
    }

    // Always return JSON (so jq never tries to parse binary again)
    return res.status(200).json({
      ok: true,
      emailed,
      invoiceNumber: body.invoiceNumber ?? null,
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err?.message ?? 'Unknown error' });
  }
}

function renderInvoice(p: Payload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];

    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const currency = p.currency ?? 'GBP';

    doc.fontSize(22).text('INVOICE', { align: 'right' }).moveDown();
    doc.fontSize(12).text(`Invoice #: ${p.invoiceNumber ?? 'N/A'}`);
    doc.text(`Issued: ${p.issuedAt ? new Date(p.issuedAt).toDateString() : new Date().toDateString()}`);
    doc.moveDown();

    doc.fontSize(12).text(p.company.name);
    doc.text(p.company.address).moveDown();

    doc.text(`Bill To: ${p.customer.name}`);
    doc.text(p.customer.address).moveDown();

    // Table header
    doc.fontSize(12).text('Description', 50);
    doc.text('Qty', 350);
    doc.text('Unit', 400);
    doc.text('Total', 470);
    doc.moveDown();

    let total = 0;
    for (const l of p.lines ?? []) {
      const qty = Number(l.qty || 0);
      const unit = Number(l.unitPrice || 0);
      const lineTotal = qty * unit;
      total += lineTotal;

      doc.text(l.description, 50);
      doc.text(String(qty), 350);
      doc.text(`${currency} ${unit.toFixed(2)}`, 400);
      doc.text(`${currency} ${lineTotal.toFixed(2)}`, 470);
      doc.moveDown(0.5);
    }

    doc.moveDown();
    doc.fontSize(14).text(`Total: ${currency} ${total.toFixed(2)}`, { align: 'right' });

    if (p.notes) {
      doc.moveDown().fontSize(11).text(p.notes);
    }

    doc.end();
  });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}
