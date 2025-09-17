// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { buildInvoicePdf } from "@/lib/invoice-pdf";
import { sendInvoiceEmail } from "@/lib/mailer";

// -------- Types you can import elsewhere --------
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

// Result your PDF builder should return
type BuildResult = {
  pdfBuffer: Buffer;          // Node Buffer of PDF bytes
  filename: string;           // e.g. "INV-2025-0001.pdf"
  total: number;              // numeric total (e.g. 1275)
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  // Optional: shared-secret to protect the endpoint
  const expected = process.env.INVOICE_SECRET;
  if (expected) {
    const got = req.headers["x-invoice-secret"];
    if (got !== expected) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
  }

  try {
    const payload = req.body as InvoicePayload;

    // ---- Basic validation (adjust as needed)
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

    const { pdfBuffer, filename, total } = (await buildInvoicePdf(
      payload
    )) as BuildResult;

    let emailed = false;
    let emailId: string | null = null;

    // Decide whether to email: if payload.email is explicitly set, use it;
    // otherwise email if a customer email exists.
    const shouldEmail = payload.email ?? Boolean(payload.customer.email);

    if (shouldEmail && payload.customer.email) {
      const to = payload.customer.email;
      const subject = `${process.env.COMPANY_NAME ?? payload.company.name} — Invoice`;
      const html = `
        <p>Hello ${escapeHtml(payload.customer.name)},</p>
        <p>Please find your invoice attached.</p>
        <p>Total: <strong>${formatMoney(total, payload.currency)}</strong></p>
        ${payload.notes ? `<p>${escapeHtml(payload.notes)}</p>` : ""}
      `;

      // sendInvoiceEmail returns the provider's email id (or null on failure)
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

// -------- helpers --------
function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    // fallback
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

