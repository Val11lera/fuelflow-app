// src/lib/mailer.ts
// src/lib/mailer.ts
import { Resend } from "resend";
import nodemailer from "nodemailer";

/** Attachment type used across the app */
export type MailAttachment = { filename: string; content: Buffer };

/** Primary object shape we use when sending */
export type SendMailArgs = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: MailAttachment[];
};

const FROM = process.env.MAIL_FROM ?? "FuelFlow <invoices@mail.fuelflow.co.uk>";

/**
 * Core sender. Uses Resend by default (and for invoices), but can fall back to SMTP
 * if you pass forceProvider = "smtp".
 */
export async function sendMail(
  args: SendMailArgs,
  forceProvider?: "resend" | "smtp"
) {
  const provider: "resend" | "smtp" =
    forceProvider ??
    // If you set MAIL_TRANSPORT it wins; otherwise use Resend if we have a key
    ((process.env.MAIL_TRANSPORT as "resend" | "smtp" | undefined) ??
    (process.env.RESEND_API_KEY ? "resend" : "smtp"));

  if (provider === "resend") {
    const resend = new Resend(process.env.RESEND_API_KEY!);
    const to = Array.isArray(args.to) ? args.to : [args.to];

    // Build payload WITHOUT undefined fields (Resend types are strict)
    const payload: any = { from: FROM, to, subject: args.subject };
    if (args.text) payload.text = args.text;
    if (args.html) payload.html = args.html;
    if (process.env.MAIL_BCC) payload.bcc = process.env.MAIL_BCC;
    if (args.attachments?.length) {
      payload.attachments = args.attachments.map((a) => ({
        filename: a.filename,
        // Resend expects base64 when you provide raw content
        content: a.content.toString("base64"),
      }));
    }

    const resp = await resend.emails.send(payload);
    if ((resp as any)?.error) {
      throw new Error(`Resend error: ${(resp as any).error.message}`);
    }
    return resp;
  }

  // SMTP fallback (kept for any legacy routes/tests)
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

  const mail: any = { from: FROM, to: args.to, subject: args.subject };
  if (args.text) mail.text = args.text;
  if (args.html) mail.html = args.html;
  if (process.env.MAIL_BCC) mail.bcc = process.env.MAIL_BCC;
  if (args.attachments?.length) mail.attachments = args.attachments;

  await transporter.sendMail(mail);
}

/**
 * Backwards-compatible shim so existing imports keep working:
 *
 *   import { sendInvoiceEmail } from "@/lib/mailer";
 *
 * It accepts EITHER the new object form OR an older tuple form:
 *   sendInvoiceEmail({ to, subject, html, text, attachments })
 *   sendInvoiceEmail(to, subject, { html?, text?, attachments? })
 */
export async function sendInvoiceEmail(
  toOrArgs: any,
  subject?: string,
  bodyOrOpts?: any
) {
  // Normalize into SendMailArgs
  let args: SendMailArgs;

  if (typeof toOrArgs === "object" && toOrArgs !== null && "to" in toOrArgs) {
    // New form: sendInvoiceEmail({ to, subject, ... })
    args = toOrArgs as SendMailArgs;
  } else {
    // Legacy form: sendInvoiceEmail(to, subject, { text?, html?, attachments? })
    const to = toOrArgs as string | string[];
    const opts = (bodyOrOpts || {}) as Partial<SendMailArgs>;
    args = {
      to,
      subject: subject || "(no subject)",
      text: opts.text,
      html: opts.html,
      attachments: opts.attachments,
    };
  }

  // Invoices should always go through Resend
  return sendMail(args, "resend");
}

