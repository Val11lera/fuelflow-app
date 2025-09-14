// src/lib/mailer.ts
// src/lib/mailer.ts
// src/lib/mailer.ts
import { Resend } from "resend";

const resendKey = process.env.RESEND_API_KEY || "";
const fromEmail = process.env.MAIL_FROM || "FuelFlow <onboarding@resend.dev>";
const bccList = (process.env.MAIL_BCC || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const resend = resendKey ? new Resend(resendKey) : null;

export type SendInvoiceArgs = {
  to: string;
  subject: string;
  html: string;
  filename: string;
  pdfBase64: string; // base64-encoded PDF
};

export async function sendInvoiceEmail(args: SendInvoiceArgs) {
  if (!resend) {
    return { ok: false, error: "RESEND_API_KEY missing" as const };
  }

  const { to, subject, html, filename, pdfBase64 } = args;

  const { error } = await resend.emails.send({
    from: fromEmail,
    to,
    bcc: bccList.length ? bccList : undefined,
    subject,
    html,
    attachments: [
      // NOTE: Resend attachments expect only `filename` and `content` (base64).
      { filename, content: pdfBase64 },
    ],
  });

  if (error) return { ok: false, error: String(error) as const };
  return { ok: true as const };
}
