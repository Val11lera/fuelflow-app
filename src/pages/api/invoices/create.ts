// src/pages/api/invoices/create.ts
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

  // Next automatically parses JSON when Content-Type is application/json.
  const payload = (req.body || {}) as InvoicePayload;
  if (!payload?.company?.name || !payload?.customer?.name || !payload?.lines?.length) {
    return res.status(400).json({ error: 'Missing required invoice fields' });
  }

  const pdf = await buildInvoicePdf(payload);
  const filename = `INV-${new Date().toISOString().slice(0,10).replace(/-/g,'')}.pdf`;

  // Optionally send email
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
    } catch (err) {
      console.error('Email send failed:', err);
    }
  }

  // Decide response format
  const wantsPdf =
    (typeof req.headers.accept === 'string' && req.headers.accept.includes('application/pdf')) ||
    req.query.format === 'pdf';

  if (wantsPdf) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    return res.status(200).send(pdf);
  }

  // Default JSON response
  return res.status(200).json({
    ok: true,
    filename,
    size: pdf.length,
    emailed,
  });
}
