// src/lib/mailer.ts
// src/lib/mailer.ts
import nodemailer from "nodemailer";

export type MailOk = { ok: true; id: string | null };
export type MailErr = { ok: false; error: string };
export type MailResult = MailOk | MailErr;

export type SendInvoiceArgs = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
  bcc?: string | undefined;
};

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export async function sendInvoiceEmail(args: SendInvoiceArgs): Promise<MailResult> {
  try {
    const host = process.env.SMTP_HOST || "smtp.gmail.com";
    const port = Number(process.env.SMTP_PORT || "465");
    const secure = String(process.env.SMTP_SECURE || "true") === "true";
    const user = required("SMTP_USER");
    const pass = required("SMTP_PASS");

    const from = process.env.MAIL_FROM || user;
    const bcc = args.bcc ?? process.env.MAIL_BCC;

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    const info = await transporter.sendMail({
      from,
      to: args.to,
      bcc,
      subject: args.subject,
      text: args.text ?? "Please see the attached invoice.",
      html: args.html,
      attachments: args.attachments,
    });

    return { ok: true, id: info.messageId ?? null };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

