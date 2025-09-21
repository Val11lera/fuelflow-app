// src/lib/invoice-pdf.ts// src/lib/invoice-pdf.ts
// src/lib/invoice-pdf.ts 21/09/25
// src/lib/invoice-pdf.ts
// Minimal PDF builder using pdfkit that accepts an optional `company` field.

import PDFDocument from "pdfkit";

// Reusable types for the PDF builder
export type Party = {
  name: string;
  email?: string;
  address1?: string;
  address2?: string;
};

export type InvoiceItem = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export type InvoicePayload = {
  // 👇 this is the important addition (it was missing before)
  company?: Party;            // optional — safe for old/new callers
  customer: Party;
  items: InvoiceItem[];
  currency: string;           // e.g. "GBP" | "USD" | "EUR"
  notes?: string;
  /** Optional flag: when true your API may choose to email the PDF */
  email?: boolean;
};

type PdfDoc = InstanceType<typeof PDFDocument>;

function docToBuffer(doc: PdfDoc): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function money(n: number, ccy: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: ccy,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export type BuiltInvoice = {
  pdfBuffer: Buffer;
  filename: string;
  total: number;
};

/**
 * Build an invoice PDF and return its Buffer + a suggested filename + total.
 */
export async function buildInvoicePdf(p: InvoicePayload): Promise<BuiltInvoice> {
  const doc = new PDFDocument({ size: "A4", margin: 50 }) as PdfDoc;
  const done = docToBuffer(doc);

  // Header
  doc.fontSize(22).text("INVOICE", { align: "right" }).moveDown();

  // From / To (use company if provided)
  if (p.company) {
    doc.fontSize(12).text(p.company.name);
    if (p.company.address1) doc.text(p.company.address1);
    if (p.company.address2) doc.text(p.company.address2);
    if (p.company.email) doc.text(p.company.email);
    doc.moveDown(0.5);
  }

  doc.fontSize(12).text("Bill To:").moveDown(0.2);
  doc.text(p.customer.name);
  if (p.customer.address1) doc.text(p.customer.address1);
  if (p.customer.address2) doc.text(p.customer.address2);
  if (p.customer.email) doc.text(p.customer.email);
  doc.moveDown();

  // Table-ish header
  doc.text("Description".padEnd(40), { continued: true })
     .text("Qty".padStart(4), { continued: true })
     .text("Unit".padStart(8), { continued: true })
     .text("Amount".padStart(12));
  doc.moveDown(0.2);

  let total = 0;
  for (const line of p.items) {
    const amount = line.quantity * line.unitPrice;
    total += amount;
    doc.text(
      `${line.description.padEnd(40)} ${String(line.quantity).padStart(4)} ${line.unitPrice
        .toFixed(2)
        .padStart(8)} ${amount.toFixed(2).padStart(12)}`
    );
  }

  doc.moveDown();
  doc.fontSize(12).text(`Total: ${money(total, p.currency)}`, { align: "right" });

  if (p.notes) {
    doc.moveDown().fontSize(10).text(p.notes);
  }

  doc.end();

  const pdfBuffer = await done;
  // Simple filename — adjust as needed
  const filename = `INV-${Date.now()}.pdf`;
  return { pdfBuffer, filename, total };
}

