// src/lib/mailer.ts
// src/lib/mailer.ts
import { Resend } from "resend";
import nodemailer from "nodemailer";

type Attachment = { filename: string; content: Buffer };
type SendArgs = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: Attachment[];
};

const FROM = process.env.MAIL_FROM || "FuelFlow <invoices@mail.fuelflow.co.uk>";

export async function sendMail(
  args: SendArgs,
  forceProvider?: "resend" | "smtp"
) {
  const provider =
    forceProvider ||
    (process.env.MAIL_TRANSPORT as "resend" | "smtp" | undefined) ||
    (process.env.RESEND_API_KEY ? "resend" : "smtp");

  if (provider === "resend") {
    const resend = new Resend(process.env.RESEND_API_KEY!);
    const to = Array.isArray(args.to) ? args.to : [args.to];

    const resp = await resend.emails.send({
      from: FROM,
      to,
      subject: args.subject,
      text: args.text,
      html: args.html,
      bcc: process.env.MAIL_BCC || undefined,
      // Resend expects base64 for raw buffers
      attachments: (args.attachments || []).map((a) => ({
        filename: a.filename,
        content: a.content.toString("base64"),
      })),
    });

    if ((resp as any).error) {
      throw new Error(`Resend error: ${(resp as any).error.message}`);
    }
    return resp;
  }

  // SMTP fallback (not used for invoices once we force Resend)
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

  await transporter.sendMail({
    from: FROM,
    to: args.to,
    subject: args.subject,
    text: args.text,
    html: args.html,
    bcc: process.env.MAIL_BCC || undefined,
    attachments: (args.attachments || []).map((a) => ({
      filename: a.filename,
      content: a.content,
    })),
  });
}

