// src/lib/invoice.service.ts
// Server-only helper to build a PDF and (optionally) email it.
// Assumes you already have these two working functions:
import { buildInvoicePdf } from "@/lib/invoice-pdf";   // your working builder
import { sendInvoiceEmail } from "@/lib/mailer";        // your working mailer

export type LineItem = {
  description: string;
  quantity: number;
  unitPrice: number;          // in lowest unit (e.g., pennies) or in major unit – match your builder
};

export type OrderLike = {
  id: string;
  customer: { name: string; email: string };
  currency: "GBP" | "USD" | "EUR"; // extend as needed
  items: LineItem[];
  notes?: string;
};

export type CreateInvoiceOptions = {
  email?: boolean;            // default true
  bcc?: string | null;        // optional
};

export type CreateInvoiceResult = {
  ok: true;
  emailed: boolean;
  filename: string;
  total: number;
  emailId?: string | null;
} | {
  ok: false;
  error: string;
};

export async function createInvoiceForOrder(
  order: OrderLike,
  opts: CreateInvoiceOptions = {}
): Promise<CreateInvoiceResult> {
  try {
    const shouldEmail = opts.email ?? true;

    // 1) Build PDF (must return { pdfBuffer: Buffer; filename: string; total: number })
    const { pdfBuffer, filename, total } = await buildInvoicePdf({
      company: { name: "FuelFlow" },
      customer: { name: order.customer.name, email: order.customer.email },
      items: order.items,
      currency: order.currency,
      notes: order.notes ?? "",
      email: shouldEmail, // carry through for consistency
    });

    // 2) Optionally email it
    let emailed = false;
    let emailId: string | null = null;

    if (shouldEmail) {
      const subject = "FuelFlow — Invoice";
      const html = `Hello ${order.customer.name}, please find your invoice attached.<br/>Total: ${order.currency} ${(
        total
      ).toLocaleString("en-GB")}`;

      const result = await sendInvoiceEmail({
        to: [order.customer.email],      // accepts string[]
        subject,
        html,
        attachments: [{ filename, content: pdfBuffer }],
        bcc: opts.bcc ?? process.env.MAIL_BCC ?? undefined,
      });

      // sendInvoiceEmail should return { id?: string } on success or throw on failure
      emailed = true;
      emailId = result?.id ?? null;
    }

    return { ok: true, emailed, filename, total, emailId };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Failed to create/send invoice" };
  }
}
