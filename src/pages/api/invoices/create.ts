// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import PDFDocument from "pdfkit";

type Party = { name: string; address?: string; email?: string };
type Line = { description: string; qty: number; unitPrice: number };
type InvoicePayload = {
  invoiceNumber: string;
  issuedAt: string; // ISO date
  currency: string; // e.g. "GBP"
  company: Party;
  customer: Party & { id?: string };
  lines: Line[];
  notes?: string;
  email?: boolean;
};

export const config = {
  api: {
    bodyParser: { sizeLimit: "1mb" }, // we accept JSON body
  },
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    // Simple health/preview ping so you can visit /api/invoices/create?preview=1
    return res.status(200).json({ ok: true, route: "/api/invoices/create" });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const data = req.body as Partial<InvoicePayload>;

  // Basic validation
  if (
    !data ||
    !data.invoiceNumber ||
    !data.issuedAt ||
    !data.currency ||
    !data.company?.name ||
    !data.customer?.name ||
    !Array.isArray(data.lines) ||
    data.lines.length === 0
  ) {
    return res.status(400).json({ error: "Invalid invoice payload" });
  }

  // Calculate totals
  const subtotal = data.lines.reduce(
    (sum, l) => sum + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0),
    0
  );
  const total = subtotal; // add tax here if you need

  // Prepare PDF response headers
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${data.invoiceNumber}.pdf"`
  );

  // Create and stream PDF
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  doc.pipe(res);

  // ---- Title / header
  doc
    .fontSize(20)
    .text("FuelFlow Invoice", { align: "right" })
    .moveDown(0.5);

  doc
    .fontSize(12)
    .text(`Invoice #: ${data.invoiceNumber}`, { align: "right" })
    .text(`Issued: ${new Date(data.issuedAt).toDateString()}`, {
      align: "right",
    })
    .moveDown(1);

  // Company & customer blocks
  doc
    .fontSize(12)
    .text(data.company.name)
    .text(data.company.address || "")
    .text(data.company.email || "")
    .moveDown(1);

  doc.text("Bill To:").text(data.customer.name);
  if (data.customer.address) doc.text(data.customer.address);
  if (data.customer.email) doc.text(data.customer.email);
  doc.moveDown(1);

  // Table header
  doc
    .fontSize(12)
    .text("Description", 50, doc.y, { continued: true })
    .text("Qty", 350, doc.y, { width: 50, continued: true, align: "right" })
    .text("Unit", 410, doc.y, { width: 80, continued: true, align: "right" })
    .text("Line Total", 500, doc.y, { width: 80, align: "right" });
  doc.moveTo(50, doc.y + 4).lineTo(550, doc.y + 4).stroke();
  doc.moveDown(0.5);

  // Table rows
  data.lines.forEach((l) => {
    const lineTotal = (Number(l.qty) || 0) * (Number(l.unitPrice) || 0);
    doc
      .text(l.description, 50, doc.y, { continued: true })
      .text(String(l.qty), 350, doc.y, { width: 50, continued: true, align: "right" })
      .text(lineTotal === 0 ? "0.00" : (Number(l.unitPrice)).toFixed(2), 410, doc.y, {
        width: 80,
        continued: true,
        align: "right",
      })
      .text(lineTotal.toFixed(2), 500, doc.y, { width: 80, align: "right" });
    doc.moveDown(0.3);
  });

  doc.moveDown(1);
  doc
    .fontSize(12)
    .text(`Subtotal: ${subtotal.toFixed(2)} ${data.currency}`, { align: "right" })
    .text(`Total: ${total.toFixed(2)} ${data.currency}`, { align: "right" })
    .moveDown(1);

  if (data.notes) {
    doc.fontSize(11).text("Notes:").moveDown(0.3).text(data.notes);
  }

  doc.end(); // this finishes the PDF and the HTTP response
}
