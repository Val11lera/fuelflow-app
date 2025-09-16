// src/lib/mailer.ts
// src/lib/mailer.ts
import { Resend } from 'resend';

export type Attachment = {
  filename: string;
  content: Buffer; // raw bytes
};

export type SendInvoiceArgs = {
  to: string;
  subject: string;
  html: string;
  attachments?: Attachment[];
  // Back-compat convenience:
  pdfFilename?: string;
  pdfBuffer?: Buffer;
  pdfBase64?: string;
};

/**
 * Send an email via Resend.
 * Returns the provider email ID on success, or null on failure.
 */
export async function sendInvoiceEmail(args: SendInvoiceArgs): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is missing');
    return null;
  }

  const resend = new Resend(apiKey);
  const from =
    process.env.MAIL_FROM?.trim() ||
    'FuelFlow <onboarding@resend.dev>'; // works only for test inboxes in your Resend account

  // Normalize attachments
  let attachments = args.attachments;
  if (!attachments) {
    if (args.pdfBuffer && args.pdfFilename) {
      attachments = [{ filename: args.pdfFilename, content: args.pdfBuffer }];
    } else if (args.pdfBase64 && args.pdfFilename) {
      attachments = [{ filename: args.pdfFilename, content: Buffer.from(args.pdfBase64, 'base64') }];
    }
  }

  try {
    const resp = await resend.emails.send({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      attachments: attachments?.map(a => ({ filename: a.filename, content: a.content })),
    });

    // Resend returns an object with an `id` when it accepts the message
    const id = (resp as any)?.id ?? null;
    if (!id) console.warn('Resend response had no id:', resp);
    return id;
  } catch (err) {
    console.error('Resend send failed:', err);
    return null;
  }
}

