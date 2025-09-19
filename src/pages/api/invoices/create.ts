// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { buildInvoicePdf } from "@/lib/invoice-pdf";
import { sendInvoiceEmail } from "@/lib/email";

// Simple helper to read the shared secret from header
function checkSecret(req: NextApiRequest): boolean {
  const provided = req.headers["x-invoice-secret"];
  const expected = process.env.INVOICE_SECRET;
  return !!expected && (provided === expected || (Array.isArray(provided) && provided[0] === expected));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  if (!checkSecret(req)) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  try {
    // the payload shape matches what your PDF builder expects
    const payload = req.body; // { customer, items, currency, notes?, email? }

    // 1) Build the PDF
    const built = await buildInvoicePdf(payload); // { pdfBuffer, filename, total }

    // 2) Email (optional)
    let emailed = false;
    let emailId: string | null = null;

    if (payload?.email) {
      // send to the customer in the payload
      await sendInvoiceEmail({
        to: payload.customer.email,
        subject: "Your invoice",
        html: "<p>Please find your invoice attached.</p>",
        pdfBuffer: built.pdfBuffer,
        filename: built.filename,
      });
      emailed = true;
    }

    // 3) Respond (include small debug if ?debug=1)
    const debug: Record<string, unknown> | undefined = req.query.debug
      ? {
          hasResendKey: Boolean(process.env.RESEND_API_KEY),
          mailFrom: process.env.INVOICE_FROM_EMAIL || process.env.MAIL_FROM || null,
        }
      : undefined;

    return res.status(200).json({
      ok: true,
      filename: built.filename,
      total: built.total,
      emailed,
      emailId,
      debug,
      ts: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("create invoice failed:", err);
    return res.status(500).json({ ok: false, error: err?.message || "Internal error" });
  }
}
