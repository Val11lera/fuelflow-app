// src/lib/mailer.ts
// src/lib/mailer.ts
import { Resend } from 'resend';

export type Attachment = {
  filename: string;
  // Buffer is fine in Node; base64 string is fine too.
  content: Buffer | string;
};

export type SendInvoiceArgs = {
  to: string;
  subject: string;
  html: string;
  /**
   * Preferred: pass a Buffer directly (local server / Node).
   */
  attachments?: Attachment[];
  /**
   * Alternative: if you only have base64 (e.g., from edge/runtime),
   * supply both name and base64 and we'll build the attachment for you.
   */
  pdfFilename?: string;
  pdfBase64?: string; // base64-encoded PDF
};

const resend = new Resend(process.env.RESEND_API_KEY ?? '');

export async function sendInvoiceEmail(args: SendInvoiceArgs): Promise<string | null> {
  const from = process.env.MAIL_FROM ?? 'FuelFlow <onboarding@resend.dev>';

  // Normalize attachments
  let attachments: Attachment[] | undefined = args.attachments;
  if (!attachments && args.pdfFilename && args.pdfBase64) {
    attachments = [{ filename: args.pdfFilename, content: args.pdfBase64 }];
  }

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      // Resend accepts Buffer or base64 string content
      attachments: attachments as any,
    });

    if (error) {
      console.error('Resend error:', error);
      return null;
    }

    return data?.id ?? null;
  } catch (err) {
    console.error('sendInvoiceEmail threw:', err);
    return null;
  }
}
