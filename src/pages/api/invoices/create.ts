// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import PDFDocument from "pdfkit";

type Line = { description: string; qty: number; unitPrice: number };
type Payload = {
  invoiceNumber: string;
  issuedAt: string;
  currency: string; // e.g. "GBP"
  company: { name: string; address?: string };
  customer: { id?: string; name: string; email?: string; address?: string };
  lines: Line[];
  notes?: string;
  email?: boolean;
};

function currencySymbol(code: string) {
  switch ((code || "").toUpperCase()) {
    case "GBP": return "£";
    case "EUR": return "€";
    case "USD": return "$";
    default: return "";
  }
}

function samplePayload(): Payload {
  return {
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
}

function renderInvoicePDF(data: Payload): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const buffers: Buffer[] = [];
    doc.on("data", (c) => buffers.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(buffers)));

    const sym = currencySymbol(data.currency);
    const issued = new Date(data.issuedAt);

    // Header
    doc.fontSize(18).text(data.company.name, { continued: false });
    if (data.company.address) doc.fontSize(10).text(data.company.address);
    doc.moveDown();

    // Invoice metadata
    doc
      .fontSize(20)
      .text("Invoice", { align: "right" })
      .moveDown(0.5);
    doc
      .fontSize(10)
      .text(`Invoice #: ${data.invoiceNumber}`, { align: "right" })
      .text(`Issued: ${issued.toISOString().slice(0, 10)}`, { align: "right" });

    doc.moveDown();

    // Bill to
    doc.fontSize(12).text("Bill To:", { underline: true });
    doc.text(data.customer.name);
    if (data.customer.email) doc.text(data.customer.email);
    if (data.customer.address) doc.text(data.customer.address);
    doc.moveDown();

    // Table header
    doc.fontSize(11).text("Description", 50, doc.y, { continued: true });
    doc.text("Qty", 350, doc.y, { continued: true });
    doc.text("Unit", 400, doc.y, { continued: true });
    doc.text("Amount", 470, doc.y);
    doc.moveTo(50, doc.y + 3).lineTo(545, doc.y + 3).stroke();
    doc.moveDown(0.5);

    // Lines
    let total = 0;
    data.lines.forEach((l) => {
      const amount = l.qty * l.unitPrice;
      total += amount;
      doc
        .fontSize(10)
        .text(l.description, 50, doc.y, { continued: true })
        .text(String(l.qty), 350, doc.y, { continued: true })
        .text(`${sym}${l.unitPrice.toFixed(2)}`, 400, doc.y, { continued: true })
        .text(`${sym}${amount.toFixed(2)}`, 470, doc.y);
    });

    doc.moveDown();
    doc.moveTo(350, doc.y).lineTo(545, doc.y).stroke();
    doc.fontSize(12).text("Total:", 400, doc.y + 5, { continued: true });
    doc.text(`${sym}${total.toFixed(2)}`, 470, doc.y + 5);

    if (data.notes) {
      doc.moveDown(1.5);
      doc.fontSize(10).text("Notes:", { underline: true });
      doc.text(data.notes);
    }

    doc.end();
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const isPreview = String(req.query.preview || "") === "1";

  let body: Payload | null = null;

  if (req.method === "POST") {
    try {
      body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as Payload;
    } catch {
      res.status(400).json({ error: "Invalid JSON body" });
      return;
    }
  } else if (req.method === "GET" && isPreview) {
    // Allow preview in browser without POST
    body = samplePayload();
  } else {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Use POST with JSON body (or GET ?preview=1)" });
    return;
  }

  try {
    const pdf = await renderInvoicePDF(body!);
    const filename = `${body!.invoiceNumber || "invoice"}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      isPreview ? `inline; filename="${filename}"` : `attachment; filename="${filename}"`
    );
    res.status(200).send(pdf);
  } catch (e) {
    res.status(500).json({ error: "Failed to render invoice PDF" });
  }
}

