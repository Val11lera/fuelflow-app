// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { sendInvoiceEmail } from "@/lib/mailer";
import { buildInvoicePdf } from "@/lib/invoice-pdf";

/** Matches your payload.json */
export type InvoicePayload = {
  company: { name: string };
  customer: { name: string; email?: string };
  items: { description: string; quantity: number; unitPrice: number }[];
  currency: "GBP" | "USD" | "EUR" | string;
  /** If present/true, send email. If false, build only. Defaults to true. */
  email?: boolean;
  notes?: string;
};

// Require a shared secret (optional but recommended)
const expected = process.env.INVOICE_SECRET;
if (expected) {
  const got = req.headers["x-invoice-secret"];
  if (got !== expected) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
};

export const config = {
  api: { bodyParser: { sizeLimit: "2mb" } },
};

// -------- helpers ------------------------------------------------------------

function calcTotal(items: InvoicePayload["items"]): number {
  return items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
}

function toArray<T>(v: T | T[]): T[] {
  return Array.isArray(v) ? v : [v];
}

/** Accept Buffer or { pdfBuffer|buffer, filename?, total? } */
function normalizePdfResult(
  result: unknown,
  payload: InvoicePayload
): { pdfBuffer: Buffer; filename: string; total: number } {
  const fallbackFilename = `INV-${Date.now()}.pdf`;
  const fallbackTotal = calcTotal(payload.items);

  // If the builder returned a raw Buffer
  if (result && Buffer.isBuffer(result)) {
    return { pdfBuffer: result, filename: fallbackFilename, total: fallbackTotal };
  }

  // If it returned an object
  if (result && typeof result === "object") {
    const obj = result as Record<string, unknown>;
    const buf =
      (obj["pdfBuffer"] as Buffer | undefined) ||
      (obj["buffer"] as Buffer | undefined);

    if (!buf || !Buffer.isBuffer(buf)) {
      throw new Error("buildInvoicePdf did not return a Buffer.");
    }

    const filename =
      (obj["filename"] as string | undefined) || fallbackFilename;
    const total =
      typeof obj["total"] === "number" ? (obj["total"] as number) : fallbackTotal;

    return { pdfBuffer: buf, filename, total };
  }

  throw new Error("Unexpected return type from buildInvoicePdf().");
}

// -------- handler ------------------------------------------------------------

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    const payload = req.body as InvoicePayload;

    // Basic validation
    if (!payload?.company?.name) {
      return res.status(400).json({ ok: false, error: "Missing company.name" });
    }
    if (!payload?.customer?.name) {
      return res.status(400).json({ ok: false, error: "Missing customer.name" });
    }
    if (!payload?.items?.length) {
      return res.status(400).json({ ok: false, error: "No items in payload" });
    }
    if (!payload.currency) {
      return res.status(400).json({ ok: false, error: "Missing currency" });
    }

    // 1) Build the PDF (supports both Buffer and object return shapes)
    const raw = await buildInvoicePdf(payload as any);
    const { pdfBuffer, filename, total } = normalizePdfResult(raw, payload);

    // 2) Email (default ON unless payload.email === false)
    let emailed = false;
    let emailId: string | null = null;

    const shouldEmail = payload.email !== false;
    const recipient = payload.customer?.email?.trim();

    if (shouldEmail && recipient) {
      const subject = "FuelFlow — Invoice";
      const html = `
        <p>Hello ${payload.customer.name}, please find your invoice attached.</p>
        <p><strong>Total:</strong> ${payload.currency} ${total}</p>
      `;

      emailId = await sendInvoiceEmail({
        to: toArray(recipient), // ensure string[]
        subject,
        html,
        attachments: [{ filename, content: pdfBuffer }],
      });

      emailed = !!emailId;
    }

    return res.status(200).json({
      ok: true,
      filename,
      total,
      emailed,
      emailId,
    });
  } catch (err) {
    console.error("[api/invoices/create] error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
}

