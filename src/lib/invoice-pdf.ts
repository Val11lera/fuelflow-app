// src/lib/invoice-pdf.ts
// src/lib/invoice-pdf.ts
import PDFDocument from "pdfkit";

export type InvoicePayload = {
  company: { name: string };
  customer: { name: string; email?: string };
  items: Array<{ description: string; quantity: number; unitPrice: number }>;
  currency: string;    // e.g. "GBP"
  email?: boolean;     // if false, skip sending email
  notes?: string;
};

export async function buildInvoicePdf(
  payload: InvoicePayload
): Promise<{ pdfBuffer: Buffer; filename: string; total: number }> {
  if (!payload.items || payload.items.length === 0) {
    throw new Error("At least one line item is required");
  }

  const doc = new PDFDocument({ size: "A4", margin: 50 });

  doc.fontSize(20).text(payload.company.name).moveDown();
  doc.fontSize(12).text(`Bill to: ${payload.customer.name}`);
  if (payload.customer.email) doc.text(`Email: ${payload.customer.email}`);
  doc.moveDown();

  let total = 0;
  doc.text("Items:").moveDown(0.5);
  payload.items.forEach((it) => {
    const line = (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
    total += line;
    doc.text(
      `${it.description} — qty ${it.quantity} @ ${payload.currency} ${it.unitPrice.toFixed(
        2
      )} = ${payload.currency} ${line.toFixed(2)}`
    );
  });

  doc.moveDown();
  if (payload.notes) doc.text("Notes:").moveDown(0.25).text(payload.notes);

  doc
    .moveDown()
    .fontSize(14)
    .text(`Total: ${payload.currency} ${total.toFixed(2)}`, { align: "right" });

  const pdfBuffer: Buffer = await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });

  const stamp = new Date().toISOString().replace(/[:T\-\.Z]/g, "").slice(0, 14);
  const filename = `INV-${stamp}.pdf`;
  return { pdfBuffer, filename, total };
}

