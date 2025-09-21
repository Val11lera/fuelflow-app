// src/lib/mailer.ts
// src/lib/mailer.ts
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY || "");
const FROM = process.env.MAIL_FROM || "FuelFlow <invoices@mail.fuelflow.co.uk>";

export type MailAttachment = {
  filename: string;
  content: Buffer | Uint8Array | string;
  contentType?: string;
};

export type SendEmailArgs = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  bcc?: string | string[];
  attachments?: MailAttachment[];
};

/**
 * Sends an email and returns a stable shape { id?: string }.
 * (We avoid optional keys with undefined in the payload to satisfy Resend's typings.)
 */
export async function sendEmail(args: SendEmailArgs): Promise<{ id?: string }> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY missing");
  }

  const to = Array.isArray(args.to) ? args.to : [args.to];
  const bcc = args.bcc
    ? Array.isArray(args.bcc)
      ? args.bcc
      : [args.bcc]
    : undefined;

  const payload: Record<string, any> = {
    from: FROM,
    to,
    subject: args.subject,
  };

  if (args.html) payload.html = args.html;
  if (args.text) payload.text = args.text;
  if (bcc) payload.bcc = bcc;
  if (args.attachments?.length) {
    payload.attachments = args.attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    }));
  }

  const { data, error } = await resend.emails.send(payload as any);
  if (error) throw error;

  // Always return the same shape so callers don’t need to handle null unions.
  return { id: (data as any)?.id };
}


