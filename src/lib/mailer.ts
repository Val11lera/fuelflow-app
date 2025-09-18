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

  const attempt = async (useBase64: boolean) => {
    const mapped =
      args.attachments?.map((a) =>
        useBase64
          ? // base64 string variant (cast to any to satisfy SDK types if needed)
            ({
              filename: a.filename,
              content: a.content.toString("base64"),
              // contentType is optional; Resend infers from filename
              // contentType: "application/pdf",
            } as any)
          : {
              filename: a.filename,
              content: a.content, // Buffer
            }
      ) ?? [];

    // Helpful logs in dev
    if (process.env.NODE_ENV !== "production") {
      const sizes = args.attachments?.map((a) => a.content.length) ?? [];
      console.log(
        `[mailer] sending with attachments=${mapped.length}, base64=${useBase64}, sizes=${sizes.join(
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
    // 1) First try with Buffer (preferred)
    let { data, error } = await attempt(false);
    if (error) {
      console.error("[mailer] Resend error (buffer attempt):", error);
      // 2) Fallback: try base64 for attachments
      const res2 = await attempt(true);
      data = res2.data;
      error = res2.error;
      if (error) {
        console.error("[mailer] Resend error (base64 attempt):", error);
        return { id: null };
      }
      return { id: data?.id ?? null };
    }
    return { id: data?.id ?? null };
  } catch (e) {
    console.error("sendInvoiceEmail failed:", e);
    return { id: null };
  }
}

