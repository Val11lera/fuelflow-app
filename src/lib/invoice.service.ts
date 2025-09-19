// src/lib/invoice.service.ts
// src/lib/invoice.service.ts
"use server";

import { buildInvoicePdf } from "@/lib/invoice-pdf";
import { sendInvoiceEmail } from "@/lib/email";
import type { InvoicePayload, BuiltInvoice } from "@/lib/invoice-types";

export type CreateInvoiceOptions = {
  /** whether to email the generated invoice */
  email?: boolean;
  /** optional bcc address, if you want to extend later */
  bcc?: string | null;
};

export type CreateInvoiceResult =
  | {
      ok: true;
      filename: string;
      total: number;
      emailed: boolean;
      emailId: string | null;
    }
  | { ok: false; error: string };

export async function createInvoice(args: {
  order: InvoicePayload;
  options?: CreateInvoiceOptions;
}): Promise<CreateInvoiceResult> {
  const { order, options } = args;

  let built: BuiltInvoice;
  try {
    // build the PDF (returns { pdfBuffer, filename, total })
    built = await buildInvoicePdf(order);
  } catch (err: any) {
    return { ok: false, error: `pdf: ${err?.message ?? String(err)}` };
  }

  // email (optional)
  const shouldEmail = options?.email === true;
  const to = order?.customer?.email;
  let emailed = false;
  let emailId: string | null = null;

  if (shouldEmail && to) {
    try {
      await sendInvoiceEmail({
        to,
        subject: `Invoice ${built.filename}`,
        html: `<p>Hi ${order.customer.name},</p><p>Your invoice is attached.</p>`,
        pdfBuffer: built.pdfBuffer,
        filename: built.filename,
      });
      emailed = true;
      // your sendInvoiceEmail doesn’t return an id in your screenshots,
      // so we keep emailId as null. If you later add it, set it here.
    } catch (_err) {
      // do not fail the whole request if email sending fails
      emailed = false;
      emailId = null;
    }
  }

  return {
    ok: true,
    filename: built.filename,
    total: built.total,
    emailed,
    emailId,
  };
}

