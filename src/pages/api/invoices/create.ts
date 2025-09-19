// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { buildInvoicePdf, type InvoicePayload } from "@/lib/invoice-pdf";
import { sendInvoiceEmail } from "@/lib/mailer"; // if you use "@/lib/email", change this import

type Ok = {
  ok: true;
  filename: string;
  total: number;
  emailed: boolean;
  emailId: string | null;
  debug?: any;
};

type Fail = { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Ok | Fail>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  // Simple secret check (set INVOICE_SECRET in your env)
  const secretHeader = Array.isArray(req.headers["x-invoice-secret"])
    ? req.headers["x-invoice-secret"][0]
    : req.headers["x-invoice-secret"];

  if (!process.env.INVOICE_SECRET || secretHeader !== process.env.INVOICE_SECRET) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  // The payload your builder expects
  const payload = req.body as InvoicePayload;

  try {
    // 1) Build the PDF
    const built = await buildInvoicePdf(payload);
    const pdfBuffer = built.pdfBuffer;
    const filename = built.filename;
    const total = built.total;

    // 2) Optionally email it
    let emailed = false;
    let emailId: string | null = null;

    if (payload.email && payload.customer?.email) {
      const html = `<p>Please find your invoice attached.</p>`;
      const result = await sendInvoiceEmail({
        to: payload.customer.email,
        subject: "Your invoice",
        html,
        attachments: [{ filename, content: pdfBuffer }],
        bcc: process.env.INVOICE_BCC || undefined,
      });

      emailed = !result.error;
      emailId = result.id ?? null;
    }

    // 3) Respond
    return res.status(200).json({
      ok: true,
      filename,
      total,
      emailed,
      emailId,
      debug: req.query.debug
        ? { hasResendKey: !!process.env.RESEND_API_KEY }
        : undefined,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
}
