// src/lib/invoice-pdf.ts
import PDFDocument from "pdfkit";

export type InvoicePayload = {
  company: { name: string };
  customer: { name: string; email?: string };
  items: Array<{ description: string; quantity: number; unitPrice: number }>;
  currency: string;
  email?: boolean;
  notes?: string;
};

export async function buildInvoicePdf(
  payload: InvoicePayload
): Promise<{ pdfBuffer: Buffer; filename: string; total: number }> {
  if (!payload.items || payload.items.length === 0) {
    throw new Error("At least one line item is required");
  }

  const doc = new PDFDocument({ size: "A4", margin: 50 });

  // Header
  doc.fontSize(20).text(payload.company.name, { align: "left" }).moveDown();
  doc.fontSize(12).text(`Bill to: ${payload.customer.name}`);
  if (payload.customer.email) doc.text(`Email: ${payload.customer.email}`);
  doc.moveDown();

  // Items
  let total = 0;
  doc.fontSize(12).text("Items:").moveDown(0.5);
  payload.items.forEach((it) => {
    const lineTotal = (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
    total += lineTotal;
    doc.text(
      `${it.description} — qty ${it.quantity} @ ${payload.currency} ${it.unitPrice.toFixed(
        2
      )}  =  ${payload.currency} ${lineTotal.toFixed(2)}`
    );
  });

  doc.moveDown();
  if (payload.notes) {
    doc.text("Notes:").moveDown(0.25).text(payload.notes).moveDown();
  }

  doc.moveDown().fontSize(14).text(`Total: ${payload.currency} ${total.toFixed(2)}`, {
    align: "right",
  });

  const pdfBuffer: Buffer = await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end(); // IMPORTANT
  });

  const stamp = new Date().toISOString().replace(/[:T\-\.Z]/g, "").slice(0, 14);
  const filename = `INV-${stamp}.pdf`;

  return { pdfBuffer, filename, total };
}

