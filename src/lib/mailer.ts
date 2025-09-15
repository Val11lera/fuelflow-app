// src/lib/mailer.ts
import { Resend } from 'resend';

type SendInvoiceArgs = {
  to: string;
  from: string;
  subject: string;
  html: string;
  pdfFilename: string;
  pdfBase64: string;
  bcc?: string;
};

export async function sendInvoiceEmail(args: SendInvoiceArgs) {
  const resend = new Resend(process.env.RESEND_API_KEY!);

  try {
    const toList = args.to.split(',').map(s => s.trim());
    const bccList = args.bcc ? args.bcc.split(',').map(s => s.trim()) : undefined;

    const { data, error } = await resend.emails.send({
      to: toList,
      from: args.from,
      subject: args.subject,
      html: args.html,
      bcc: bccList,
      attachments: [
        {
          filename: args.pdfFilename,
          content: Buffer.from(args.pdfBase64, 'base64'), // ✅ correct shape
        },
      ],
    });

    if (error) throw new Error(error.message ?? String(error));
    return { ok: true as const, id: data?.id ?? null };
  } catch (err: any) {
    return { ok: false as const, error: String(err?.message ?? err) };
  }
}

