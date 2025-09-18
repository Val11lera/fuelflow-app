// src/lib/invoice-pdf.ts
// src/lib/invoice-pdf.ts
import PDFDocument from "pdfkit";

// ---------- Types ----------
export type InvoiceItem = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export type InvoicePayload = {
  company: { name: string };
  customer: { name: string; email?: string };
  items: InvoiceItem[];
  currency: string;   // e.g. "GBP"
  notes?: string;
};

// ---------- Helpers ----------
function money(n: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function totalOf(items: InvoiceItem[]) {
  return items.reduce(
    (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
    0
  );
}

// Convert a PDFKit document stream into a single Buffer
function docToBuffer(doc: any): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer | Uint8Array) =>
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))
    );
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

// ---------- Builder ----------
export async function buildInvoicePdf(payload: InvoicePayload): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 50 });

  // Header
  doc.font("Helvetica-Bold").fontSize(18).text(payload.company.name);
  doc.moveDown();
  doc.font("Helvetica").fontSize(12).text(`Bill To: ${payload.customer.name}`);
  doc.moveDown();

  // Items table header
  doc.font("Helvetica-Bold");
  doc.text("Description", { continued: true });
  doc.text("Qty", 300, doc.y, { width: 50, align: "right", continued: true });
  doc.text("Unit", 360, doc.y, { width: 80, align: "right", continued: true });
  doc.text("Line", 445, doc.y, { width: 100, align: "right" });
  doc.moveDown(0.5);

  // Items
  doc.font("Helvetica");
  payload.items.forEach((it) => {
    const qty = Number(it.quantity) || 0;
    const unit = Number(it.unitPrice) || 0;
    const line = qty * unit;

    doc.text(it.description, { continued: true });
    doc.text(String(qty), 300, doc.y, { width: 50, align: "right", continued: true });
    doc.text(money(unit, payload.currency), 360, doc.y, { width: 80, align: "right", continued: true });
    doc.text(money(line, payload.currency), 445, doc.y, { width: 100, align: "right" });
  });

  doc.moveDown();

  // Total (switch font to bold instead of using { bold: true })
  const total = totalOf(payload.items);
  doc.font("Helvetica-Bold");
  doc.text(`Total: ${money(total, payload.currency)}`, 445, doc.y, {
    width: 100,
    align: "right",
  });
  doc.font("Helvetica");

  // Notes
  if (payload.notes) {
    doc.moveDown();
    doc.font("Helvetica-Oblique").text(payload.notes);
    doc.font("Helvetica");
  }

  return docToBuffer(doc);
}

