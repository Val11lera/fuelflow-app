// src/lib/mailer.ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY!);

export type SendInvoiceArgs = {
  to: string;              // recipient email (customer)
  subject: string;
  html: string;            // your HTML invoice body
  pdfFilename?: string;    // optional
  pdfBase64?: string;      // optional (base64 string)
};

export async function sendInvoiceEmail(args: SendInvoiceArgs) {
  const attachments: { filename: string; content: Buffer }[] = [];

  if (args.pdfFilename && args.pdfBase64) {
    attachments.push({
      filename: args.pdfFilename,
      content: Buffer.from(args.pdfBase64, 'base64'),
    });
  }

  const { data, error } = await resend.emails.send({
    from: process.env.MAIL_FROM!,                    // 👈 your verified domain
    to: [args.to],
    subject: args.subject,
    html: args.html,
    reply_to: process.env.MAIL_REPLY_TO || undefined,
    attachments: attachments.length ? attachments : undefined,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }

  return data?.id ?? null;
}
