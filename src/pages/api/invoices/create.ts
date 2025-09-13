// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    // lets you sanity-check in the browser
    return res.status(200).json({ ok: true, route: "/api/invoices/create", how: "POST JSON here to generate the PDF" });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // For now, just echo back (we’ll plug in PDF once the route works)
  return res.status(200).json({ ok: true, received: req.body });
}

