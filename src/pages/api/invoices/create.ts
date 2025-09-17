// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { sendInvoiceEmail } from "@/lib/mailer";
import { buildInvoicePdf } from "@/lib/invoice-pdf";

// Adjust to your real payload shape; this matches your payload.json screenshots
export type InvoicePayload = {
  company: { name: string };
  customer: { name: string; email?: string };
  items: { description: string; quantity: number; unitPrice: number }[];
  currency: "GBP" | "USD" | "EUR" | string;
  /** If present/true, send the email; if false we only build the PDF */
  email?: boolean;
  /** Optional notes you had in examples */
  notes?: string;
};

export const config = {
  api: { bodyParser: { sizeLimit: "2mb" } },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    const payload = req.body as InvoicePayload;

    // ---- Basic validation ---------------------------------------------------
    if (!payload?.company?.name) {
      return res.status(400).json({ ok: false, error: "Missing company.name" });
    }
    if (!payload?.customer?.name) {
      return res.status(400).json({ ok: false, error: "Missing customer.name" });
    }
    if (!payload?.items?.length) {
      return res.status(400).json({ ok: false, error: "No items in payload" });
    }
    if (!payload.currency) {
      return res.status(400).json({ ok: false, error: "Missing currency" });
    }

    // ---- 1) Build the PDF ---------------------------------------------------
    // Your existing builder should return a Buffer + filename + total
    const { pdfBuffer, filename, total } = await buildInvoicePdf(payload);

    // ---- 2) Email (default ON unless payload.email === false) --------------
    let emailed = false;
    let emailId: string | null = null;

    const shouldEmail = payload.email !== false;
    const maybeEmail = payload.customer?.email?.trim();

    if (shouldEmail && maybeEmail) {
      const recipients = [maybeEmail]; // 👈 ARRAY — fixes the TS error

      const subject = "FuelFlow — Invoice";
      const html = `
        <p>Hello ${payload.customer.name}, please find your invoice attached.</p>
        <p><strong>Total:</strong> ${payload.currency} ${total}</p>
      `;

      emailId = await sendInvoiceEmail({
        to: recipients,
        subject,
        html,
        attachments: [{ filename, content: pdfBuffer }],
      });

      emailed = !!emailId;
    }

    // ---- Respond ------------------------------------------------------------
    return res.status(200).json({
      ok: true,
      filename,
      total,
      emailed,
      emailId,
    });
  } catch (err) {
    console.error("[api/invoices/create] error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
}
