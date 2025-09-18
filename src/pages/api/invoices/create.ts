// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { buildInvoicePdf } from "@/lib/invoice-pdf";
import { sendInvoiceEmail } from "@/lib/mailer";
import type { InvoicePayload } from "@/lib/invoice-types";

type PdfLike = Buffer | Uint8Array | ArrayBuffer;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  // Optional shared-secret
  const expected = process.env.INVOICE_SECRET;
  if (expected) {
    const got = req.headers["x-invoice-secret"];
    if (got !== expected) return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  try {
    const payload = req.body as InvoicePayload;

    // Basic validation
    if (!payload?.company?.name)   return res.status(400).json({ ok: false, error: "Missing company.name" });
    if (!payload?.customer?.name)  return res.status(400).json({ ok: false, error: "Missing customer.name" });
    if (!Array.isArray(payload.items) || payload.items.length === 0)
      return res.status(400).json({ ok: false, error: "At least one line item is required" });
    if (!payload.currency)         return res.status(400).json({ ok: false, error: "Missing currency" });

    // Build PDF
    const pdfLike: PdfLike = await buildInvoicePdf(payload);
    const pdfBuffer = toNodeBuffer(pdfLike);

    // Totals + filename
    const total = calcTotal(payload);
    const filename = makeFilename();

    // Email? (default ON if customer has an email)
    const shouldEmail = payload.email ?? Boolean(payload.customer.email);

    let emailed = false;
    let emailId: string | null = null;

    if (shouldEmail && payload.customer.email) {
      const subject = `${process.env.COMPANY_NAME ?? payload.company.name} — Invoice`;
      const html = `
        <p>Hello ${escapeHtml(payload.customer.name)},</p>
        <p>Please find your invoice attached.</p>
        <p>Total: <strong>${formatMoney(total, payload.currency)}</strong></p>
        ${payload.notes ? `<p>${escapeHtml(payload.notes)}</p>` : ""}
      `;

      const { id } = await sendInvoiceEmail({
        to: payload.customer.email,
        subject,
        html,
        attachments: [{ filename, content: pdfBuffer }],
      });

      if (id) { emailed = true; emailId = id; }
    }

    return res.status(200).json({ ok: true, filename, total, emailed, emailId });
  } catch (e: any) {
    console.error("invoice create error:", e);
    return res.status(500).json({ ok: false, error: e?.message ?? "Failed to create invoice" });
  }
}

// ---------- helpers ----------
function calcTotal(p: InvoicePayload) {
  return p.items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);
}

function makeFilename() {
  const stamp = new Date().toISOString().replace(/[:T\-\.Z]/g, "").slice(0, 14);
  return `INV-${stamp}.pdf`;
}

function toNodeBuffer(data: PdfLike): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  return Buffer.from(new Uint8Array(data));
}

function formatMoney(n: number, currency: string) {
  try { return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(n); }
  catch { return `${currency} ${n.toFixed(2)}`; }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as any)[c]);
}
