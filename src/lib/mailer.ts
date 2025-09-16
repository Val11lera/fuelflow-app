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
  /**
   * Preferred: pass attachments directly.
   */
  attachments?: Attachment[];

  /**
   * Back-compat conveniences (optional).
   * If you set one of these, we'll build `attachments` for you.
   */
  pdfFilename?: string;
  pdfBuffer?: Buffer;
  pdfBase64?: string;
};

/**
 * Sends an email via Resend. Returns the provider's email id (string) on success,
 * or null if sending failed. NO { ok, id } object — just string | null.
 */
export async function sendInvoiceEmail(args: SendInvoiceArgs): Promise<string | null> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.error('RESEND_API_KEY is missing');
    return null;
  }

  const resend = new Resend(resendApiKey);

  // Pick a valid From. Prefer a domain you verified in Resend (e.g. invoices@mail.fuelflow.co.uk)
  const from =
    process.env.MAIL_FROM?.trim() ||
    'FuelFlow <onboarding@resend.dev>'; // works for testing (only sends to your account emails)

  // Normalise attachments
  let attachments: Attachment[] | undefined = args.attachments;

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

    // Resend SDK returns an object with `id` when successful
    // (shape may vary by SDK version; we just extract an id if present)
    const id = (resp as any)?.id ?? null;
    if (!id) {
      // If SDK shape changed, try to surface something helpful
      console.warn('Resend send response had no id:', resp);
    }
    return id ?? null;
  } catch (err) {
    console.error('Resend send failed:', err);
    return null;
  }
}

