// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";

type Json = { [k: string]: unknown };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Json>
) {
  // Only allow POST
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  // Secret check
  const secret = process.env.INVOICE_SECRET;
  if (!secret) {
    return res.status(500).json({ ok: false, error: "INVOICE_SECRET missing" });
  }
  if (req.headers["x-invoice-secret"] !== secret) {
    return res.status(401).json({ ok: false, error: "Bad secret" });
  }

  // For now, just echo back so we can verify the route works
  const isDebug = req.query.debug === "1";
  return res.status(200).json({ ok: true, echo: isDebug ? req.body ?? null : null });
}

