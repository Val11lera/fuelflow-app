// src/lib/mailer.ts
// src/lib/mailer.ts
import type { AttachmentLike } from "resend/build/src/emails/interfaces";
import { Resend } from "resend";

/** Arguments the rest of your app already uses */
export type SendArgs = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>;
  bcc?: string | string[];
};

const FROM = process.env.MAIL_FROM || "FuelFlow <invoices@mail.fuelflow.co.uk>";
const BCC = process.env.MAIL_BCC || undefined;

function assertResendConfigured() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not set – cannot send invoice email.");
  }
}

export async function sendInvoiceEmail(args: SendArgs) {
  assertResendConfigured();

  const resend = new Resend(process.env.RESEND_API_KEY!);

  const to = Array.isArray(args.to) ? args.to : [args.to];
  const bcc = args.bcc ?? BCC;

  const attachments: AttachmentLike[] =
    args.attachments?.map((a) => ({
      filename: a.filename,
      content: typeof a.content === "string" ? Buffer.from(a.content) : a.content,
      contentType: a.contentType,
    })) ?? [];

  // Helpful log you can see in Vercel -> Deployments -> Logs
  console.log("[mailer] sending via Resend", {
    from: FROM,
    to,
    bcc,
    subject: args.subject,
    hasHtml: !!args.html,
    hasText: !!args.text,
    attachments: attachments.map((a) => a.filename),
  });

  const { data, error } = await resend.emails.send({
    from: FROM,
    to,
    bcc,
    subject: args.subject,
    text: args.text,
    html: args.html,
    attachments,
  });

  if (error) {
    console.error("[mailer] resend error:", error);
    throw new Error(typeof error === "string" ? error : (error as any)?.message || "send_failed");
  }

  console.log("[mailer] sent ok", { id: data?.id });
  // Keep legacy shape some old code expects:
  return { id: data?.id ?? null };
}

