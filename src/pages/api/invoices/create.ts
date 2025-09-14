// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

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

function renderInvoice(doc: PDFDocument, p: InvoicePayload) {
  doc.fontSize(22).text("INVOICE", { align: "right" });
  doc.moveDown();

  doc.fontSize(12)
    .text(`Invoice #: ${p.invoiceNumber}`)
    .text(`Date: ${new Date(p.issuedAt).toLocaleDateString()}`);
  doc.moveDown();

  doc.fontSize(14).text(p.company.name);
  if (p.company.address) doc.fontSize(10).text(p.company.address);
  doc.moveDown();

  doc.fontSize(14).text("Bill To:");
  doc.fontSize(12).text(p.customer.name);
  if (p.customer.address) doc.fontSize(10).text(p.customer.address);
  doc.moveDown();

  // Table header
  doc.fontSize(12)
    .text("Description", 50, doc.y, { continued: true })
    .text("Qty", 350, doc.y, { continued: true })
    .text("Unit", 400, doc.y, { continued: true })
    .text("Line", 470);
  doc.moveTo(50, doc.y + 2).lineTo(560, doc.y + 2).stroke();

  let total = 0;
  p.lines.forEach((l) => {
    const lineTotal = l.qty * l.unitPrice;
    total += lineTotal;
    doc.text(l.description, 50, doc.y + 8, { continued: true })
      .text(String(l.qty), 350, doc.y, { continued: true })
      .text(`${l.unitPrice.toFixed(2)} ${p.currency}`, 400, doc.y, { continued: true })
      .text(`${lineTotal.toFixed(2)} ${p.currency}`, 470);
  });

  doc.moveDown();
  if (p.notes) {
    doc.text("Notes:");
    doc.fontSize(10).text(p.notes);
    doc.fontSize(12);
  }

  doc.moveDown();
  doc.fontSize(14).text(`Total: ${total.toFixed(2)} ${p.currency}`, { align: "right" });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // GET -> simple health/route check
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, route: "/api/invoices/create" });
  }

  try {
    const p = req.body as InvoicePayload;

    if (!p || !p.invoiceNumber || !p.company?.name || !p.customer?.name || !Array.isArray(p.lines)) {
      return res.status(400).json({ ok: false, error: "Invalid payload" });
    }

    const doc = new PDFDocument({ size: "A4", margin: 50 });

    // Collect bytes into a buffer
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("error", (e) => {
      console.error("[invoice] pdfkit error", e);
      if (!res.headersSent) res.status(500).json({ ok: false, error: "PDF error" });
    });

    doc.on("end", () => {
      const pdf = Buffer.concat(chunks);

      // Ensure save directory exists
      const outDir = path.join(process.cwd(), "private", "invoices");
      fs.mkdirSync(outDir, { recursive: true });

      // Save to disk
      const outFile = path.join(outDir, `${p.invoiceNumber}.pdf`);
      try {
        fs.writeFileSync(outFile, pdf);
        console.log("[invoice] saved:", outFile);
      } catch (e) {
        console.error("[invoice] save failed:", e);
      }

      // Send PDF to client (inline if ?preview=1)
      const inline = String(req.query.preview ?? "") === "1";
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `${inline ? "inline" : "attachment"}; filename="${p.invoiceNumber}.pdf"`
      );
      res.status(200).send(pdf);
    });

    // Draw the PDF
    renderInvoice(doc, p);
    doc.end();
  } catch (e: any) {
    console.error("[invoice] handler error", e);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: e?.message || "Unknown error" });
    }
  }
}
