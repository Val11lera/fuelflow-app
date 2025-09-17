import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY as string);
const MAIL_FROM =
  process.env.MAIL_FROM || "FuelFlow <invoices@mail.fuelflow.co.uk>";

export type SendInvoiceArgs = {
  to: string | string[];               // 👈 accept single or many
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
};

function asArray<T>(v: T | T[]): T[] {
  return Array.isArray(v) ? v : [v];
}

// Returns message id (or null) – never throws
export async function sendInvoiceEmail(args: SendInvoiceArgs): Promise<string | null> {
  try {
    const attachments = args.attachments?.map((a) => ({
      filename: a.filename,
      // Resend accepts base64 content in Node; convert Buffer → base64
      content: a.content.toString("base64"),
    }));

    const { data, error } = await resend.emails.send({
      from: MAIL_FROM,
      to: asArray(args.to),            // 👈 normalize to string[]
      subject: args.subject,
      html: args.html,
      attachments,
    });

    if (error) {
      console.error("Resend error:", error);
      return null;
    }
    return data?.id ?? null;
  } catch (e) {
    console.error("sendInvoiceEmail error:", e);
    return null;
  }
}

