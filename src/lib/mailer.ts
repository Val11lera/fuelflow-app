// src/lib/mailer.ts
// src/lib/mailer.ts
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY || "");
const FROM = process.env.MAIL_FROM || "FuelFlow <invoices@mail.fuelflow.co.uk>";

export type MailAttachment = {
  filename: string;
  content: Buffer;               // <- Buffer, not string
  contentType?: string;          // set to "application/pdf" for PDFs
};

export async function sendEmail(args: {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  bcc?: string | string[];
  attachments?: MailAttachment[];
}) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY missing");
  }

  const to = Array.isArray(args.to) ? args.to : [args.to];

  const { data, error } = await resend.emails.send({
    from: FROM,
    to,
    subject: args.subject,
    html: args.html,
    text: args.text,
    bcc: args.bcc,
    // Resend accepts Buffer as attachment content
    attachments: args.attachments?.map(a => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  });

  if (error) throw error;
  return data; // contains id
}

