// src/lib/invoice-pdf.ts
// src/lib/invoice-pdf.ts
import PDFDocument from "pdfkit";

export type InvoiceItem = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export type InvoicePayload = {
  company: { name: string };
  customer: { name: string; email?: string };
  items: InvoiceItem[];
  currency: string;
  email?: boolean; // optional flag (defaults true if customer.email exists)
  notes?: string;
};

export async function buildInvoicePdf(payload: InvoicePayload): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 50 });

  // Buffer collector
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  // Simple layout
  doc.fontSize(18).text(payload.company.name, { underline: true });
  doc.moveDown();
  doc.fontSize(12).text(`Bill to: ${payload.customer.name}`);
  if (payload.customer.email) doc.text(`Email: ${payload.customer.email}`);
  doc.moveDown();

  doc.text("Items");
  doc.moveDown(0.5);

  let total = 0;
  payload.items.forEach((it) => {
    const line = `${it.description} — ${it.quantity} × ${fmtMoney(it.unitPrice, payload.currency)}`;
    const lineTotal = (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
    total += lineTotal;
    doc.text(`${line} = ${fmtMoney(lineTotal, payload.currency)}`);
  });

  doc.moveDown();
  doc.text(`Total: ${fmtMoney(total, payload.currency)}`, { bold: true });

  if (payload.notes) {
    doc.moveDown();
    doc.text(payload.notes);
  }

  doc.end();
  return done;
}

function fmtMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
