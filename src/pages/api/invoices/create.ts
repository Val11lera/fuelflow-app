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
type Err = { ok: false; error: string; debug?: Record<string, unknown> };
type ResBody = Ok | Err;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResBody>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  // Optional shared-secret protection
  const expected = process.env.INVOICE_SECRET;
  if (expected && req.headers["x-invoice-secret"] !== expected) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const wantDebug = "debug" in req.query;

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

    // 1) Build PDF
    const { pdfBuffer, filename, total } = await buildInvoicePdf(payload);

    // 2) Email?
    const hasCustomerEmail = Boolean(payload.customer?.email);
    const shouldEmail = payload.email !== false && hasCustomerEmail;

    let emailed = false;
    let emailId: string | null = null;

    let debug: Record<string, unknown> | undefined;
    if (wantDebug) {
      debug = {
        ts: new Date().toISOString(),
        hasResendKey: Boolean(process.env.RESEND_API_KEY),
        mailFrom: process.env.MAIL_FROM || "FuelFlow <invoices@mail.fuelflow.co.uk>",
        hasCustomerEmail,
        shouldEmail,
        pdfSize: pdfBuffer.length,
        version: "create.v7",
      };
    }

    if (shouldEmail) {
      const subject = `FuelFlow — Invoice ${filename.replace(/\.pdf$/i, "")} · Total ${payload.currency} ${total}`;
      const html = `<p>Hello ${escapeHtml(payload.customer!.name)}, please find your invoice attached.</p>`;

      const { id } = await sendInvoiceEmail({
        to: payload.customer!.email!,
        subject,
        html,
        attachments: [{ filename, content: pdfBuffer }],
        bcc: process.env.MAIL_BCC, // optional
      });

      if (id) {
        emailed = true;
        emailId = id;
      } else if (wantDebug) {
        debug = { ...(debug || {}), mailer: "send returned null id (see server logs for 'Resend error')" };
      }
    } else if (wantDebug) {
      debug = { ...(debug || {}), reason: hasCustomerEmail ? "email flag disabled" : "no customer.email" };
    }

    return res.status(200).json({ ok: true, filename, total, emailed, emailId, ...(wantDebug ? { debug } : {}) });
  } catch (err: any) {
    console.error("create invoice error:", err);
    const error = err?.message ?? "Internal error";
    return res.status(500).json({ ok: false, error, ...(wantDebug ? { debug: { ts: new Date().toISOString() } } : {}) });
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as any)[c]
  );
}
