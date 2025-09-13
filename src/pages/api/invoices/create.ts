// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import PDFDocument from "pdfkit";

type LineItem = { description: string; qty: number; unitPrice: number };
type InvoicePayload = {
  invoiceNumber: string;
  issuedAt: string;
  currency: string;
  company: { name: string; address: string };
  customer: { id: string; name: string; email: string; address?: string };
  lines: LineItem[];
  notes?: string;
  email?: boolean;
};

async function readJson(req: NextApiRequest): Promise<any> {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const isPreview = req.method === "GET" && req.query.preview === "1";

  let data: InvoicePayload;
  try {
    if (isPreview) {
      data = {
        invoiceNumber: "INV-000123",
        issuedAt: "2025-09-12T12:00:00.000Z",
        currency: "GBP",
        company: { name: "FuelFlow", address: "1 Aviation Way\nLondon\nUK" },
        customer: {
          id: "cust_abc123",
          name: "Jane Pilot",
          email: "jane@example.com",
          address: "2 Runway Road\nGlasgow\nUK",
        },
        lines: [
          { description: "Fuel Uplift — A320", qty: 1, unitPrice: 450.25 },
          { description: "Ramp Service", qty: 1, unitPrice: 75.0 },
        ],
        notes: "Thank you for flying with us.",
        email: false,
      };
    } else if (req.method === "POST") {
      data = (await readJson(req)) as InvoicePayload;
    } else {
      res.setHeader("Allow", "POST, GET");
      return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (e: any) {
    return res.status(400).json({ error: "Invalid JSON body", detail: String(e?.message ?? e) });
  }

  if (!data?.invoiceNumber || !Array.isArray(data?.lines) || data.lines.length === 0) {
    return res.status(400).json({ error: "Missing invoiceNumber or line items" });
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${data.invoiceNumber}.pdf"`);

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  doc.pipe(res);

  // Header
  doc.fontSize(18).text(data.company.name).moveDown(0.2);
  doc.fontSize(10).text(data.company.address).moveDown(1);

  // Invoice meta
  doc
    .fontSize(14)
    .text(`Invoice ${data.invoiceNumber}`, { align: "right" })
    .fontSize(10)
    .text(`Date: ${new Date(data.issuedAt).toLocaleDateString()}`, { align: "right" })
    .moveDown(1);

  // Bill to
  doc.fontSize(12).text("Bill To:").moveDown(0.2);
  doc.fontSize(10).text(data.customer.name);
  if (data.customer.address) doc.text(data.customer.address);
  doc.moveDown(1);

  // Table header
  const startX = doc.x;
  let y = doc.y;
  doc.fontSize(11).text("Description", startX, y, { width: 300 });
  doc.text("Qty", startX + 310, y, { width: 40, align: "right" });
  doc.text("Unit", startX + 360, y, { width: 80, align: "right" });
  doc.text("Amount", startX + 450, y, { width: 80, align: "right" });
  y += 16;
  doc.moveTo(startX, y).lineTo(startX + 530, y).strokeColor("#999").stroke();
  y += 6;

  // Lines
  let total = 0;
  doc.fontSize(10).fillColor("#000");
  for (const line of data.lines) {
    const lineTotal = line.qty * line.unitPrice;
    total += lineTotal;
    doc.text(line.description, startX, y, { width: 300 });
    doc.text(String(line.qty), startX + 310, y, { width: 40, align: "right" });
    doc.text(line.unitPrice.toFixed(2), startX + 360, y, { width: 80, align: "right" });
    doc.text(lineTotal.toFixed(2), startX + 450, y, { width: 80, align: "right" });
    y += 18;
  }

  // Totals
  y += 8;
  doc.moveTo(startX + 360, y).lineTo(startX + 530, y).strokeColor("#999").stroke();
  y += 8;
  doc.fontSize(11).text("Total", startX + 360, y, { width: 80, align: "right" });
  doc.text(`${data.currency} ${total.toFixed(2)}`, startX + 450, y, { width: 80, align: "right" });
  y += 24;

  if (data.notes) {
    doc.moveDown(1);
    doc.fontSize(11).text("Notes").moveDown(0.2);
    doc.fontSize(10).text(data.notes);
  }

  doc.end();
}

