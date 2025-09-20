// src/lib/mailer.ts
// src/lib/mailer.ts
import { Resend } from "resend";

export type AttachmentArg = {
  filename: string;
  content: Buffer | Uint8Array | string;
  contentType?: string;
};

export type SendArgs = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  bcc?: string | string[];
  attachments?: AttachmentArg[];
};

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function splitCsv(v?: string | null): string[] | undefined {
  if (!v) return undefined;
  const out = v.split(",").map(s => s.trim()).filter(Boolean);
  return out.length ? out : undefined;
}

export async function sendEmail(args: SendArgs): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!resend) return { ok: false, error: "RESEND_API_KEY is not set" };

  // Must be a verified sender in Resend
  const FROM = process.env.MAIL_FROM || "FuelFlow <invoices@mail.fuelflow.co.uk>";

  const to = Array.isArray(args.to) ? args.to : [args.to];
  const bcc = args.bcc ?? splitCsv(process.env.MAIL_BCC);

  // Build a payload *without* undefined fields (fixes your TS compile error)
  const payload: any = { from: FROM, to, subject: args.subject };
  if (bcc && bcc.length) payload.bcc = bcc;
  if (args.html) payload.html = args.html;
  if (args.text) payload.text = args.text;
  if (args.attachments?.length) {
    payload.attachments = args.attachments.map(a => ({
      filename: a.filename,
      content: a.content as any,      // Buffer/Uint8Array/string
      contentType: a.contentType,
    }));
  }

  try {
    const { data, error } = await resend.emails.send(payload);
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// Back-compat so existing code that imports `sendInvoiceEmail` keeps working
export { sendEmail as sendInvoiceEmail };

