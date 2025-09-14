// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";
import { finished } from "node:stream/promises";

type Party = { name: string; address?: string; email?: string };
type Line = { description: string; qty: number; unitPrice: number };
type InvoicePayload = {
  invoiceNumber: string;
  issuedAt: string;
  currency: string;
  company: Party;
  customer: Party & { id?: string };
  lines: Line[];
  notes?: string;
  email?: boolean;
};

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

// IMPORTANT: do NOT use PDFDocument as a type here
function renderInvoice(doc: any, p: InvoicePayload) {
  doc.fontSize(22).text("INVOICE", { align: "right" }).moveDown();

  doc.fontSize(10)
    .text(`Invoice #: ${p.invoiceNumber}`)
    .text(`Date: ${new Date(p.issuedAt).toLocaleDateString()}`)
    .moveDown();

  doc.fontSize(12).text(p.company.name);
  if (p.company.address) doc.text(p.company.address);
  doc.moveDown();

  doc.text("Bill To:");
  doc.text(p.customer.name);
  if (p.customer.address) doc.text(p.customer.address);
  doc.moveDown();

  // simple table-ish output
  doc.fontSize(12).text("Description", 72, doc.y, { continued: true });
  doc.text("Qty", 340, doc.y, { continued: true });
  doc.text("Unit", 380, doc.y, { continued: true });
  doc.text("Amount", 440);

  let total = 0;
  for (const l of p.lines) {
    const amount = l.qty * l.unitPrice;
    total += amount;

    doc.fontSize(10).text(l.description, 72, doc.y, { continued: true });
    doc.text(String(l.qty), 340, doc.y, { continued: true });
    doc.text(l.unitPrice.toFixed(2), 380, doc.y, { continued: true });
    doc.text(amount.toFixed(2), 440);
  }

  doc.moveDown()
    .fontSize(12)
    .text(`Total: ${total.toFixed(2)} ${p.currency}`, { align: "right" });

  if (p.notes) doc.moveDown().fontSize(10).text(p.notes);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, route: "/api/invoices/create" });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).end("Method Not Allowed");
  }

  const payload = req.body as InvoicePayload;

  // Prepare document + filename
  const filename = `${payload.invoiceNumber}.pdf`;
  const doc = new PDFDocument({ size: "A4", margin: 50 });

  // 1) Stream to client
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  doc.pipe(res);

  // 2) Save to disk (local) or /tmp (Vercel)
  const outDir = process.env.VERCEL
    ? path.join("/tmp", "invoices")
    : path.join(process.cwd(), "private", "invoices");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, filename);
  const fileStream = fs.createWriteStream(outPath);
  doc.pipe(fileStream);

  // Render and finish
  renderInvoice(doc, payload);
  doc.end();

  // Ensure client stream finishes (prevents “resolved without sending a response”)
  await finished(res);
}
