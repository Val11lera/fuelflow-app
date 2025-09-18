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

  try {
    // Always send Base64 + contentType to avoid attachment ambiguity.
    const attachments =
      args.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content.toString("base64"),
        contentType: "application/pdf",
      })) ?? [];

    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[mailer] attachments=${attachments.length}, base64=true, sizes=${args.attachments
          ?.map((x) => x.content.length)
          .join(",")}`
      );
    }

    const { data, error } = await resend.emails.send({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      attachments: attachments as any,
      bcc: args.bcc,
    });

    if (error) {
      console.error("[mailer] Resend error:", error);
      return { id: null };
    }

    return { id: data?.id ?? null };
  } catch (e) {
    console.error("sendInvoiceEmail failed:", e);
    return { id: null };
  }
}
