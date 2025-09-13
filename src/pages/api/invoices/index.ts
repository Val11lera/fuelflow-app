// src/pages/api/invoices/index.ts
// src/pages/api/invoices/index.ts
import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({ ok: true, route: "/api/invoices" });
}
