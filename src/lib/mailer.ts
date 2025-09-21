// src/lib/mailer.ts
// src/lib/mailer.ts
import { Resend } from "resend";

const RESEND_KEY = process.env.RESEND_API_KEY || "";
const FROM =
  process.env.RESEND_FROM ||
  process.env.MAIL_FROM ||
  "FuelFlow <invoices@mail.fuelflow.co.uk>";
const DEFAULT_BCC = process.env.MAIL_BCC || undefined;

const resend = new Resend(RESEND_KEY);

export type MailAttachment = {
  filename: string;
  content: Buffer | string;  // Buffer or base64 string
  contentType?: string;      // e.g. "application/pdf"
};

export async function sendMail(args: {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  bcc?: string | string[];
  attachments?: MailAttachment[];
}) {
  const to = Array.isArray(args.to) ? args.to : [args.to];

  // normalize bcc to string[] (or undefined)
  const bccArr =
    args.bcc != null
      ? Array.isArray(args.bcc)
        ? args.bcc
        : [args.bcc]
      : DEFAULT_BCC
      ? [DEFAULT_BCC]
      : undefined;

  // map attachments to base64 strings only if provided
  const atts =
    args.attachments?.map((a) => ({
      filename: a.filename,
      content:
        typeof a.content === "string" ? a.content : a.content.toString("base64"),
      contentType: a.contentType ?? "application/octet-stream",
    })) ?? [];

  // build the payload conditionally; DO NOT pass undefined fields
  const payload: any = {
    from: FROM,
    to,
    subject: args.subject,
  };
  if (bccArr && bccArr.length) payload.bcc = bccArr;
  if (args.html) payload.html = args.html;
  if (args.text) payload.text = args.text;
  if (atts.length) payload.attachments = atts;

  const { data, error } = await resend.emails.send(payload);

  if (error) throw (typeof error === "object" ? error : new Error(String(error)));
  return data?.id ?? null;
}


