// src/lib/mailer.ts
import { Resend } from 'resend';

type SendInvoiceArgs = {
  to: string;               // single address (you can pass comma-separated if you prefer)
  from: string;             // e.g. "FuelFlow <onboarding@resend.dev>"
  subject: string;
  html: string;
  pdfFilename: string;
  pdfBase64: string;        // the PDF as base64
  bcc?: string;             // optional comma-separated
};

export async function sendInvoiceEmail(args: SendInvoiceArgs) {
  const resend = new Resend(process.env.RESEND_API_KEY!);

  try {
    const toList = args.to.split(',').map(s => s.trim());
    const bccList = args.bcc ? args.bcc.split(',').map(s => s.trim()) : undefined;

    const result = await resend.emails.send({
      to: toList,
      from: args.from,
      subject: args.subject,
      html: args.html,
      bcc: bccList,
      // IMPORTANT: Resend expects attachments as an array, with Buffer|string content.
      attachments: [
        {
          filename: args.pdfFilename,
          content: Buffer.from(args.pdfBase64, 'base64'),
        },
      ],
    });

    return { ok: true as const, id: result?.id ?? null };
  } catch (error: any) {
    return { ok: false as const, error: String(error?.message ?? error) };
  }
}

