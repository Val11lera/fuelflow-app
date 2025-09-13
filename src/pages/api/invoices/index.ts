// src/pages/api/invoices/index.ts
// src/pages/api/invoices/index.ts
import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, route: "/api/invoices" });
  }
  res.setHeader("Allow", "GET");
  return res.status(405).json({ error: "Method Not Allowed" });
}
