// src/lib/mailer.ts
// src/lib/mailer.ts
// Uses Resend to send the PDF. No 'contentType' field!
import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const MAIL_FROM = process.env.MAIL_FROM || 'FuelFlow <onboarding@resend.dev>';
const MAIL_BCC = process.env.MAIL_BCC; // optional

if (!RESEND_API_KEY) {
  console.warn('RESEND_API_KEY is not set. Emails will be skipped.');
}

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export async function sendInvoiceEmail(opts: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  pdf: Buffer;
  filename: string;
}) {
  if (!resend) return { skipped: true };

  const resp = await resend.emails.send({
    from: MAIL_FROM,
    to: opts.to,
    ...(MAIL_BCC ? { bcc: [MAIL_BCC] } : {}),
    subject: opts.subject,
    text: opts.text ?? 'Please find your invoice attached.',
    html:
      opts.html ??
      `<p>Please find your invoice attached.</p><p>Thanks for flying with us.</p>`,
    attachments: [
      {
        // IMPORTANT: for Resend this must be 'content' with Base64.
        filename: opts.filename,
        content: opts.pdf.toString('base64'),
      },
    ],
  });

  return resp;
}
