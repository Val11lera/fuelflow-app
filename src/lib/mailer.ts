// src/lib/mailer.ts
import { Resend } from "resend";

export type MailOk = { ok: true; id: string | null };
export type MailErr = { ok: false; error: string };
export type MailResult = MailOk | MailErr;

type SendInvoiceArgs = {
  to: string;               // "a@b.com" or "a@b.com,b@c.com"
  from: string;             // e.g. "FuelFlow <invoices@yourdomain.com>"
  subject: string;
  html: string;
  pdfFilename: string;
  pdfBase64: string;        // base64-encoded PDF
  bcc?: string;             // optional "x@y.com,z@w.com"
};

export async function sendInvoiceEmail(args: SendInvoiceArgs): Promise<MailResult> {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, error: "RESEND_API_KEY is missing" };
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);

    const toList = args.to.split(",").map(s => s.trim()).filter(Boolean);
    const bccList = args.bcc ? args.bcc.split(",").map(s => s.trim()).filter(Boolean) : undefined;

    const { data, error } = await resend.emails.send({
      from: args.from,
      to: toList,
      bcc: bccList,
      subject: args.subject,
      html: args.html,
      // ✅ Resend attachments: { filename, content } (Buffer or base64 string)
      attachments: [
        {
          filename: args.pdfFilename,
          content: Buffer.from(args.pdfBase64, "base64"),
        },
      ],
    });

    if (error) return { ok: false, error: error.message ?? String(error) };
    return { ok: true, id: data?.id ?? null };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

