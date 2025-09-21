// src/lib/invoice-pdf.ts
// src/lib/invoice-pdf.ts
import PDFDocument from "pdfkit";

export type LineItemLike = {
  description: string;
  quantity: number;          // e.g. litres
  unitPrice: number;         // major units, e.g. 1.71 for £1.71
};

export type CustomerLike = {
  name?: string | null;
  email?: string | null;
  company?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  postcode?: string | null;
};

export type OrderLike = {
  // If you already generate invoice/order numbers, pass them in
  invoiceNumber?: string;
  orderId?: string;

  currency?: string;          // "GBP" | "EUR" | "USD" ...
  items?: LineItemLike[];     // required at runtime (we guard below)
  customer?: CustomerLike;    // recommended
  meta?: { notes?: string } | null;
  issueDate?: string | Date;  // optional override of "today"
};

export type BuiltInvoice = {
  pdfBuffer: Buffer;
  filename: string;
  total: number;              // numeric total in major units
};

/* ---------------------------------- utils --------------------------------- */

function currencySymbol(cur: string | undefined): string {
  const c = (cur || "").toUpperCase();
  if (c === "GBP") return "£";
  if (c === "EUR") return "€";
  if (c === "USD") return "$";
  return "";
}

function toDateText(d?: string | Date) {
  const date = d ? new Date(d) : new Date();
  return date.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/* ------------------------------- main builder ------------------------------ */

export async function buildInvoicePdf(order: OrderLike): Promise<BuiltInvoice> {
  // Company identity (all optional – pulled from env if present)
  const companyName = process.env.COMPANY_NAME || "FuelFlow";
  const companyAddress =
    process.env.COMPANY_ADDRESS ||
    "1 Example Street\nExample Town\nEX1 2MP\nUnited Kingdom";
  const companyVat = process.env.COMPANY_VAT || ""; // e.g. "GB123456789"
  const companyReg = process.env.COMPANY_REG || ""; // e.g. Companies House number

  // Optional payment details
  const bankName = process.env.COMPANY_BANK_NAME || "";
  const bankSort = process.env.COMPANY_BANK_SORT || "";
  const bankAcc  = process.env.COMPANY_BANK_ACC  || "";
  const bankIban = process.env.COMPANY_IBAN || "";
  const bankSwift = process.env.COMPANY_SWIFT || "";

  const currency = (order.currency || "GBP").toUpperCase();
  const sym = currencySymbol(currency);

  const invoiceNumber =
    order.invoiceNumber || `INV-${Math.floor(Date.now() / 1000)}`;
  const issueDateText = toDateText(order.issueDate);

  const items: LineItemLike[] = Array.isArray(order.items) ? order.items : [];
  const customer: CustomerLike = order.customer ?? {};

  // Calculate totals
  const subtotal = items.reduce((sum, it) => {
    const qty = Number(it.quantity || 0);
    const unit = Number(it.unitPrice || 0);
    return sum + qty * unit;
  }, 0);

  // If you later add VAT, discounts, delivery, etc, compute here
  const total = subtotal;

  // ----- Begin PDF -----
  const doc = new PDFDocument({ size: "A4", margin: 50 });

  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c as Buffer));
  const finished = new Promise<void>((resolve) => doc.on("end", resolve));

  /* Header */
  doc
    .fontSize(22)
    .fillColor("#111")
    .text(companyName, { continued: false });

  doc
    .moveDown(0.3)
    .fontSize(10)
    .fillColor("#666")
    .text(companyAddress);

  if (companyReg) doc.text(`Company No: ${companyReg}`);
  if (companyVat) doc.text(`VAT: ${companyVat}`);

  doc.moveDown(1);

  /* Invoice meta line */
  doc.fillColor("#111").fontSize(16).text(`Invoice ${invoiceNumber}`);
  doc.moveDown(0.2);
  doc
    .fontSize(10)
    .fillColor("#333")
    .text(`Date: ${issueDateText}`);
  if (order.orderId) doc.text(`Order: ${order.orderId}`);

  doc.moveDown(1);

  /* Bill To */
  doc.fillColor("#111").fontSize(12).text("Bill To:");
  doc.fontSize(10).fillColor("#333");
  if (customer.company) doc.text(customer.company);
  doc.text(customer.name || "Customer");
  if (customer.address_line1) doc.text(String(customer.address_line1));
  if (customer.address_line2) doc.text(String(customer.address_line2));
  if (customer.city || customer.postcode)
    doc.text(
      [customer.city, customer.postcode].filter(Boolean).join(" ")
    );

  doc.moveDown(1);

  /* Table header */
  const left = 50;
  const right = 545;
  const col1 = left;  // Description
  const col2 = 350;   // Qty
  const col3 = 430;   // Unit
  const col4 = 500;   // Line

  doc
    .fontSize(11)
    .fillColor("#111")
    .text("Description", col1, doc.y, { continued: true })
    .text("Qty", col2, doc.y, { width: 60, align: "right", continued: true })
    .text("Unit", col3, doc.y, { width: 60, align: "right", continued: true })
    .text("Line", col4, doc.y, { width: right - col4, align: "right" });

  doc
    .moveTo(left, doc.y + 4)
    .lineTo(right, doc.y + 4)
    .stroke();

  doc.moveDown(0.6);

  /* Table rows */
  doc.fontSize(10).fillColor("#333");
  items.forEach((it) => {
    const qty = Number(it.quantity || 0);
    const unit = Number(it.unitPrice || 0);
    const line = qty * unit;

    doc
      .text(it.description, col1, doc.y, { continued: true })
      .text(String(qty), col2, doc.y, { width: 60, align: "right", continued: true })
      .text(`${sym}${unit.toFixed(2)}`, col3, doc.y, { width: 60, align: "right", continued: true })
      .text(`${sym}${line.toFixed(2)}`, col4, doc.y, { width: right - col4, align: "right" });

    doc.moveDown(0.3);
  });

  doc.moveDown(0.8);
  doc.moveTo(left, doc.y).lineTo(right, doc.y).stroke();
  doc.moveDown(0.6);

  /* Totals */
  doc
    .fontSize(11)
    .fillColor("#111")
    .text("Subtotal:", col3, doc.y, { width: 60, align: "right", continued: true })
    .text(`${sym}${subtotal.toFixed(2)}`, col4, doc.y, { width: right - col4, align: "right" });

  doc
    .fontSize(12)
    .text("Total:", col3, doc.y + 6, { width: 60, align: "right", continued: true })
    .text(`${sym}${total.toFixed(2)}`, col4, doc.y + 6, { width: right - col4, align: "right" });

  /* Notes / payment info */
  doc.moveDown(1.2);
  if (order.meta?.notes) {
    doc.fontSize(10).fillColor("#444").text(order.meta.notes);
    doc.moveDown(0.8);
  }

  // Lightly show payment details if provided via env
  if (bankName || bankAcc || bankSort || bankIban || bankSwift) {
    doc
      .fontSize(10)
      .fillColor("#111")
      .text("Payment details", { underline: true });
    doc.fillColor("#444");
    if (bankName)  doc.text(`Bank: ${bankName}`);
    if (bankAcc)   doc.text(`Account: ${bankAcc}`);
    if (bankSort)  doc.text(`Sort Code: ${bankSort}`);
    if (bankIban)  doc.text(`IBAN: ${bankIban}`);
    if (bankSwift) doc.text(`SWIFT/BIC: ${bankSwift}`);
  }

  doc.end();
  await finished;

  const pdfBuffer = Buffer.concat(chunks);
  const filename = `${invoiceNumber}.pdf`;

  return {
    pdfBuffer,
    filename,
    total: Number(total.toFixed(2)),
  };
}
