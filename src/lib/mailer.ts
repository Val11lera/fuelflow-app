// src/lib/mailer.ts
// src/lib/mailer.ts
import nodemailer from "nodemailer";

export type MailResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string };

type Attachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type SendInvoiceArgs = {
  to: string;
  subject: string;
  html: string;
  attachments?: Attachment[];
  from?: string; // optional override of the From header
};

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

// ---- Gmail SMTP (works with Google App Password) ----
const host   = required("SMTP_HOST", process.env.SMTP_HOST);     // smtp.gmail.com
const port   = Number(process.env.SMTP_PORT ?? 465);             // 465 for SSL
const secure = (process.env.SMTP_SECURE ?? "true") !== "false";  // true for 465
const user   = required("SMTP_USER", process.env.SMTP_USER);     // your gmail
const pass   = required("SMTP_PASS", process.env.SMTP_PASS);     // 16-char app pwd

const transporter = nodemailer.createTransport({
  host,
  port,
  secure,
  auth: { user, pass },
});

export async function sendInvoiceEmail(args: SendInvoiceArgs): Promise<MailResult> {
  try {
    const info = await transporter.sendMail({
      from: args.from ?? process.env.MAIL_FROM ?? user,
      to: args.to,
      subject: args.subject,
      html: args.html,
      attachments: args.attachments,
    });
    return { ok: true, id: (info as any).messageId ?? null };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "send failed" };
  }
}

