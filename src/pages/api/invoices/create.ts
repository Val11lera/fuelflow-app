// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";

// NOTE: We use require for pdfkit so the module is loaded only on the server.
const PDFDocument = require("pdfkit");

/** Utility to format currency */
function money(n: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

type Line = { description: string; qty: number; unitPrice: number };
type InvoiceBody = {
  invoiceNumber: string;
  issuedAt: string; // ISO string
  currency?: string;
  company: { name: string; address?: string };
  customer: { id?: string; name: string; email?: string; address?: string };
  lines: Line[];
  notes?: string;
  email?: boolean; // ignored here (email sending not implemented in this route)
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Simple GET “preview” so you can see the route exists
  if (req.method === "GET") {
    res.status(200).json({
      ok: true,
      route: "/api/invoices/create",
      usage: "POST JSON body to receive a PDF invoice",
      exampleBodyKeys: [
        "invoiceNumber",
        "issuedAt",
        "currency",
        "company",
        "customer",
        "lines",
        "notes",
      ],
    });
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Validate body (very lightly)
  const body = req.body as InvoiceBody;
  if (
    !body ||
    !body.invoiceNumber ||
    !body.issuedAt ||
    !body.company?.name ||
    !body.customer?.name ||
    !Array.isArray(body.lines) ||
    body.lines.length === 0
  ) {
    return res.status(400).json({ error: "Missing required invoice fields" });
  }

  const currency = body.currency || "GBP";

  // Prepare HTTP response as a PDF stream
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${body.invoiceNumber}.pdf"`
  );

  // Build the PDF
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  doc.pipe(res);

  // Header
  doc.fontSize(20).text("Invoice", { align: "right" });
  doc.moveDown(0.2);
  doc
    .fontSize(10)
    .text(`Invoice #: ${body.invoiceNumber}`, { align: "right" })
    .text(`Issued: ${new Date(body.issuedAt).toLocaleString()}`, { align: "right" })
    .moveDown(1.2);

  // From / To blocks
  doc.fontSize(12).text(body.company.name, 50, doc.y);
  if (body.company.address) doc.fontSize(10).text(body.company.address);

  doc.moveUp(2);
  const rightX = 330;
  doc.fontSize(12).text("Bill To:", rightX, doc.y);
  doc.fontSize(10).text(body.customer.name);
  if (body.customer.email) doc.text(body.customer.email);
  if (body.customer.address) doc.text(body.customer.address);
  doc.moveDown();

  // Table header
  doc.moveDown(0.7);
  doc.fontSize(11).text("Description", 50, doc.y);
  doc.text("Qty", 330, doc.y, { width: 60, align: "right" });
  doc.text("Unit Price", 390, doc.y, { width: 90, align: "right" });
  doc.text("Line Total", 480, doc.y, { width: 90, align: "right" });
  doc.moveTo(50, doc.y + 3).lineTo(550, doc.y + 3).stroke();

  // Table lines
  let subtotal = 0;
  doc.moveDown(0.5);
  body.lines.forEach((ln) => {
    const lineTotal = ln.qty * ln.unitPrice;
    subtotal += lineTotal;

    doc.fontSize(10).text(ln.description, 50, doc.y);
    doc.text(String(ln.qty), 330, doc.y, { width: 60, align: "right" });
    doc.text(money(ln.unitPrice, currency), 390, doc.y, { width: 90, align: "right" });
    doc.text(money(lineTotal, currency), 480, doc.y, { width: 90, align: "right" });
    doc.moveDown(0.3);
  });

  // Totals
  doc.moveDown(0.8);
  doc.moveTo(350, doc.y).lineTo(550, doc.y).stroke();
  doc.fontSize(11).text("Subtotal", 390, doc.y + 5, { width: 90, align: "right" });
  doc.text(money(subtotal, currency), 480, doc.y, { width: 90, align: "right" });

  // (No tax/shipping lines in this simple sample, add as needed)

  // Notes
  if (body.notes) {
    doc.moveDown(1.2);
    doc.fontSize(10).text("Notes:", 50, doc.y);
    doc.fontSize(10).text(body.notes, 50, doc.y + 2);
  }

  // Footer
  doc.moveDown(1.2);
  doc.fontSize(9).fillColor("#555").text("Thank you for your business.", 50, doc.y);

  doc.end(); // <-- important to finish the PDF stream
}

// Let Next parse JSON up to 1mb
export const config = {
  api: {
    bodyParser: { sizeLimit: "1mb" },
  },
};

