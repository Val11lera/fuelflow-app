// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { buildInvoicePdf } from "@/lib/invoice-pdf";
import { sendInvoiceEmail } from "@/lib/mailer";

// ---------- Types ----------
export type InvoiceItem = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export type InvoicePayload = {
  company: { name: string };
  customer: { name: string; email?: string };
  items: InvoiceItem[];
  currency: string;           // e.g. "GBP"
  email?: boolean;            // default: true if customer.email present
  notes?: string;
};

// What the PDF builder returns right now
type PdfLike = Buffer | Uint8Array | ArrayBuffer;

// ---------- Handler ----------
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  // Optional shared secret to protect the endpoint
  const expected = process.env.INVOICE_SECRET;
  if (expected) {
    const got = req.headers["x-invoice-secret"];
    if (got !== expected) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
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
    if (!Array.isArray(payload?.items) || payload.items.length === 0) {
      return res.status(400).json({ ok: false, error: "No items" });
    }
    if (!payload?.currency) {
      return res.status(400).json({ ok: false, error: "Missing currency" });
    }

    // 1) Build the PDF (returns Buffer/Uint8Array/ArrayBuffer)
    const pdfLike: PdfLike = await buildInvoicePdf(payload);
    const pdfBuffer = toNodeBuffer(pdfLike);

    // 2) Compute totals and filename here
    const total = calcTotal(payload);
    const filename = makeFilename(payload);

    // 3) Email? (default ON if a customer email exists)
    const shouldEmail = payload.email ?? Boolean(payload.customer.email);

    let emailed = false;
    let emailId: string | null = null;

    if (shouldEmail && payload.customer.email) {
      const to = payload.customer.email;
      const subject = `${process.env.COMPANY_NAME ?? payload.company.name} — Invoice`;
      const html = `
        <p>Hello ${escapeHtml(payload.customer.name)},</p>
        <p>Please find your invoice attached.</p>
        <p>Total: <strong>${formatMoney(total, payload.currency)}</strong></p>
        ${payload.notes ? `<p>${escapeHtml(payload.notes)}</p>` : ""}
      `;

      // sendInvoiceEmail should return an id (string) or null
      const id = await sendInvoiceEmail({
        to,
        subject,
        html,
        attachments: [{ filename, content: pdfBuffer }],
      });

      if (id) {
        emailed = true;
        emailId = id;
      }
    }

    return res.status(200).json({
      ok: true,
      filename,
      total,
      emailed,
      emailId,
    });
  } catch (err: any) {
    console.error("invoice create error:", err);
    return res
      .status(500)
      .json({ ok: false, error: err?.message ?? "Failed to create invoice" });
  }
}

// ---------- Helpers ----------
function calcTotal(payload: InvoicePayload) {
  return payload.items.reduce(
    (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
    0
  );
}

function makeFilename(payload: InvoicePayload) {
  // If you pass an invoice number in payload, prefer it here.
  // Fallback: timestamped filename.
  const stamp = new Date().toISOString().replace(/[:T\-\.Z]/g, "").slice(0, 14);
  return `INV-${stamp}.pdf`;
}

function toNodeBuffer(data: PdfLike): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  // ArrayBuffer
  return Buffer.from(new Uint8Array(data));
}

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(
      amount
    );
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as any)[
      c
    ]
  );
}

