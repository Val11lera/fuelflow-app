// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import PDFDocument from 'pdfkit';
import { supabase } from '@/lib/supabase';     // if your alias doesn't work, change to '../../../lib/supabase'
import { sendInvoiceEmail } from '@/lib/mailer'; // if your alias doesn't work, change to '../../../lib/mailer'

type Line = { description: string; qty: number; unitPrice: number };
type InvoicePayload = {
  company: { name: string; address?: string };
  customer: { name: string; email?: string; address?: string };
  lines: Line[];
  notes?: string;
  email?: boolean;   // if true, send via email
  to?: string;       // optional override for recipient email
};

// --- Render invoice content into a PDFKit document (keep doc typed as any to avoid Vercel TS issues)
function renderInvoice(doc: any, p: InvoicePayload) {
  const total = p.lines.reduce((acc, l) => acc + l.qty * l.unitPrice, 0);

  doc.fontSize(22).text('INVOICE', { align: 'right' }).moveDown();

  doc.fontSize(12).text(p.company.name);
  if (p.company.address) doc.text(p.company.address);
  doc.moveDown();

  doc.text(`Bill To: ${p.customer.name}`);
  if (p.customer.address) doc.text(p.customer.address);
  doc.moveDown();

  doc.moveDown(0.5);
  doc.fontSize(12).text('Description', 50, doc.y, { continued: true });
  doc.text('Qty', 300, undefined, { continued: true });
  doc.text('Unit', 350, undefined, { continued: true });
  doc.text('Line', 420);

  doc.moveDown(0.5);
  p.lines.forEach((l) => {
    doc.text(l.description, 50, doc.y, { continued: true });
    doc.text(String(l.qty), 300, undefined, { continued: true });
    doc.text(l.unitPrice.toFixed(2), 350, undefined, { continued: true });
    doc.text((l.qty * l.unitPrice).toFixed(2), 420);
  });

  doc.moveDown();
  doc.text(`Total: ${total.toFixed(2)}`, { align: 'right' });

  if (p.notes) {
    doc.moveDown();
    doc.text(p.notes);
  }
}

// --- MAKE SURE THIS FUNCTION EXISTS (this is what your error is about)
function makePdfBuffer(p: InvoicePayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // any-typed PDFDocument keeps build happy on Vercel
    const doc: any = new (PDFDocument as any)({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (d: Buffer) => chunks.push(d));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    renderInvoice(doc, p);
    doc.end();
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true, route: '/api/invoices/create' });
  }

  try {
    const p = req.body as InvoicePayload;

    // Basic validation
    if (!p?.company?.name || !p?.customer?.name || !Array.isArray(p?.lines) || p.lines.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Build the PDF
    const pdfBuffer = await makePdfBuffer(p);
    const filename = `INV-${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}.pdf`;

    // If ?format=pdf, stream the PDF back to the browser
    if (req.query.format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      return res.status(200).send(pdfBuffer);
    }

    // Optional: send the email via Resend
    let emailed = false;
    let emailError: string | undefined;
    if (p.email) {
      const to = p.to ?? p.customer.email;
      const from = process.env.MAIL_FROM;
      if (!to || !from) {
        return res.status(400).json({ error: 'Missing email recipient or MAIL_FROM env var' });
      }

      const base64 = pdfBuffer.toString('base64');
      const subject = `${p.company.name} Invoice`;
      const html = `<p>Hi ${p.customer.name},</p><p>Attached is your invoice from ${p.company.name}.</p>`;

      const result = await sendInvoiceEmail({
        to,
        from,
        subject,
        html,
        pdfFilename: filename,
        pdfBase64: base64,
      });

      emailed = result.ok;
      if (!result.ok) emailError = result.error;
    }

    // Always record in Supabase
    const total = p.lines.reduce((acc, l) => acc + l.qty * l.unitPrice, 0);
    const { error: dbError } = await supabase.from('invoices').insert({
      company_name: p.company.name,
      customer_name: p.customer.name,
      customer_email: p.customer.email ?? null,
      total_cents: Math.round(total * 100),
      pdf_filename: filename,
      emailed,
      payload: p,
    });

    if (dbError) {
      console.error('Supabase insert error:', dbError);
      // We still return ok, because the PDF/email succeeded; but log the DB error
    }

    return res.status(200).json({
      ok: true,
      filename,
      emailed,
      ...(emailError ? { emailError } : {}),
    });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: 'Server error', detail: String(e?.message ?? e) });
  }
}
