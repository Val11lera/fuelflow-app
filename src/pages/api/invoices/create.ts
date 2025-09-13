// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";

/** Force Node runtime (not Edge) */
export const config = { runtime: "nodejs" } as const;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    // Health check
    return res.status(200).json({ ok: true, route: "/api/invoices/create" });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Minimal valid PDF (tiny, but opens fine)
  const pdf =
    `%PDF-1.4
%âãÏÓ
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 55 >>
stream
BT /F1 24 Tf 20 100 Td (Hello FuelFlow PDF) Tj ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000015 00000 n 
0000000065 00000 n 
0000000128 00000 n 
0000000223 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
330
%%EOF`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'inline; filename="test-invoice.pdf"');
  res.status(200).send(Buffer.from(pdf, "utf8"));
}
