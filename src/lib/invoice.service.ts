// src/lib/invoice.service.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { buildInvoicePdf } from "./invoice-pdf";
import { sendMail } from "@/lib/mailer";

/**
 * Public service entry that:
 *  1) builds the PDF from whatever payload you have
 *  2) emails it to the customer (Resend)
 *
 * We keep the argument type as `unknown` on purpose to avoid
 * compile-time fights with multiple payload shapes; the PDF
 * builder normalises them at runtime.
 */
export async function createAndSendInvoice(order: unknown): Promise<{
  ok: boolean;
  id?: string;
  error?: string;
}> {
  try {
    // 1) build pdf
    const { pdfBuffer, filename } = await buildInvoicePdf(order);

    // try to discover recipient + subject line from the payload best we can
    const anyOrder = order as any;
    const company = process.env.COMPANY_NAME || "FuelFlow";

    // derive email "to"
    const to: string | undefined =
      anyOrder?.billTo?.email ??
      anyOrder?.customer?.email ??
      process.env.FALLBACK_TO_EMAIL;

    if (!to) {
      return { ok: false, error: "Missing recipient email" };
    }

    // derive invoice number for subject
    const invoiceNumber: string =
      anyOrder?.invoiceNumber ??
      anyOrder?.meta?.invoiceNumber ??
      `INV-${Math.floor(Date.now() / 1000)}`;

    const subject = `${company} — Invoice ${invoiceNumber}`;

    const text = [
      `Hi ${anyOrder?.billTo?.name || anyOrder?.customer?.name || "there"},`,
      "",
      `Thanks for your order. Your invoice ${invoiceNumber} is attached.`,
      "",
      `Kind regards,`,
      company,
    ].join("\n");

    // 2) send via Resend (your existing mailer)
    const id = await sendMail({
      to,
      bcc: process.env.MAIL_BCC || undefined,
      subject,
      text,
      attachments: [
        {
          filename,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    return { ok: true, id };
  } catch (err: any) {
    return { ok: false, error: `pdf: ${err?.message ?? String(err)}` };
    // You may also want to log to your error pipeline here
  }
}

