// src/lib/mailer.ts
// src/lib/mailer.ts
import { Resend } from "resend";

export type Attachment = { filename: string; content: Buffer };

export type SendInvoiceArgs = {
  // accept string or string[]
  to: string | string[];
  from?: string;
  subject: string;
  html: string;

  // EITHER pass "attachments" exactly like you do now...
  attachments?: Attachment[];

  // ...OR give a single PDF via filename+buffer (or base64)
  pdfFilename?: string;
  pdfBuffer?: Buffer;
  pdfBase64?: string;
};

export type SendResult = string | null; // returns the email id if sent, else null

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendInvoiceEmail(args: SendInvoiceArgs): Promise<SendResult> {
  if (!process.env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY missing");
    return null;
  }

  const to = Array.isArray(args.to) ? args.to : [args.to];

  // prefer explicit attachments; otherwise build from pdf* fields
  let attachments: Attachment[] | undefined = args.attachments;
  if (!attachments) {
    if (args.pdfFilename && args.pdfBuffer) {
      attachments = [{ filename: args.pdfFilename, content: args.pdfBuffer }];
    } else if (args.pdfFilename && args.pdfBase64) {
      attachments = [{ filename: args.pdfFilename, content: Buffer.from(args.pdfBase64, "base64") }];
    }
  }

  const from = args.from ?? (process.env.MAIL_FROM ?? "FuelFlow <invoices@mail.fuelflow.co.uk>");

  try {
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject: args.subject,
      html: args.html,
      attachments,
    });
    if (error) {
      console.error("Resend error:", error);
      return null;
    }
    return data?.id ?? null;
  } catch (err) {
    console.error("Resend exception:", err);
    return null;
  }
}


