// src/lib/mailer.ts
// src/lib/mailer.ts
import { Resend } from "resend";
import nodemailer from "nodemailer";

export type MailAttachment = { filename: string; content: Buffer };
export type SendMailArgs = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: MailAttachment[];
};

const FROM =
  process.env.MAIL_FROM ?? "FuelFlow <invoices@mail.fuelflow.co.uk>";

export async function sendMail(
  args: SendMailArgs,
  forceProvider?: "resend" | "smtp"
) {
  const provider =
    forceProvider ??
    (process.env.MAIL_TRANSPORT as "resend" | "smtp" | undefined) ??
    (process.env.RESEND_API_KEY ? "resend" : "smtp");

  if (provider === "resend") {
    const resend = new Resend(process.env.RESEND_API_KEY!);
    const to = Array.isArray(args.to) ? args.to : [args.to];

    // Build payload WITHOUT undefined fields
    const payload: any = {
      from: FROM,
      to,
      subject: args.subject,
    };
    if (args.text) payload.text = args.text;
    if (args.html) payload.html = args.html;
    if (process.env.MAIL_BCC) payload.bcc = process.env.MAIL_BCC;
    if (args.attachments?.length) {
      payload.attachments = args.attachments.map((a) => ({
        filename: a.filename,
        // Resend likes base64 string for raw buffers
        content: a.content.toString("base64"),
      }));
    }

    const resp = await resend.emails.send(payload);
    if ((resp as any)?.error) {
      throw new Error(`Resend error: ${(resp as any).error.message}`);
    }
    return resp;
  }

  // SMTP fallback (kept in case you use it elsewhere)
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure:
      process.env.SMTP_SECURE === "true" ||
      Number(process.env.SMTP_PORT) === 465,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });

  const mail: any = {
    from: FROM,
    to: args.to,
    subject: args.subject,
  };
  if (args.text) mail.text = args.text;
  if (args.html) mail.html = args.html;
  if (process.env.MAIL_BCC) mail.bcc = process.env.MAIL_BCC;
  if (args.attachments?.length) mail.attachments = args.attachments;

  await transporter.sendMail(mail);
}
