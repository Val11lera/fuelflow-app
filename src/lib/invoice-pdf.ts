// src/lib/invoice-pdf.ts
// src/lib/invoice-pdf.ts
import PDFDocument from "pdfkit";

export type InvoiceItem = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export type InvoicePayload = {
  customer: { name: string; email?: string };
  items: InvoiceItem[];
  currency: string; // e.g. "GBP"
  notes?: string;
  /** Optional flag: when true the /api will attempt to email the PDF */
  email?: boolean;
};

type PdfDoc = InstanceType<typeof PDFDocument>;

function docToBuffer(doc: PdfDoc): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

function money(n: number, ccy: string) {
  // basic formatting; adapt as needed
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: ccy || "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export async function buildInvoicePdf(payload: InvoicePayload): Promise<{
  pdfBuffer: Buffer;
  filename: string;
  total: number;
}> {
  if (!payload.items?.length) {
    throw new Error("At least one line item is required");
  }

  const total = payload.items.reduce(
    (sum, it) => sum + it.quantity * it.unitPrice,
    0
  );

  // Basic file name: INV_<timestamp>.pdf
  const id = `INV-${Date.now()}`;
  const filename = `${id}.pdf`;

  const doc = new PDFDocument({ size: "A4", margin: 50 });

  // Header
  doc.font("Helvetica-Bold").fontSize(20).text("Invoice", { align: "left" });
  doc.moveDown();
  doc.font("Helvetica").fontSize(12).text(`Invoice No: ${id}`);
  doc.text(`Customer: ${payload.customer?.name ?? ""}`);
  if (payload.customer?.email) doc.text(`Email: ${payload.customer.email}`);
  doc.moveDown();

  // Items table (super simple)
  doc.font("Helvetica-Bold").text("Description", 50, doc.y);
  doc.text("Qty", 350, undefined);
  doc.text("Unit", 400, undefined);
  doc.text("Amount", 470, undefined);
  doc.moveDown();

  doc.font("Helvetica");
  payload.items.forEach((it) => {
    const amount = it.quantity * it.unitPrice;
    doc.text(it.description, 50, doc.y);
    doc.text(String(it.quantity), 350, undefined);
    doc.text(money(it.unitPrice, payload.currency), 400, undefined);
    doc.text(money(amount, payload.currency), 470, undefined);
    doc.moveDown(0.5);
  });

  doc.moveDown();
  doc.font("Helvetica-Bold").text(`Total: ${money(total, payload.currency)}`);
  doc.font("Helvetica");

  if (payload.notes) {
    doc.moveDown();
    doc.text(payload.notes);
  }

  // Stream to buffer and return
  const pdfBuffer = await docToBuffer(doc);
  return { pdfBuffer, filename, total };
}
