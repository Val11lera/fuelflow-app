// src/lib/mailer.ts
// src/lib/mailer.ts
import { Resend } from "resend";

type AttachmentIn = {
  filename: string;
  // Buffer for normal attachments, OR base64 string if you call with base64
  content: Buffer | string;
  contentType?: string;
};

type SendArgs = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  bcc?: string | string[];
  attachments?: AttachmentIn[];
};

const DEFAULT_FROM = "FuelFlow <invoices@mail.fuelflow.co.uk>";

function pickFrom(): string {
  const raw =
    process.env.RESEND_FROM?.trim() ||
    process.env.MAIL_FROM?.trim() ||
    DEFAULT_FROM;

  // Extract just the email address inside <>
  const email = raw.match(/<([^>]+)>/)?.[1] || raw;
  const domain = email.split("@")[1]?.toLowerCase() || "";

  // Force the verified domain if anything else slips through
  if (domain !== "mail.fuelflow.co.uk") {
    console.warn(
      `[mailer] Overriding invalid FROM domain (${domain}) -> ${DEFAULT_FROM}`
    );
    return DEFAULT_FROM;
  }
  return raw;
}

export async function sendMail(args: SendArgs): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");

  const resend = new Resend(apiKey);
  const from = pickFrom();

  const to = Array.isArray(args.to) ? args.to : [args.to];
  const bcc = args.bcc
    ? Array.isArray(args.bcc)
      ? args.bcc
      : [args.bcc]
    : undefined;

  const attachments =
    args.attachments && args.attachments.length
      ? args.attachments.map((a) => ({
          filename: a.filename,
          // Resend expects Buffer; convert base64 strings if needed
          content:
            typeof a.content === "string"
              ? Buffer.from(a.content, "base64")
              : a.content,
          contentType: a.contentType,
        }))
      : undefined;

  const resp = await resend.emails.send({
    from,
    to,
    bcc,
    subject: args.subject,
    html: args.html,
    text: args.text,
    attachments,
  });

  if (resp.error) {
    throw new Error(resp.error.message);
  }
  return resp.data?.id || "";
}


