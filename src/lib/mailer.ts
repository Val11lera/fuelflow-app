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
  content: Buffer | string; // Buffer for files, or base64 string
  contentType?: string;     // e.g. "application/pdf"
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
  const bcc =
    args.bcc != null
      ? Array.isArray(args.bcc)
        ? args.bcc
        : [args.bcc]
      : DEFAULT_BCC
      ? [DEFAULT_BCC]
      : undefined;

  // Resend expects base64 content for attachments
  const attachments =
    args.attachments?.map((a) => ({
      filename: a.filename,
      content:
        typeof a.content === "string" ? a.content : a.content.toString("base64"),
      contentType: a.contentType ?? "application/octet-stream",
    })) ?? [];

  const { data, error } = await resend.emails.send({
    from: FROM,
    to,
    bcc,
    subject: args.subject,
    html: args.html,
    text: args.text,
    // cast to any so we don’t fight type changes across Resend versions
    attachments: attachments as any,
  });

  if (error) throw error;
  return data?.id ?? null;
}


