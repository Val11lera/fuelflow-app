// src/pages/api/invoices/create.ts
// src/lib/invoice.service.ts
"use server";

import { buildInvoicePdf } from "@/lib/invoice-pdf";
import type { InvoicePayload } from "@/lib/invoice-types";
import { sendInvoiceEmail } from "@/lib/email";

/** Options when creating an invoice */
export type CreateInvoiceOptions = {
  /** when true, attempt to email the generated PDF */
  email?: boolean;
  /** optional BCC */
  bcc?: string | null;
};

/** Successful result */
type CreateInvoiceOk = {
  ok: true;
  filename: string;
  total: number;
  emailed: boolean;
  emailId: string | null;
};

/** Error result */
type CreateInvoiceErr = {
  ok: false;
  error: string;
};

export type CreateInvoiceResult = CreateInvoiceOk | CreateInvoiceErr;

/**
 * createInvoice: builds the PDF from a payload and (optionally) emails it.
 * - Relies on buildInvoicePdf(payload) -> { pdfBuffer, filename, total }
 * - If options.email is true and mail is configured, sends via sendInvoiceEmail
 */
export async function createInvoice(args: {
  order: InvoicePayload;
  options?: CreateInvoiceOptions;
}): Promise<CreateInvoiceResult> {
  const { order, options } = args;

  // 1) Build the PDF
  let pdfLike: { pdfBuffer: Buffer; filename: string; total: number };
  try {
    pdfLike = await buildInvoicePdf(order);
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to build invoice PDF" };
  }

  let emailed = false;
  let emailId: string | null = null;

  // 2) Optionally email
  const shouldEmail = Boolean(options?.email);
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  const fromEmail = process.env.INVOICE_FROM_EMAIL;

  if (shouldEmail && hasResend && fromEmail && order.customer?.email) {
    try {
      const subject = `Invoice ${pdfLike.filename}`;
      const html =
        `<p>Hi ${order.customer.name || ""},</p>` +
        `<p>Please find your invoice (<strong>${pdfLike.filename}</strong>) attached.</p>` +
        `<p>Regards,<br/>FuelFlow</p>`;

      const mailResult = await sendInvoiceEmail({
        to: order.customer.email,
        subject,
        html,
        pdfBuffer: pdfLike.pdfBuffer,
        filename: pdfLike.filename,
      });

      emailed = true;
      // your sendInvoiceEmail can return an id (if not, leave null)
      // @ts-ignore – tolerate implementations that don’t return id
      emailId = mailResult?.id ?? null;
    } catch {
      // Don’t fail the whole request if email send fails; just report not emailed
      emailed = false;
      emailId = null;
    }
  }

  return {
    ok: true,
    filename: pdfLike.filename,
    total: pdfLike.total,
    emailed,
    emailId,
  };
}


