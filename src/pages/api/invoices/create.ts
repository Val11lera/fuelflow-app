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
};
type Err = { ok: false; error: string };
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

  try {
    const payload = req.body as InvoicePayload;

    // 1) Build PDF
    const { pdfBuffer, filename, total } = await buildInvoicePdf(payload);

    // 2) Email (default ON unless payload.email === false)
    const shouldEmail = payload.email !== false;
    let emailed = false;
    let emailId: string | null = null;

    if (shouldEmail && payload.customer?.email) {
      const subject = `FuelFlow — Invoice ${filename.replace(/\.pdf$/i, "")} · Total ${payload.currency} ${total.toFixed(2)}`;
      const html = `<p>Hello ${payload.customer.name}, please find your invoice attached.</p>`;

      // sendInvoiceEmail returns an OBJECT: { id: string | null }
      const sendResult = await sendInvoiceEmail({
        to: payload.customer.email,
        subject,
        html,
        attachments: [{ filename, content: pdfBuffer }],
        bcc: process.env.MAIL_BCC, // optional
      });

      // Use the ID from that object
      if (sendResult.id) {
        emailed = true;
        emailId = sendResult.id;
      }
    }

    return res.status(200).json({ ok: true, filename, total, emailed, emailId });
  } catch (err: any) {
    console.error("create invoice error:", err);
    return res
      .status(500)
      .json({ ok: false, error: err?.message ?? "Internal error" });
  }
}

