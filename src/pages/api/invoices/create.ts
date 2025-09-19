// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createInvoice } from "@/lib/invoice.service";
import type { InvoicePayload } from "@/lib/invoice-types";

const VERSION = "create.v1";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only POST
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  // Auth via header
  const expected = process.env.INVOICE_SECRET || "replace_with_a_long_random_string";
  const provided = req.headers["x-invoice-secret"];
  if (provided !== expected) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  // Parse body
  let payload: InvoicePayload;
  try {
    payload = req.body as InvoicePayload;
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid JSON body" });
  }

  // Optional email flag can be included in payload (harmless for the PDF builder)
  const shouldEmail = (payload as any).email === true;

  // Build (+ optional email)
  const result = await createInvoice({
    order: payload,
    options: { email: shouldEmail },
  });

  // Optional debug info
  const debug = req.query.debug
    ? {
        v: VERSION,
        hasResendKey: Boolean(process.env.RESEND_API_KEY),
        mailFrom: process.env.INVOICE_FROM_EMAIL ?? null,
      }
    : undefined;

  // Done
  return res.status(200).json({ ...result, debug });
}


