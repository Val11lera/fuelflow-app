// src/lib/mailer.ts
// src/lib/mailer.ts
import { Resend } from "resend";

/** Result of sending an email */
export type MailResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string };

/**
 * Accept *all* shapes so your API route never breaks on types again:
 * - to, subject, html (normal fields)
 * - attachments (array)  OR
 * - pdfBuffer+pdfFilename  OR
 * - pdfBase64+pdfFilename  (this is what your current code uses)
 * - from (optional override)
 */
export type SendInvoiceArgs = {
  to: string;
  subject: string;
  html: string;

  // Normal attachment path (preferred long-term)
  attachments?: { filename: string; content: Buffer | string }[];

  // Back-compat paths (so your current code compiles)
  pdfFilename?: string;
  pdfBuffer?: Buffer;
  pdfBase64?: string;

  from?: string;
};

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
if (!RESEND_API_KEY) {
  // Don't throw at build time; send will fail loudly if not set.
  console.warn("RESEND_API_KEY not set. Emails will fail until you add it.");
}
const resend = new Resend(RESEND_API_KEY);

/** Build attachments from any of the accepted shapes */
function resolveAttachments(args: SendInvoiceArgs) {
  if (args.attachments && args.attachments.length) return args.attachments;

  if (args.pdfFilename && args.pdfBuffer) {
    return [{ filename: args.pdfFilename, content: args.pdfBuffer }];
  }

  if (args.pdfFilename && args.pdfBase64) {
    // Convert base64 to a Buffer the Resend SDK can send
    const buf = Buffer.from(args.pdfBase64, "base64");
    return [{ filename: args.pdfFilename, content: buf }];
  }

  return undefined;
}

export async function sendInvoiceEmail(args: SendInvoiceArgs): Promise<MailResult> {
  try {
    const attachments = resolveAttachments(args);

    const from =
      args.from ??
      process.env.MAIL_FROM ?? // e.g. FuelFlow <billing@yourdomain.com>
      "onboarding@resend.dev"; // works for quick tests

    const { data, error } = await resend.emails.send({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      attachments,
    });

    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id ?? null };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "send failed" };
  }
}

export default sendInvoiceEmail;

