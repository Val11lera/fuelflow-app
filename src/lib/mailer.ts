// src/lib/mailer.ts
// src/lib/mailer.ts
import { Resend } from "resend";

export type MailResult =
  | { ok: true }
  | { ok: false; error: string };

export async function sendInvoiceEmail(args: {
  to: string;
  from: string;
  subject: string;
  html: string;
  attachment: { filename: string; base64: string };
}): Promise<MailResult> {
  try {
    if (!process.env.RESEND_API_KEY) {
      return { ok: false, error: "RESEND_API_KEY is missing" };
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    const { error } = await resend.emails.send({
      from: args.from,
      to: [args.to],
      subject: args.subject,
      html: args.html,
      // ✅ Resend attachment shape: filename + content (base64). Do NOT add contentType.
      attachments: [
        {
          filename: args.attachment.filename,
          content: args.attachment.base64,
        },
      ],
    });

    if (error) return { ok: false, error: String(error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
