// src/lib/invoice-pdf.ts
import PDFDocument from "pdfkit";
import type { InvoicePayload } from "@/types/invoice";

export function buildInvoicePdf(payload: InvoicePayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });

    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Header
    doc.fontSize(18).text(`Invoice ${payload.invoiceNumber}`, { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Issued: ${payload.issuedAt}`);
    doc.text(`Currency: ${payload.currency}`);
    doc.moveDown();

    // From
    doc.fontSize(12).text("From:", { underline: true });
    doc.fontSize(11).text(payload.company.name);
    if (payload.company.address) doc.text(payload.company.address);
    doc.moveDown();

    // To
    doc.fontSize(12).text("Bill To:", { underline: true });
    doc.fontSize(11).text(`${payload.customer.name}${payload.customer.email ? " <" + payload.customer.email + ">" : ""}`);
    if (payload.customer.address) doc.text(payload.customer.address);
    doc.moveDown();

    // Lines
    let total = 0;
    doc.fontSize(12).text("Items:", { underline: true });
    doc.moveDown(0.3);

    payload.lines.forEach((l) => {
      const lineTotal = (l.qty || 0) * (l.unitPrice || 0);
      total += lineTotal;
      doc.fontSize(11).text(`${l.description} — ${l.qty} × ${l.unitPrice.toFixed(2)} = ${lineTotal.toFixed(2)}`);
    });

    doc.moveDown();
    doc.fontSize(13).text(`Total: ${total.toFixed(2)} ${payload.currency}`, { underline: true });

    if (payload.notes) {
      doc.moveDown();
      doc.fontSize(11).text(payload.notes);
    }

    doc.end();
  });
}
