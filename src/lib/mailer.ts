// src/lib/mailer.ts
// src/lib/mailer.ts
import { Resend } from 'resend';

if (!process.env.RESEND_API_KEY) {
  throw new Error('Missing RESEND_API_KEY');
}
if (!process.env.MAIL_FROM) {
  throw new Error('Missing MAIL_FROM');
}

const resend = new Resend(process.env.RESEND_API_KEY);

export type Attachment = {
  filename: string;
  base64: string; // base64 string of the PDF
};

export async function sendInvoiceEmail(opts: {
  to: string;
  subject: string;
  html: string;
  attachment?: Attachment;
  bcc?: string;
}) {
  const attachments = opts.attachment
    ? [
        {
          filename: opts.attachment.filename,
          // Resend expects the base64 content in the "content" field
          content: opts.attachment.base64,
          // If you want to be explicit, Resend supports "type" (NOT contentType)
          // type: 'application/pdf',
        } as const,
      ]
    : undefined;

  const result = await resend.emails.send({
    from: process.env.MAIL_FROM!, // must be a verified sender in Resend
    to: opts.to,
    bcc: opts.bcc,
    subject: opts.subject,
    html: opts.html,
    attachments,
  });

  if (result.error) {
    throw new Error(`Resend error: ${JSON.stringify(result.error)}`);
  }
  return result;
}
