// src/lib/mailer.ts
// src/lib/mailer.ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY!);

type SendArgs = {
  to: string;
  subject: string;
  text: string;
  pdf: Buffer;
  filename: string;
  bcc?: string | undefined | null;
};

export async function sendInvoiceMail({
  to,
  subject,
  text,
  pdf,
  filename,
  bcc,
}: SendArgs) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is missing');
  }
  if (!process.env.MAIL_FROM) {
    throw new Error('MAIL_FROM is missing');
  }

  // Resend expects base64 for attachments
  const base64 = pdf.toString('base64');

  const { error } = await resend.emails.send({
    from: process.env.MAIL_FROM!,
    to,
    ...(bcc ? { bcc } : {}),
    subject,
    text,
    attachments: [
      {
        filename,
        content: base64,
        contentType: 'application/pdf',
      },
    ],
  });

  if (error) {
    throw error;
  }
}
