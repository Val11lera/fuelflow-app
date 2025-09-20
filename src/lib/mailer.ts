// src/lib/mailer.ts
// src/lib/mailer.ts
import { Resend } from "resend";

/**
 * Minimal attachment type that matches what Resend accepts.
 * (Do NOT import types from internal "resend/build/..." paths.)
 */
export type MailAttachment = {
  filename: string;
  content: Buffer | Uint8Array | string;
  contentType?: string;
};

type SendArgs = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  bcc?: string | string[];
  attachments?: MailAttachment[];
  from?: string;
};

const RESEND_API_KEY = process.env.RESEND_API_KEY;
if (!RESEND_API_KEY) {
  // We throw at runtime if someone calls send without a key.
  // (Build must not depend on secrets.)
  console.warn("RESEND_API_KEY is not set. Email sending will fail at runtime.");
}
const resend = new Resend(RESEND_API_KEY);

/** Preferred sender. Falls back to your verified Resend domain. */
const DEFAULT_FROM =
  process.env.MAIL_FROM ||
  process.env.RESEND_FROM || // if you added it
  "FuelFlow <invoices@mail.fuelflow.co.uk>";

/**
 * Generic email sender used by invoice route and by the attachment test.
 * Returns the Resend response (loosely typed to avoid build breakage).
 */
export async function sendEmail(args: SendArgs): Promise<{ id?: string } & Record<string, any>> {
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not set on the server.");
  }

  const to = Array.isArray(args.to) ? args.to : [args.to];
  const bcc = args.bcc ? (Array.isArray(args.bcc) ? args.bcc : [args.bcc]) : undefined;

  const resp = await resend.emails.send({
    from: args.from || DEFAULT_FROM,
    to,
    subject: args.subject,
    text: args.text,
    html: args.html,
    bcc,
    // Resend accepts Buffer/Uint8Array/string
    attachments: args.attachments?.map(a => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  });

  // Keep it flexible: return whatever Resend sent, but surface id if present
  return (resp ?? {}) as any;
}

/** Back-compat alias used elsewhere in your code */
export const sendInvoiceEmail = sendEmail;

