// src/lib/invoice.service.ts
// src/lib/invoice.service.ts
"use server";

import { buildInvoicePdf } from "@/lib/invoice-pdf";
import { sendInvoiceEmail } from "@/lib/mailer";

// ------------ Types you can reuse elsewhere ------------
export type LineItem = {
  description: string;
  quantity: number;
  unitPrice: number; // match what your PDF builder expects
};

export type OrderLike = {
  id: string;
  customer: { name: string; email: string };
  currency: "GBP" | "USD" | "EUR"; // extend as needed
  items: LineItem[];
  notes?: string;
};

export type CreateInvoiceOptions = {
  email?: boolean;           // default true
  bcc?: string | null;       // optional override
};

export type CreateInvoiceResult =
  | { ok: true; emailed: boolean; filename: string; total: number; emailId?: string | null }
  | { ok: false; error: string };

// ---- What the builder should return ----
type BuildResult = { pdfBuffer: Buffer; filename: string; total: number };

// If your builder’s .d.ts says it returns Buffer, normalize here:
function normalizeBuildResult(x: unknown): BuildResult {
  // modern: the builder returns the object we expect
  if (
    x &&
    typeof x === "object" &&
    "pdfBuffer" in x &&
    "filename" in x &&
    "total" in x
  ) {
    const r = x as any;
    return {
      pdfBuffer: r.pdfBuffer as Buffer,
      filename: String(r.filename),
      total: Number(r.total),
    };
  }

  // legacy/safe fallback: builder returned just a Buffer
  return {
    pdfBuffer: x as Buffer,
    filename: `INV-${Date.now()}.pdf`,
    total: 0,
  };
}

export async function createInvoiceForOrder(
  order: OrderLike,
  opts: CreateInvoiceOptions = {}
): Promise<CreateInvoiceResult> {
  try {
    const shouldEmail = opts.email ?? true;

    // 1) Build the PDF with your existing builder
    const built = await buildInvoicePdf({
      company:  { name: "FuelFlow" },
      customer: { name: order.customer.name, email: order.customer.email },
      items:    order.items,
      currency: order.currency,
      notes:    order.notes ?? "",
      email:    shouldEmail, // not required, but harmless to pass through
    });

    // Ensure we have { pdfBuffer, filename, total } (fixes the TS error)
    const { pdfBuffer, filename, total } = normalizeBuildResult(built);

    // 2) Optionally email it
    let emailed = false;
    let emailId: string | null = null;

    if (shouldEmail) {
      const subject = "FuelFlow — Invoice";
      const totalMajor = total; // adapt if total is pence/cents
      const html = `Hello ${order.customer.name}, please find your invoice attached.<br/>Total: ${order.currency} ${totalMajor.toLocaleString("en-GB")}`;

      // sendInvoiceEmail should accept: { to: string[], subject, html, attachments, bcc? }
      const mailRes = await sendInvoiceEmail({
        to: [order.customer.email],
        subject,
        html,
        attachments: [{ filename, content: pdfBuffer }],
        bcc: opts.bcc ?? process.env.MAIL_BCC ?? undefined,
      });

      // Cope with either a string id or an object with .id
      emailId = (typeof mailRes === "string" ? mailRes : (mailRes?.id ?? null)) as string | null;
      emailed = true;
    }

    return { ok: true, emailed, filename, total, emailId };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Failed to create/send invoice" };
  }
}

