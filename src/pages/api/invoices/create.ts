// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createInvoice } from "@/lib/invoice.service";
import type { InvoicePayload } from "@/lib/invoice-types";

/**
 * Simple header-based guard. Put your long random secret in .env.local:
 *   INVOICE_SECRET=replace_with_a_long_random_string
 * And pass it as:  -H "x-invoice-secret: replace_with_a_long_random_string"
 */
function checkSecret(req: NextApiRequest): boolean {
  const expected = process.env.INVOICE_SECRET || "";
  const got = (req.headers["x-invoice-secret"] || req.headers["X-Invoice-Secret"]) as string | undefined;
  return Boolean(expected) && got === expected;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only POST
  if (req.method !== "POST") {
    return res.status(404).json({ ok: false, error: "Not Found" });
  }

  // Secret check
  if (!checkSecret(req)) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  // Allow `?debug=1` to echo extra info
  const debug = req.query.debug === "1";

  // Parse payload
  let payload: InvoicePayload;
  try {
    payload = req.body as InvoicePayload;
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid JSON body" });
  }

  try {
    // create + (optionally) email the invoice
    const result = await createInvoice({
      order: payload,
      options: {
        // if your payload has the optional email? flag, we pass it along
        email?: payload.email ? true : false,
      } as any,
    });

    if (!result.ok) {
      return res.status(500).json({ ok: false, error: result.error || "Unknown error" });
    }

    const resp = {
      ok: true,
      filename: result.filename,
      total: result.total,
      emailed: result.emailed,
      emailId: result.emailId ?? null,
      ...(debug
        ? {
            debug: {
              hasResendKey: Boolean(process.env.RESEND_API_KEY),
              mailFrom: process.env.INVOICE_FROM_EMAIL || null,
              ts: new Date().toISOString(),
            },
          }
        : null),
    };

    return res.status(200).json(resp);
  } catch (err: any) {
    if (debug) {
      console.error("create error", err);
    }
    return res.status(500).json({ ok: false, error: err?.message || "Server error" });
  }
}


