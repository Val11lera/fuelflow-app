// src/lib/mailer.ts
// src/lib/mailer.ts
// src/lib/mailer.ts
// src/lib/mailer.ts
import { Resend } from "resend";

export type Attachment = {
  filename: string;
  content: Buffer; // raw PDF Buffer
};

export type SendInvoiceArgs = {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: Attachment[];
  bcc?: string | string[];
};

export async function sendInvoiceEmail(
  args: SendInvoiceArgs
): Promise<{ id: string | null }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;

  if (!apiKey) throw new Error("Missing RESEND_API_KEY");
  if (!from) throw new Error("Missing MAIL_FROM");

  const resend = new Resend(apiKey);

  // Convert Buffer attachments to { filename, content: base64 }
  const attachments =
    args.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content.toString("base64"),
    })) ?? [];

  const result = await resend.emails.send({
    from,
    to: Array.isArray(args.to) ? args.to : [args.to],
    subject: args.subject,
    html: args.html,
    attachments,
    // only set bcc if provided (Resend types don’t love unknown props)
    ...(args.bcc ? { bcc: Array.isArray(args.bcc) ? args.bcc : [args.bcc] } : {}),
  });

  // Always normalize to { id: string | null }
  return { id: result?.data?.id ?? null };
}
