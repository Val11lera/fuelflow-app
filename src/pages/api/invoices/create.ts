// src/pages/api/invoices/create.ts
cat > src/pages/api/invoices/create.ts <<'TS'
import type { NextApiRequest, NextApiResponse } from "next";
import PDFDocument from "pdfkit";

type Line = { description: string; qty: number; unitPrice: number };

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Simple GET to prove the route is present
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, route: "/api/invoices/create" });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).end("Method Not Allowed");
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  const {
    invoiceNumber = "INV-TEST",
    issuedAt = new Date().toISOString(),
    currency = "GBP",
    company = { name: "FuelFlow", address: "" },
    customer = { name: "", email: "", address: "" },
    lines = [] as Line[],
    notes = "",
  } = body;

  // Start PDF stream
  const doc = new PDFDocument({ margin: 50 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${invoiceNumber}.pdf"`);
  doc.pipe(res);

  // Header
  doc.fontSize(22).text("Invoice", { align: "right" });
  doc.moveDown();
  doc.fontSize(12).text(`Invoice #: ${invoiceNumber}`);
  doc.text(`Date: ${issuedAt}`);
  doc.text(`Currency: ${currency}`);
  doc.moveDown();

  // Company / Customer
  doc.fontSize(14).text(company.name);
  if (company.address) doc.fontSize(10).text(company.address);
  doc.moveDown();
  doc.fontSize(12).text("Bill To:");
  doc.text(customer.name);
  if (customer.email) doc.text(customer.email);
  if (customer.address) doc.text(customer.address);
  doc.moveDown();

  // Table header
  doc.fontSize(12).text("Description", 50, doc.y, { continued: true });
  doc.text("Qty", 350, doc.y, { continued: true });
  doc.text("Unit", 400, doc.y, { continued: true });
  doc.text("Total", 470);
  doc.moveDown();

  // Lines
  let subtotal = 0;
  (lines as Line[]).forEach((l) => {
    const lineTotal = l.qty * l.unitPrice;
    subtotal += lineTotal;
    doc.text(l.description, 50, doc.y, { continued: true });
    doc.text(String(l.qty), 350, doc.y, { continued: true });
    doc.text(l.unitPrice.toFixed(2), 400, doc.y, { continued: true });
    doc.text(lineTotal.toFixed(2), 470);
  });

  doc.moveDown().text(`Subtotal: ${subtotal.toFixed(2)}`, { align: "right" });

  if (notes) {
    doc.moveDown().fontSize(12).text("Notes:");
    doc.fontSize(10).text(notes);
  }

  doc.end(); // this flushes the PDF to the response
}
TS
