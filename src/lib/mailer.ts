// src/lib/mailer.ts
// src/lib/mailer.ts
import { Resend } from "resend";

export type SendInvoiceArgs = {
  to: string | string[];
  subject: string;
  html: string;
  // Resend accepts Buffer or base64 string. We'll send Buffer.
  attachments?: Array<{ filename: string; content: Buffer }>;
  bcc?: string | string[];
};

export type SendEmailResult = {
  id: string | null;
  error?: string | null;
};

export async function sendInvoiceEmail(args: SendInvoiceArgs): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set; skipping email send.");
    return { id: null, error: "RESEND_API_KEY missing" };
  }

  const from = process.env.MAIL_FROM || "FuelFlow <invoices@mail.fuelflow.co.uk>";
  const resend = new Resend(apiKey);

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      // Important: pass Buffer directly
      attachments: args.attachments?.map(a => ({
        filename: a.filename,
        content: a.content,
      })),
      bcc: args.bcc,
    });

    if (error) {
      console.error("Resend error:", error);
      return { id: null, error: typeof error === "string" ? error : JSON.stringify(error) };
    }
    return { id: data?.id ?? null, error: null };
  } catch (e: any) {
    console.error("sendInvoiceEmail failed:", e);
    return { id: null, error: e?.message ?? String(e) };
  }
}

