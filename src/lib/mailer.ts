// src/lib/mailer.ts
"use server";

import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const MAIL_FROM = process.env.MAIL_FROM!; // e.g. "FuelFlow <invoices@mail.fuelflow.co.uk>"

if (!RESEND_API_KEY) throw new Error("Missing RESEND_API_KEY");
if (!MAIL_FROM) throw new Error("Missing MAIL_FROM");

const resend = new Resend(RESEND_API_KEY);

// ---- Public types ----
export type Attachment = {
  filename: string;
  content: Buffer;
};

export type SendInvoiceArgs = {
  to: string[];                 // list of recipients
  subject: string;
  html: string;
  attachments?: Attachment[];   // optional
  bcc?: string | string[];      // <-- add bcc support
};

// Return either the id string (Resend message id) or a small object with id
export async function sendInvoiceEmail(args: SendInvoiceArgs): Promise<{ id: string }> {
  const result = await resend.emails.send({
    from: MAIL_FROM,
    to: args.to,
    subject: args.subject,
    html: args.html,
    // Resend accepts Buffer for attachments' content
    attachments: args.attachments?.map(a => ({
      filename: a.filename,
      content: a.content,
    })),
    bcc: args.bcc
      ? Array.isArray(args.bcc) ? args.bcc : [args.bcc]
      : undefined,
  });

  // Normalize a return shape with .id
  if (result?.data?.id) return { id: result.data.id };

  // If API returned an error, make it obvious
  const msg = result?.error?.message ?? "Failed to send email";
  throw new Error(msg);
}

