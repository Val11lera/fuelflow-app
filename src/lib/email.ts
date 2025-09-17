// src/lib/email.ts
// src/lib/email.ts
import { Resend } from "resend";

const resendKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.INVOICE_FROM_EMAIL;

if (!resendKey) {
  // We don't throw at import-time to keep dev smooth, but we will guard at send time.
  // eslint-disable-next-line no-console
  console.warn("RESEND_API_KEY not set — invoice emailing will be skipped.");
}

export async function sendInvoiceEmail(opts: {
  to: string;
  subject: string;
  html: string;
  pdfBuffer: Buffer;
  filename: string;
}) {
  if (!resendKey || !fromEmail) return; // silently skip if not configured

  const resend = new Resend(resendKey);
  await resend.emails.send({
    from: fromEmail!,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    attachments: [
      {
        filename: opts.filename,
        content: opts.pdfBuffer, // Buffer is supported directly
      },
    ],
  });
}
