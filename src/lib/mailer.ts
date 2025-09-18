// src/lib/mailer.ts
import { Resend } from "resend";

export type SendInvoiceArgs = {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
  bcc?: string | string[];
};

export async function sendInvoiceEmail(
  args: SendInvoiceArgs
): Promise<{ id: string | null }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set; skipping email send.");
    return { id: null };
  }

  const from =
    process.env.MAIL_FROM || "FuelFlow <invoices@mail.fuelflow.co.uk>";

  const resend = new Resend(apiKey);

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      attachments: args.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content, // Buffer
      })),
      bcc: args.bcc,
    });

    if (error) {
      console.error("Resend error:", error);
      return { id: null };
    }

    return { id: data?.id ?? null };
  } catch (e) {
    console.error("sendInvoiceEmail failed:", e);
    return { id: null };
  }
}

