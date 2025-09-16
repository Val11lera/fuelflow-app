// src/lib/mailer.ts
// src/lib/mailer.ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY!);

// A single attachment (what Resend expects)
export type MailAttachment = {
  filename: string;
  content: Buffer; // Buffer works best with Resend
};

export type SendInvoiceArgs = {
  to: string;                // recipient
  subject: string;
  html: string;

  // OPTION A: let the caller pass attachments directly
  attachments?: MailAttachment[];

  // OPTION B: or pass a single PDF by filename+base64
  pdfFilename?: string;
  pdfBase64?: string;

  // optional headers
  replyTo?: string;
  bcc?: string | string[];
};

/**
 * Sends an email via Resend. Supports both:
 *  - args.attachments (array of {filename, content})
 *  - args.pdfFilename + args.pdfBase64 (we convert to an attachment)
 */
export async function sendInvoiceEmail(args: SendInvoiceArgs) {
  const from = process.env.MAIL_FROM;
  if (!from) {
    throw new Error('MAIL_FROM is not set. Set it to something like "FuelFlow <invoices@mail.fuelflow.co.uk>".');
  }

  const finalAttachments: MailAttachment[] = [];

  // If caller passed attachments, keep them
  if (args.attachments?.length) {
    finalAttachments.push(...args.attachments);
  }

  // Or build a single attachment from base64
  if (args.pdfFilename && args.pdfBase64) {
    finalAttachments.push({
      filename: args.pdfFilename,
      content: Buffer.from(args.pdfBase64, 'base64'),
    });
  }

  const { data, error } = await resend.emails.send({
    from,
    to: Array.isArray(args.to) ? args.to : [args.to],
    subject: args.subject,
    html: args.html,
    reply_to: args.replyTo || process.env.MAIL_REPLY_TO || undefined,
    bcc: args.bcc,
    attachments: finalAttachments.length ? finalAttachments : undefined,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }

  return data?.id ?? null;
}
