// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { buildInvoicePdf, type InvoicePayload } from "@/lib/invoice-pdf";
import { sendInvoiceEmail } from "@/lib/mailer";

const VERSION = "create.v7";

type Ok = {
  ok: true;
  filename: string;
  total: number;
  emailed: boolean;
  emailId: string | null;
  debug?: any;
};

type Err = { ok: false; error: string; debug?: any };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Ok | Err>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  // Optional shared secret
  const expectedSecret = process.env.INVOICE_SECRET;
  if (expectedSecret) {
    const got = req.headers["x-invoice-secret"];
    if (got !== expectedSecret) {
      return res.status(401).json({ ok: false, error: "Unauthorized", debug: { reason: "bad secret" } });
    }
  }

  const debugOn = String(req.query.debug ?? "").length > 0;

  try {
    const payload = req.body as InvoicePayload;

    // Validate
    if (!payload?.company?.name) return bad(400, "Missing company.name");
    if (!payload?.customer?.name) return bad(400, "Missing customer.name");
    if (!Array.isArray(payload?.items) || payload.items.length === 0) return bad(400, "No items");
    if (!payload?.currency) return bad(400, "Missing currency");

    // Build PDF as Buffer
    const pdfBuffer = await buildInvoicePdf(payload);
    const total = calcTotal(payload);
    const filename = makeFilename();

    // Email?
    const shouldEmail = (payload.email ?? Boolean(payload.customer.email)) && Boolean(payload.customer.email);

    let emailed = false;
    let emailId: string | null = null;
    let mailerError: string | null = null;

    if (shouldEmail) {
      const to = payload.customer.email as string;
      const subject = `${process.env.COMPANY_NAME ?? payload.company.name} — Invoice`;
      const html = [
        `<p>Hello ${escapeHtml(payload.customer.name)},</p>`,
        `<p>Please find your invoice attached.</p>`,
        `<p>Total: <strong>${formatMoney(total, payload.currency)}</strong></p>`,
        payload.notes ? `<p>${escapeHtml(payload.notes)}</p>` : "",
      ].join("");

      const result = await sendInvoiceEmail({
        to,
        subject,
        html,
        attachments: [{ filename, content: pdfBuffer }],
      });

      if (result.id) {
        emailed = true;
        emailId = result.id;
      } else {
        mailedFalseNote();
        mailerError = result.error ?? "Unknown error";
      }
    }

    const body: Ok = {
      ok: true,
      filename,
      total,
      emailed,
      emailId,
    };

    if (debugOn) {
      (body as any).debug = {
        version: VERSION,
        shouldEmail,
        hasResendKey: Boolean(process.env.RESEND_API_KEY),
        pdfSize: pdfBuffer.byteLength,
        mailerError: mailerError ?? null,
        mailFrom: process.env.MAIL_FROM ?? null,
      };
    }

    return res.status(200).json(body);
  } catch (e: any) {
    console.error("invoice create error:", e);
    return res.status(500).json({ ok: false, error: e?.message ?? "Failed to create invoice" });
  }

  // helpers
  function bad(code: number, msg: string) {
    return res.status(code).json({ ok: false, error: msg });
  }
}

function calcTotal(p: InvoicePayload) {
  return p.items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);
}

function makeFilename() {
  const stamp = new Date().toISOString().replace(/[:T\-\.Z]/g, "").slice(0, 14);
  return `INV-${stamp}.pdf`;
}

function formatMoney(n: number, c: string) {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: c }).format(n);
  } catch {
    return `${c} ${n.toFixed(2)}`;
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as any)[c]);
}

function mailedFalseNote() {
  // just a tiny hook to keep the code branch obvious during debugging
}
