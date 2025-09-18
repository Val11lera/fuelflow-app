// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { buildInvoicePdf, type InvoicePayload } from "@/lib/invoice-pdf";
import { sendInvoiceEmail } from "@/lib/mailer";

const VERSION = "create.v6"; // ← visible in responses so we can verify this file is live

type Ok = {
  ok: true;
  filename: string;
  total: number;
  emailed: boolean;
  emailId: string | null;
  version: string;
};
type Err = { ok: false; error: string; version: string };
type ResBody = Ok | Err | any;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResBody>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed", version: VERSION });
  }

  // DEV helper: echo the parsed body so we can see exactly what the server received
  if (process.env.NODE_ENV !== "production" && req.query.debug === "body") {
    return res.status(200).json({
      version: VERSION,
      received: req.body,
      keys: req.body ? Object.keys(req.body) : [],
      note: "Parsed JSON body from Next.js",
    });
  }

  // Optional shared secret
  const expected = process.env.INVOICE_SECRET;
  if (expected && req.headers["x-invoice-secret"] !== expected) {
    return res.status(401).json({ ok: false, error: "Unauthorized", version: VERSION });
  }

  try {
    const payload = req.body as InvoicePayload;

    // Build the PDF (this throws a clear message if items are missing/empty)
    const { pdfBuffer, filename, total } = await buildInvoicePdf(payload);

    // Email (default ON unless payload.email === false)
    const shouldEmail = payload.email !== false;
    let emailed = false;
    let emailId: string | null = null;

    if (shouldEmail && payload.customer?.email) {
      const subject = `FuelFlow — Invoice ${filename.replace(/\.pdf$/i, "")} · Total ${payload.currency} ${total.toFixed(2)}`;
      const html = `<p>Hello ${payload.customer.name}, please find your invoice attached.</p>`;

      const sendResult = await sendInvoiceEmail({
        to: payload.customer.email,
        subject,
        html,
        attachments: [{ filename, content: pdfBuffer }],
        bcc: process.env.MAIL_BCC, // optional
      });

      if (sendResult.id) {
        emailed = true;
        emailId = sendResult.id;
      }
    }

    return res.status(200).json({
      ok: true,
      filename,
      total,
      emailed,
      emailId,
      version: VERSION,
    });
  } catch (err: any) {
    console.error("invoice create error:", err);
    // Validation errors (like no items) should return 400 with the thrown message
    return res.status(400).json({ ok: false, error: err?.message ?? "Failed to create invoice", version: VERSION });
  }
}

