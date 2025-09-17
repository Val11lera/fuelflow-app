// src/lib/email.ts
// src/lib/email.ts
import { Resend } from 'resend';

export type EmailAttachment = {
  filename: string;
  /** If you pass a base64 string, set encoding: 'base64'. */
  content: Buffer | string;
  encoding?: 'base64';
};

export type SendEmailArgs = {
  to: string | string[];          // single email or comma-separated list or array
  from: string;                   // e.g. 'FuelFlow <onboarding@resend.dev>'
  subject: string;
  html: string;
  bcc?: string | string[];        // optional; same formats as "to"
  attachments?: EmailAttachment[]; // optional attachments
};

type Ok = { ok: true; id: string | null };
type Fail = { ok: false; error: string };

/**
 * Low-level helper to send any email (optionally with attachments).
 */
export async function sendEmail(args: SendEmailArgs): Promise<Ok | Fail> {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, error: 'Missing RESEND_API_KEY' };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  const to =
    Array.isArray(args.to)
      ? args.to
      : String(args.to)
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);

  const bcc =
    args.bcc == null
      ? undefined
      : (Array.isArray(args.bcc)
          ? args.bcc
          : String(args.bcc)
              .split(',')
              .map(s => s.trim())
              .filter(Boolean));

  const attachments = (args.attachments ?? []).map(a => ({
    filename: a.filename,
    // Resend expects a Buffer for "content"
    content: Buffer.isBuffer(a.content)
      ? a.content
      : a.encoding === 'base64'
        ? Buffer.from(a.content, 'base64')
        : Buffer.from(String(a.content)),
  }));

  try {
    const { data, error } = await resend.emails.send({
      to,
      from: args.from,
      subject: args.subject,
      html: args.html,
      bcc,
      attachments,
    });

    if (error) return { ok: false, error: error.message ?? String(error) };
    return { ok: true, id: data?.id ?? null };
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

/**
 * Convenience wrapper for sending an invoice with a single PDF attachment.
 */
export async function sendInvoiceEmail(opts: {
  to: string | string[];
  from: string;
  subject: string;
  html: string;
  pdfFilename: string;
  pdfBase64: string; // base64-encoded PDF
  bcc?: string | string[];
}): Promise<Ok | Fail> {
  return sendEmail({
    to: opts.to,
    from: opts.from,
    subject: opts.subject,
    html: opts.html,
    bcc: opts.bcc,
    attachments: [
      { filename: opts.pdfFilename, content: opts.pdfBase64, encoding: 'base64' },
    ],
  });
}
