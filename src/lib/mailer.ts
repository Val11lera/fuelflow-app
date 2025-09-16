// src/lib/mailer.ts
// src/lib/mailer.ts
import { Resend } from "resend";

export type SendInvoiceArgs = {
  to: string[];                 // recipient list
  from?: string;                // optional override
  subject: string;
  html: string;
  // one of these attachment forms is fine:
  pdfFilename?: string;
  pdfBuffer?: Buffer;
  pdfBase64?: string;
};

// When email succeeds we return the Resend id, otherwise null.
// (No boolean .ok — that’s what was tripping TS.)
export type SendResult = { id: string } | null;

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendInvoiceEmail(args: SendInvoiceArgs): Promise<SendResult> {
  if (!process.env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY missing");
    return null;
  }

  // Build attachment (optional)
  let attachments:
    | { filename: string; content: Buffer }[]
    | undefined;

  if (args.pdfFilename && args.pdfBuffer) {
    attachments = [{ filename: args.pdfFilename, content: args.pdfBuffer }];
  } else if (args.pdfFilename && args.pdfBase64) {
    attachments = [{ filename: args.pdfFilename, content: Buffer.from(args.pdfBase64, "base64") }];
  }

  try {
    const { data, error } = await resend.emails.send({
      from: args.from ?? (process.env.MAIL_FROM ?? "FuelFlow <invoices@mail.fuelflow.co.uk>"),
      to: args.to,
      subject: args.subject,
      html: args.html,
      attachments,
    });

    if (error) {
      console.error("Resend error:", error);
      return null;
    }
    return data?.id ? { id: data.id } : null;
  } catch (e) {
    console.error("Resend exception:", e);
    return null;
  }
}

