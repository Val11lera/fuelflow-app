// src/lib/mailer.ts
// src/lib/mailer.ts
import { Resend } from "resend";

type AttachmentArg = {
  filename: string;
  content: Buffer | Uint8Array | string;
  contentType?: string;
};

type SendArgs = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: AttachmentArg[];
  bcc?: string | string[];
};

export async function sendEmail(args: SendArgs): Promise<{
  ok: boolean;
  id?: string;
  error?: string;
}> {
  // --- Provider check (Resend only) ---
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    return { ok: false, error: "RESEND_API_KEY is not set" };
  }

  const resend = new Resend(RESEND_API_KEY);

  // From address MUST be a verified Resend sender/domain
  const FROM =
    process.env.MAIL_FROM || "FuelFlow <invoices@mail.fuelflow.co.uk>";

  try {
    const to = Array.isArray(args.to) ? args.to : [args.to];

    // Resend accepts Buffer/Uint8Array/string for attachments.content
    const attachments =
      args.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content as any,
        contentType: a.contentType,
      })) || undefined;

    const { data, error } = await resend.emails.send({
      from: FROM,
      to,
      bcc: args.bcc ?? process.env.MAIL_BCC ?? undefined,
      subject: args.subject,
      html: args.html,
      text: args.text,
      attachments,
    });

    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data?.id };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}



