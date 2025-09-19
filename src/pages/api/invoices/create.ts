// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { buildInvoicePdf } from "@/lib/invoice-pdf";
import { sendInvoiceEmail } from "@/lib/email";

function okSecret(req: NextApiRequest) {
  const expected = process.env.INVOICE_SECRET;
  const got = req.headers["x-invoice-secret"];
  return !!expected && (got === expected || (Array.isArray(got) && got[0] === expected));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }
  if (!okSecret(req)) return res.status(401).json({ ok: false, error: "Unauthorized" });

  try {
    const payload = req.body; // { customer, items, currency, notes?, email? }

    const built = await buildInvoicePdf(payload); // { pdfBuffer, filename, total }

    let emailed = false;
    let emailId: string | null = null;

    if (payload?.email) {
      await sendInvoiceEmail({
        to: payload.customer.email,
        subject: "Your invoice",
        html: "<p>Please find your invoice attached.</p>",
        pdfBuffer: built.pdfBuffer,
        filename: built.filename,
      });
      emailed = true;
    }

    const debug = req.query.debug
      ? {
          hasResendKey: Boolean(process.env.RESEND_API_KEY),
          mailFrom: process.env.INVOICE_FROM_EMAIL || process.env.MAIL_FROM || null,
        }
      : undefined;

    res.status(200).json({
      ok: true,
      filename: built.filename,
      total: built.total,
      emailed,
      emailId,
      debug,
      ts: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ ok: false, error: e?.message || "Internal error" });
  }
}

