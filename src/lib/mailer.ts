// src/lib/mailer.ts
// src/lib/mailer.ts
import { Resend } from "resend";

/** Attachment shape we accept in app code */
export type MailAttachment = {
  filename: string;
  content: Buffer | Uint8Array | ArrayBuffer | string;
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

const resend = new Resend(process.env.RESEND_API_KEY || undefined);

const DEFAULT_FROM =
  process.env.MAIL_FROM ||
  process.env.RESEND_FROM ||
  "FuelFlow <invoices@mail.fuelflow.co.uk>";

/** Ensure Resend gets Buffer|string to satisfy its typings */
function toResendContent(x: MailAttachment["content"]): Buffer | string {
  if (typeof x === "string") return x;

  // If it's already a Node Buffer, pass through
  // (duck-typed to avoid importing node types just for compile)
  if ((x as any)?.constructor?.name === "Buffer") {
    return x as any;
  }

  if (x instanceof Uint8Array) return Buffer.from(x);
  if (x instanceof ArrayBuffer) return Buffer.from(new Uint8Array(x));

  // Last resort: stringify
  return Buffer.from(String(x));
}

/** Generic email sender used by invoices and tests */
export async function sendEmail(args: SendArgs): Promise<any> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not set on the server.");
  }

  const to = Array.isArray(args.to) ? args.to : [args.to];
  const bcc = args.bcc ? (Array.isArray(args.bcc) ? args.bcc : [args.bcc]) : undefined;

  const attachments =
    args.attachments?.map((a) => ({
      filename: a.filename,
      content: toResendContent(a.content), // <- normalized here
      contentType: a.contentType,
    })) ?? undefined;

  // Cast payload to any to avoid Buffer<T> generic friction in Resend’s d.ts
  const resp = await resend.emails.send({
    from: args.from || DEFAULT_FROM,
    to,
    subject: args.subject,
    text: args.text,
    html: args.html,
    bcc,
    attachments: attachments as any,
  } as any);

  return resp as any;
}

/** Back-compat alias */
export const sendInvoiceEmail = sendEmail;


