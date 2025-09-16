// src/lib/mailer.ts
// src/lib/mailer.ts
import { Resend } from 'resend';

export type MailOk = { ok: true; id: string | null };
export type MailErr = { ok: false; error: string };
export type MailResult = MailOk | MailErr;

export async function sendInvoiceEmail(args: {
  to: string;
  from: string;
  subject: string;
  html: string;
  pdfFilename: string;
  pdfBase64: string;  // base64 of the PDF
}): Promise<MailResult> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return { ok: false, error: 'RESEND_API_KEY is missing' };

    const resend = new Resend(apiKey);

    const { data, error } = await resend.emails.send({
      from: args.from,
      to: [args.to],
      subject: args.subject,
      html: args.html,
      attachments: [
        {
          filename: args.pdfFilename,
          // Resend expects a Buffer for content, not contentType
          content: Buffer.from(args.pdfBase64, 'base64'),
        },
      ],
    });

    if (error) return { ok: false, error: error.message ?? String(error) };
    return { ok: true, id: data?.id ?? null };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

