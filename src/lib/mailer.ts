// src/lib/mailer.ts
// src/lib/mailer.ts
import { Resend } from "resend";

export type SendInvoiceArgs = {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
  bcc?: string | string[];
};

export async function sendInvoiceEmail(
  args: SendInvoiceArgs
): Promise<{ id: string | null }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set; skipping email send.");
    return { id: null };
  }

  const from =
    process.env.MAIL_FROM || "FuelFlow <invoices@mail.fuelflow.co.uk>";

  const resend = new Resend(apiKey);

  // We’ll try Buffer first, then a base64 fallback (some setups prefer base64)
  const attempt = async (useBase64: boolean) => {
    const mapped =
      args.attachments?.map((a) =>
        useBase64
          ? ({ filename: a.filename, content: a.content.toString("base64") } as any)
          : { filename: a.filename, content: a.content }
      ) ?? [];

    if (process.env.NODE_ENV !== "production") {
      const sizes = args.attachments?.map((a) => a.content.length) ?? [];
      console.log(
        `[mailer] attachments=${mapped.length}, base64=${useBase64}, sizes=${sizes.join(
          ","
        )}`
      );
    }

    return await resend.emails.send({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      attachments: mapped,
      bcc: args.bcc,
    });
  };

  try {
    let { data, error } = await attempt(false); // Buffer
    if (error) {
      console.error("[mailer] Resend error (buffer attempt):", error);
      const r2 = await attempt(true); // base64 fallback
      data = r2.data;
      error = r2.error;
      if (error) {
        console.error("[mailer] Resend error (base64 attempt):", error);
        return { id: null };
      }
    }
    return { id: data?.id ?? null };
  } catch (e) {
    console.error("sendInvoiceEmail failed:", e);
    return { id: null };
  }
}
