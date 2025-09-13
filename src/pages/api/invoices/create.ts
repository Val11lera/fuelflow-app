// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import type { InvoicePayload } from "@/types/invoice";
import { buildInvoicePdf } from "@/lib/invoice-pdf";
import { sendInvoiceEmail } from "@/lib/email";
import fs from "node:fs/promises";
import path from "node:path";

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" }, responseLimit: false },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, route: "/api/invoices/create" });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).end("Method Not Allowed");
  }

  const payload: InvoicePayload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

  // 1) Build the PDF buffer
  const pdf = await buildInvoicePdf(payload);

  // 2) Save locally during development (handy for debugging)
  try {
    const dir = path.join(process.cwd(), "private", "invoices");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${payload.invoiceNumber}.pdf`), pdf);
  } catch {
    // ignore local save errors
  }

  // 3) Email it if requested & email available
  if (payload.email && payload.customer?.email) {
    try {
      await sendInvoiceEmail({
        to: payload.customer.email,
        subject: `Your invoice ${payload.invoiceNumber}`,
        html: `<p>Hi ${payload.customer.name || "there"},</p>
               <p>Thanks for your order. Your invoice is attached.</p>
               <p>— FuelFlow</p>`,
        pdfBuffer: pdf,
        filename: `${payload.invoiceNumber}.pdf`,
      });
    } catch {
      // Do not fail the PDF response if email provider has a hiccup
    }
  }

  // 4) Return the PDF to the caller
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${payload.invoiceNumber}.pdf"`);
  res.status(200).send(pdf);
}
