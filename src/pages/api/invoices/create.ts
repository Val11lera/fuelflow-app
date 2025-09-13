// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import PDFDocument from "pdfkit";

type Line = { description: string; qty: number; unitPrice: number };
type Payload = {
  invoiceNumber: string;
  issuedAt: string; // ISO date
  currency: string; // e.g. "GBP"
  company: { name: string; address?: string };
  customer: { id?: string; name: string; email?: string; address?: string };
  lines: Line[];
  notes?: string;
  email?: boolean; // ignored in this minimal example
};

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
};

function money(v: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(v);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Helpful landing message in the browser
  if (req.method === "GET") {
    return res
      .status(200)
      .send("Invoice API ready. POST JSON to this URL. Example: curl -sS -X POST http://localhost:3000/api/invoices/create -H 'Content-Type: application/json' --data-binary @payload.json -o test-invoice.pdf");
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Next already parsed JSON when Content-Type is application/json
  const data: Payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

  if (!data?.invoiceNumber || !Array.isArray(data?.lines) || !data.lines.length) {
    return res.status(400).json({ error: "Invalid payload: require invoiceNumber and at least one line." });
  }

  const currency = data.currency || "GBP";

  // Set headers before streaming
  res.status(200);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="invoice-${data.invoiceNumber}.pdf"`);

  // Create and stream the PDF
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  doc.pipe(res);

  // Header
  doc
    .fontSize(22)
    .text(data.company?.name || "FuelFlow", { align: "left" })
    .moveDown(0.2)
    .fontSize(10)
    .fillColor("#555")
    .text(data.company?.address || "", { align: "left" })
    .moveDown();

  doc
    .fillColor("#000")
    .fontSize(18)
    .text("INVOICE", { align: "right" })
    .fontSize(10)
    .text(`Invoice #: ${data.invoiceNumber}`, { align: "right" })
    .text(`Date: ${new Date(data.issuedAt || Date.now()).toLocaleDateString("en-GB")}`, { align: "right" })
    .moveDown();

  // Bill to
  doc
    .fontSize(12)
    .text("Bill To:", { underline: true })
    .moveDown(0.2)
    .fontSize(10)
    .text(data.customer?.name || "")
    .text(data.customer?.email || "")
    .text(data.customer?.address || "")
    .moveDown();

  // Table header
  const startY = doc.y + 5;
  doc
    .fontSize(10)
    .text("Description", 50, startY)
    .text("Qty", 340, startY, { width: 50, align: "right" })
    .text("Unit", 400, startY, { width: 80, align: "right" })
    .text("Total", 500, startY, { width: 80, align: "right" });

  doc.moveTo(50, startY + 12).lineTo(560, startY + 12).stroke();

  // Lines
  let y = startY + 18;
  let subtotal = 0;

  for (const line of data.lines) {
    const qty = Number(line.qty || 0);
    const unit = Number(line.unitPrice || 0);
    const total = qty * unit;
    subtotal += total;

    doc
      .fontSize(10)
      .text(line.description, 50, y, { width: 280 })
      .text(String(qty), 340, y, { width: 50, align: "right" })
      .text(money(unit, currency), 400, y, { width: 80, align: "right" })
      .text(money(total, currency), 500, y, { width: 80, align: "right" });

    y += 16;
  }

  // Totals
  y += 10;
  doc.moveTo(350, y).lineTo(560, y).stroke();
  y += 6;

  doc
    .fontSize(10)
    .text("Subtotal", 400, y, { width: 80, align: "right" })
    .text(money(subtotal, currency), 500, y, { width: 80, align: "right" });

  // (No VAT calculation here; add as needed)

  y += 16;
  doc
    .fontSize(12)
    .text("Total", 400, y, { width: 80, align: "right" })
    .text(money(subtotal, currency), 500, y, { width: 80, align: "right" });

  // Notes
  if (data.notes) {
    doc.moveDown().fontSize(10).fillColor("#555").text(data.notes, { width: 500 });
  }

  doc.end(); // this flushes the stream to the response
}
