// src/lib/mailer.ts
// src/lib/mailer.ts
// src/lib/mailer.ts
"use server";

import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const MAIL_FROM = process.env.MAIL_FROM!; // e.g. 'FuelFlow <invoices@mail.fuelflow.co.uk>'

if (!RESEND_API_KEY) throw new Error("Missing RESEND_API_KEY");
if (!MAIL_FROM) throw new Error("Missing MAIL_FROM");

const resend = new Resend(RESEND_API_KEY);

export type Attachment = {
  filename: string;
  content: Buffer; // Resend supports Buffer for content
};

export type SendInvoiceArgs = {
  to: string | string[];        // <— allow string OR array
  subject: string;
  html: string;
  attachments?: Attachment[];
  bcc?: string | string[];      // optional BCC
};

export async function sendInvoiceEmail(args: SendInvoiceArgs): Promise<{ id: string }> {
  const to = Array.isArray(args.to) ? args.to : [args.to];
  const bcc = args.bcc
    ? (Array.isArray(args.bcc) ? args.bcc : [args.bcc])
    : undefined;

  const result = await resend.emails.send({
    from: MAIL_FROM,
    to,
    subject: args.subject,
    html: args.html,
    attachments: args.attachments?.map(a => ({
      filename: a.filename,
      content: a.content,
    })),
    bcc,
  });

  if (result?.data?.id) return { id: result.data.id };
  throw new Error(result?.error?.message ?? "Failed to send email");
}
