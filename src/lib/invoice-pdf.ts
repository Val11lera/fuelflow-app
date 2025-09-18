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
  // compute total
  const total = payload.items.reduce(
    (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
    0
  );

  const filename = `INV-${new Date()
    .toISOString()
    .replace(/[:T\-\.Z]/g, "")
    .slice(0, 14)}.pdf`;

  const doc = new PDFDocument({ size: "A4", margin: 50 });

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  // Very simple layout
  doc.fontSize(18).text(payload.company.name);
  doc.moveDown();
  doc.fontSize(12).text(`Bill To: ${payload.customer.name}`);
  if (payload.customer.email) doc.text(`Email: ${payload.customer.email}`);
  doc.moveDown();

  doc.text("Items:");
  doc.moveDown(0.5);

  payload.items.forEach((it) => {
    doc.text(
      `${it.description} — qty ${it.quantity} @ ${payload.currency} ${it.unitPrice.toFixed(
        2
      )}`
    );
  });

  doc.moveDown();
  doc.text(`Total: ${payload.currency} ${total.toFixed(2)}`, { underline: true });

  if (payload.notes) {
    doc.moveDown();
    doc.text(`Notes: ${payload.notes}`);
  }

  doc.end();
  const pdfBuffer = await done;

  return { pdfBuffer, filename, total };
}
