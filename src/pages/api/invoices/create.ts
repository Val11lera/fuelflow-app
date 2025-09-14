// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import PDFDocument from 'pdfkit';
import { sendInvoiceMail } from '@/lib/mailer';

type Line = { description: string; qty: number; unitPrice: number };
type Payload = {
  invoiceNumber?: string;
  issuedAt?: string;
  currency?: string;
  company: { name: string; address?: string };
  customer: { name: string; email?: string; address?: string };
  lines: Line[];
  notes?: string;
  email?: boolean;
};

function renderInvoice(doc: PDFKit.PDFDocument, p: Payload) {
  const cur = (n: number) =>
    new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: p.currency || 'GBP',
    }).format(n);

  doc.fontSize(22).text('INVOICE', { align: 'right' }).moveDown();

  doc.fontSize(12);
  doc.text(p.company.name);
  if (p.company.address) doc.text(p.company.address);
  doc.moveDown();

  doc.text(`Bill To: ${p.customer.name}`);
  if (p.customer.address) doc.text(p.customer.address);
  doc.moveDown();

  if (p.invoiceNumber) doc.text(`Invoice #: ${p.invoiceNumber}`);
  if (p.issuedAt) doc.text(`Issued: ${new Date(p.issuedAt).toDateString()}`);
  doc.text(`Currency: ${p.currency || 'GBP'}`);
  doc.moveDown();

  doc.text('Items:', { underline: true }).moveDown(0.3);

  let total = 0;
  p.lines.forEach((l) => {
    const lineTotal = l.qty * l.unitPrice;
    total += lineTotal;
    doc
      .text(`${l.description}  x${l.qty}`, { continued: true })
      .text(`  ${cur(lineTotal)}`, { align: 'right' });
  });

  doc.moveDown();
  doc.text(`Total: ${cur(total)}`, { align: 'right' }).moveDown();

  if (p.notes) {
    doc.moveDown();
    doc.text('Notes:', { underline: true });
    doc.text(p.notes);
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  let p: Payload;
  try {
    p = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ ok: false, error: 'Invalid JSON body' });
  }

  // Build the PDF in memory
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.on('data', (c) => chunks.push(c));
  const pdfDone = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  renderInvoice(doc, p);
  doc.end();
  const pdf = await pdfDone;

  // Optionally email it
  let emailed = false;
  let emailError: string | undefined;
  if (p.email && p.customer?.email) {
    try {
      const filename = `${p.invoiceNumber || 'invoice'}.pdf`;
      await sendInvoiceMail({
        to: p.customer.email,
        bcc: process.env.MAIL_BCC || undefined,
        subject: `Invoice ${p.invoiceNumber || ''}`.trim(),
        text: `Hi ${p.customer.name},\n\nPlease find your invoice attached.\n\nThanks,\nFuelFlow`,
        pdf,
        filename,
      });
      emailed = true;
    } catch (e: any) {
      console.error('Email failed:', e?.message || e);
      emailError = e?.message || 'Email failed';
    }
  }

  // ✅ Always return JSON so jq is happy
  return res.status(200).json({
    ok: true,
    emailed,
    ...(emailError ? { emailError } : {}),
    bytes: pdf.length,
  });
}
