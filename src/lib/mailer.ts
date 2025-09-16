// src/lib/mailer.ts
// src/lib/mailer.ts
import { Resend } from 'resend';

export type Attachment = {
  filename: string;
  content: Buffer | string; // Buffer (Node) or base64 string
};

export type SendInvoiceArgs = {
  to: string;
  subject: string;
  html: string;
  attachments?: Attachment[]; // preferred: Buffer attachment
  pdfFilename?: string;       // optional: if sending base64
  pdfBase64?: string;         // optional: if sending base64
};

const resend = new Resend(process.env.RESEND_API_KEY ?? '');

export async function sendInvoiceEmail(args: SendInvoiceArgs): Promise<string | null> {
  const from = process.env.MAIL_FROM ?? 'FuelFlow <onboarding@resend.dev>';

  // Support either Buffer attachments or a single base64 PDF (pdfFilename + pdfBase64).
  let attachments = args.attachments;
  if (!attachments && args.pdfFilename && args.pdfBase64) {
    attachments = [{ filename: args.pdfFilename, content: args.pdfBase64 }];
  }

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      attachments: attachments as any, // Resend SDK accepts Buffer or base64 string
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

