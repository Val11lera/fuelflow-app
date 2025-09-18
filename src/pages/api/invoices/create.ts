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
  version: string;
  debug: {
    hasResendKey: boolean;
    mailFrom: string;
    pdfSize: number;
    shouldEmail: boolean;
    ts: string;
  };
};
type Err = { ok: false; error: string; version: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Ok | Err | any>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res
      .status(405)
      .json({ ok: false, error: "Method Not Allowed", version: VERSION });
  }

  // Optional body echo for debugging (local only)
  if (process.env.NODE_ENV !== "production" && req.query.debug === "body") {
    return res.status(200).json({
      version: VERSION,
      received: req.body,
      keys: req.body ? Object.keys(req.body) : [],
      note: "Parsed JSON body from Next.js",
    });
  }

  // Optional shared-secret protection
  const expected = process.env.INVOICE_SECRET;
  if (expected && req.headers["x-invoice-secret"] !== expected) {
    return res
      .status(401)
      .json({ ok: false, error: "Unauthorized", version: VERSION });
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
      const subject = `FuelFlow — Invoice ${filename.replace(
        /\.pdf$/i,
        ""
      )} · Total ${payload.currency} ${total.toFixed(2)}`;
      const html = `<p>Hello ${payload.customer.name}, please find your invoice attached.</p>`;

      const { id } = await sendInvoiceEmail({
        to: payload.customer.email,
        subject,
        html,
        attachments: [{ filename, content: pdfBuffer }],
        bcc: process.env.MAIL_BCC, // optional
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
      version: VERSION,
      debug: {
        hasResendKey: Boolean(process.env.RESEND_API_KEY),
        mailFrom:
          process.env.MAIL_FROM || "FuelFlow <invoices@mail.fuelflow.co.uk>",
        pdfSize: pdfBuffer.length,
        shouldEmail,
        ts: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error("invoice create error:", err);
    return res.status(400).json({
      ok: false,
      error: err?.message ?? "Failed to create invoice",
      version: VERSION,
    });
  }
}
