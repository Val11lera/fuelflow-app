// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { sendInvoiceEmail } from "@/lib/mailer";
import { buildInvoicePdf, type InvoicePayload } from "@/lib/invoice-pdf";

type Ok = {
  ok: true;
  filename: string;
  total: number;
  emailed: boolean;
  emailId: string | null;
  debug?: Record<string, unknown>;
};

type Fail = { ok: false; error: string };

const VERSION = "create.v7";

function calcTotal(p: InvoicePayload) {
  return p.items.reduce(
    (sum, it) =>
      sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
    0
  );
}

function filename(p: InvoicePayload) {
  const stamp = new Date().toISOString().replace(/[:T\-\.Z]/g, "").slice(0, 14);
  return `INV-${stamp}.pdf`;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Ok | Fail>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  // Optional shared secret
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
      return res.status(400).json({ ok: false, error: "At least one line item is required" });
    }
    if (!payload?.currency) {
      return res.status(400).json({ ok: false, error: "Missing currency" });
    }

    const pdfBuffer = await buildInvoicePdf(payload);
    const total = calcTotal(payload);
    const fname = filename(payload);

    const shouldEmail =
      (payload as any).email ?? Boolean(payload.customer.email);

    let emailed = false;
    let emailId: string | null = null;

    if (shouldEmail && payload.customer.email) {
      const { id } = await sendInvoiceEmail({
        to: payload.customer.email,
        subject: `${process.env.COMPANY_NAME ?? payload.company.name} — Invoice`,
        html: `
          <p>Hello ${escapeHtml(payload.customer.name)},</p>
          <p>Please find your invoice attached.</p>
          <p>Total: <strong>${new Intl.NumberFormat("en-GB", {
            style: "currency",
            currency: payload.currency,
          }).format(total)}</strong></p>
          ${payload.notes ? `<p>${escapeHtml(payload.notes)}</p>` : ""}
        `,
        attachments: [{ filename: fname, content: pdfBuffer }],
      });
      if (id) {
        emailed = true;
        emailId = id;
      }
    }

    const bodyHasDebug = "debug" in (req.query || {});
    const debug = bodyHasDebug
      ? {
          version: VERSION,
          hasResendKey: Boolean(process.env.RESEND_API_KEY),
          mailFrom: process.env.MAIL_FROM ?? "FuelFlow <invoices@mail.fuelflow.co.uk>",
          ts: new Date().toISOString(),
        }
      : undefined;

    return res.status(200).json({
      ok: true,
      filename: fname,
      total,
      emailed,
      emailId,
      debug,
    });
  } catch (e: any) {
    console.error("invoice create error:", e);
    return res.status(500).json({
      ok: false,
      error: e?.message ?? "Failed to create invoice",
    });
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as any)[
      c
    ]
  );
}
