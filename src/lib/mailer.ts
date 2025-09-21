// src/lib/mailer.ts
// src/lib/mailer.ts
import { Resend } from "resend";

type AttachmentIn = {
  filename: string;
  content: Buffer | string; // Buffer (recommended) or base64 string you convert before calling
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

  const email = raw.match(/<([^>]+)>/)?.[1] || raw;
  const domain = email.split("@")[1]?.toLowerCase() || "";

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
  const bcc =
    args.bcc ? (Array.isArray(args.bcc) ? args.bcc : [args.bcc]) : undefined;

  const attachments =
    args.attachments && args.attachments.length
      ? args.attachments.map((a) => ({
          filename: a.filename,
          content:
            typeof a.content === "string"
              ? Buffer.from(a.content, "base64")
              : a.content,
          contentType: a.contentType,
        }))
      : undefined;

  // Build payload without undefined properties to satisfy strict typings
  const payload: any = { from, to, subject: args.subject };
  if (args.html) payload.html = args.html;
  if (args.text) payload.text = args.text;
  if (bcc && bcc.length) payload.bcc = bcc;
  if (attachments && attachments.length) payload.attachments = attachments;

  const resp = await resend.emails.send(payload);

  if ((resp as any)?.error) {
    throw new Error((resp as any).error.message);
  }
  return (resp as any)?.data?.id || "";
}



