// src/lib/invoice.service.ts
// src/lib/invoice.service.ts
//
// Small service that builds the PDF and returns a result for callers.
// Keeps types consistent with invoice-pdf.ts to avoid “missing properties” errors.

import { buildInvoicePdf, type InvoiceInput } from "./invoice-pdf";

export type BuildResult =
  | { ok: true; pdfBuffer: Buffer; filename: string; total: number }
  | { ok: false; error: string };

export async function buildInvoice(order: InvoiceInput): Promise<BuildResult> {
  try {
    const built = await buildInvoicePdf(order);
    return {
      ok: true,
      pdfBuffer: built.pdfBuffer,
      filename: built.filename,
      total: built.total,
    };
  } catch (err: any) {
    return { ok: false, error: `pdf: ${err?.message ?? String(err)}` };
  }
}

