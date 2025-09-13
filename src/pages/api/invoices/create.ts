// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

type Party = { name: string; address?: string; email?: string };
type Line = { description: string; qty: number; unitPrice: number };
type InvoicePayload = {
  invoiceNumber: string;
  issuedAt: string;
  currency: string;
  company: Party;
  customer: Party;
  lines: Line[];
  notes?: string;
  email?: boolean; // optional flag for later emailing
};

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Health check for GET
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, route: "/api/invoices/create" });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).end("Method Not Allowed");
  }

  // Validate payload
  const payload = req.body as Partial<InvoicePayload>;
  if (
    !payload ||
    !payload.invoiceNumber ||
    !payload.issuedAt ||
    !payload.currency ||
    !payload.company?.name ||
    !payload.customer?.name ||
    !Array.isArray(payload.lines) ||
    payload.lines.length === 0
  ) {
    return res.status(400).json({ error: "Invalid invoice payload" });
  }

  // Where to save on disk
  const invoicesDir = path.join(process.cwd(), "private", "invoices");
  fs.mkdirSync(invoicesDir, { recursive: true });
  const fileName = `${payload.invoiceNumber}.pdf`;
  const filePath = path.join(invoicesDir, fileName);

  // Create the PDF
  const doc = new PDFDocument({ size: "A4", margin: 50 });

  // 1) save to disk
  const fileStream = fs.createWriteStream(filePath);
  doc.pipe(fileStream);

  // 2) stream to browser/client
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  doc.pipe(res);

  // ===== Simple invoice layout =====
  doc.fontSize(20).text("INVOICE", { align: "right" }).moveDown();

  doc.fontSize(12);
  doc.text(`Invoice #: ${payload.invoiceNumber}`);
  doc.text(`Date: ${new Date(payload.issuedAt).toLocaleDateString()}`);
  doc.text(`Currency: ${payload.currency}`).moveDown();

  doc.font("Helvetica-Bold").text(payload.company.name);
  if (payload.company.address) doc.font("Helvetica").text(payload.company.address);
  doc.moveDown();

  doc.font("Helvetica-Bold").text("Bill To:");
  doc.font("Helvetica").text(payload.customer.name);
  if (payload.customer.address) doc.text(payload.customer.address);
  doc.moveDown();

  // Table header
  const headerY = doc.y;
  doc.font("Helvetica-Bold");
  doc.text("Description", 50, headerY);
  doc.text("Qty", 350, headerY);
  doc.text("Unit Price", 400, headerY, { width: 90, align: "right" });
  doc.text("Line Total", 500, headerY, { width: 90, align: "right" });
  doc.moveDown().moveDown();

  // Lines
  doc.font("Helvetica");
  let total = 0;
  payload.lines.forEach((line) => {
    const lineTotal = (line.qty ?? 0) * (line.unitPrice ?? 0);
    total += lineTotal;

    const y = doc.y;
    doc.text(line.description ?? "", 50, y);
    doc.text(String(line.qty ?? 0), 350, y);
    doc.text((line.unitPrice ?? 0).toFixed(2), 400, y, { width: 90, align: "right" });
    doc.text(lineTotal.toFixed(2), 500, y, { width: 90, align: "right" });
    doc.moveDown();
  });

  doc.moveDown();
  doc.font("Helvetica-Bold").text("TOTAL", 400, doc.y, { width: 90, align: "right" });
  doc.text(total.toFixed(2), 500, doc.y, { width: 90, align: "right" });

  if (payload.notes) {
    doc.moveDown().font("Helvetica").text(`Notes: ${payload.notes}`);
  }

  // Finalize the PDF streams
  doc.end();

  // Make sure the file is fully written before finishing (prevents truncation)
  await new Promise<void>((resolve, reject) => {
    fileStream.on("finish", resolve);
    fileStream.on("error", reject);
  });

  // Do not send JSON here; the PDF stream already went to the response.
}
