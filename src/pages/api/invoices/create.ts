// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { buildInvoicePdf, type InvoicePayload } from '@/lib/pdf';
import { sendInvoiceEmail } from '@/lib/mailer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, route: '/api/invoices/create' });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ---- Robust JSON decode (handles string body or object body) ----
  let payload: InvoicePayload | undefined;
  try {
    const b: any = req.body;
    payload = typeof b === 'string' ? (JSON.parse(b) as InvoicePayload) : (b as InvoicePayload);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  // ----------------------------------------------------------------

  if (!payload?.company?.name || !payload?.customer?.name || !payload?.lines?.length) {
    return res.status(400).json({ error: 'Missing required invoice fields' });
  }

  const pdf = await buildInvoicePdf(payload);
  const filename = `INV-${new Date().toISOString().slice(0,10).replace(/-/g,'')}.pdf`;

  // Optional email
  let emailed = false;
  if (payload.email && payload.customer?.email) {
    try {
      await sendInvoiceEmail({
        to: payload.customer.email,
        subject: `Your invoice ${filename}`,
        pdf,
        filename,
      });
      emailed = true;
    } catch (e) {
      console.error('Email send failed:', e);
    }
  }

  // PDF only if explicitly requested
  const wantsPdf =
    (typeof req.headers.accept === 'string' && req.headers.accept.includes('application/pdf')) ||
    req.query.format === 'pdf';

  if (wantsPdf) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    return res.status(200).send(pdf);
  }

  return res.status(200).json({ ok: true, filename, size: pdf.length, emailed });
}
