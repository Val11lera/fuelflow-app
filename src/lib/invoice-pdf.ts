// src/lib/invoice-pdf.ts
import PDFDocument from "pdfkit";
import type { InvoicePayload } from "./invoice-types";

function fmtMoney(n: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${Number(n || 0).toFixed(2)}`;
  }
}

function docToBuffer(doc: PDFDocument): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

export async function buildInvoicePdf(payload: InvoicePayload): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 50 });

  // Header
  doc.font("Helvetica-Bold").fontSize(20).text(payload.company.name);
  doc.moveDown(0.25);
  doc.font("Helvetica").fontSize(12).text(`Invoice for ${payload.customer.name}`);

  doc.moveDown();

  // Table header
  doc.font("Helvetica-Bold");
  doc.text("Description", 50, doc.y, { continued: true });
  doc.text("Qty", 300, doc.y, { continued: true });
  doc.text("Unit", 350, doc.y, { continued: true });
  doc.text("Line", 420, doc.y);
  doc.moveDown(0.5);
  doc.font("Helvetica");

  // Items
  let total = 0;
  for (const it of payload.items) {
    const qty = Number(it.quantity) || 0;
    const price = Number(it.unitPrice) || 0;
    const line = qty * price;
    total += line;

    doc.text(it.description, 50, doc.y, { continued: true });
    doc.text(String(qty), 300, doc.y, { continued: true });
    doc.text(fmtMoney(price, payload.currency), 350, doc.y, { continued: true });
    doc.text(fmtMoney(line, payload.currency), 420, doc.y);
    doc.moveDown(0.2);
  }

  doc.moveDown();

  // Total (make it bold by switching font, not a 'bold' option)
  doc.font("Helvetica-Bold").text(`Total: ${fmtMoney(total, payload.currency)}`);
  doc.font("Helvetica");

  if (payload.notes) {
    doc.moveDown();
    doc.text(payload.notes);
  }

  doc.end();
  return docToBuffer(doc);
}
