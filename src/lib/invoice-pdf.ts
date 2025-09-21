// src/lib/invoice-pdf.ts
// src/lib/invoice-pdf.ts
import PDFDocument from "pdfkit";

export type Currency = "GBP" | "EUR" | "USD";

export interface InvoiceCompany {
  name: string;
  addressLines: string[]; // ["Line 1", "Line 2", "City", "Postcode", "Country"]
  email?: string;
  phone?: string;
  vatNumber?: string;
  companyNumber?: string;
  logoPngBase64?: string;  // optional brand logo (data URL or raw base64)
}

export interface DeliveryInfo {
  addressLines?: string[];
  date?: string;        // ISO or human date
  vehicleReg?: string;
  driver?: string;
  noteNumber?: string;  // delivery note / ticket id
}

export interface PaymentInfo {
  status: "paid" | "unpaid" | "refunded";
  paidAt?: string;            // ISO/human
  method?: string;            // e.g., "Visa •••• 4242"
  reference?: string;         // PI_ / CH_ / CS_ or your own ID
}

export interface InvoiceItem {
  description: string;   // e.g., "Diesel"
  quantity: number;      // litres
  unitPrice: number;     // price per litre (ex VAT)
  vatRate?: number;      // default 0.2 (20%)
}

export interface InvoicePayload {
  invoiceNumber: string;      // INV-YYYYMMDD-####
  invoiceDate: string;        // ISO/human
  currency: Currency;         // "GBP" etc.
  supplier: InvoiceCompany;
  customer: {
    name: string;
    addressLines?: string[];
    email?: string;
  };
  items: InvoiceItem[];
  notes?: string[];

  // Optional extra context to make it "fuel specific"
  orderReference?: string;
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  delivery?: DeliveryInfo;
  payment?: PaymentInfo;
}

function money(n: number, ccy: Currency) {
  const symbol = ccy === "GBP" ? "£" : ccy === "EUR" ? "€" : "$";
  return symbol + n.toFixed(2);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export async function buildInvoicePdf(payload: InvoicePayload): Promise<Buffer> {
  const {
    invoiceNumber,
    invoiceDate,
    currency,
    supplier,
    customer,
    items,
    notes,
    orderReference,
    stripeSessionId,
    stripePaymentIntentId,
    delivery,
    payment
  } = payload;

  // Pre-calc totals (per-line VAT allowed if mixed rates; default 20%)
  let netTotal = 0;
  let vatTotal = 0;

  const computed = items.map((it) => {
    const rate = it.vatRate ?? 0.2;
    const net = round2(it.quantity * it.unitPrice);
    const vat = round2(net * rate);
    const gross = round2(net + vat);
    netTotal += net;
    vatTotal += vat;
    return { ...it, rate, net, vat, gross };
  });

  netTotal = round2(netTotal);
  vatTotal = round2(vatTotal);
  const grandTotal = round2(netTotal + vatTotal);

  // === PDF
  const doc = new PDFDocument({ size: "A4", margin: 36 });
  const buffers: Buffer[] = [];
  doc.on("data", (d) => buffers.push(d));
  const done = new Promise<Buffer>((resolve) =>
    doc.on("end", () => resolve(Buffer.concat(buffers)))
  );

  // Brand header bar
  doc.rect(0, 0, doc.page.width, 70).fill("#0F172A"); // slate-900
  doc.fill("#FFFFFF");

  // Logo or brand name
  const titleX = 36;
  const titleY = 20;
  if (supplier.logoPngBase64) {
    try {
      const data = supplier.logoPngBase64.startsWith("data:")
        ? supplier.logoPngBase64.split(",")[1]
        : supplier.logoPngBase64;
      doc.image(Buffer.from(data, "base64"), titleX, 12, { height: 46 });
    } catch {
      doc.fontSize(24).text(supplier.name, titleX, titleY);
    }
  } else {
    doc.fontSize(24).text(supplier.name, titleX, titleY);
  }

  // "TAX INVOICE" label
  doc.fontSize(14).text("TAX INVOICE", doc.page.width - 150, 24, { width: 114, align: "right" });

  // Supplier block
  doc.fillColor("#111827"); // slate-900 text
  doc.fontSize(11);
  let y = 90;

  const colLeftX = 36;
  const colRightX = doc.page.width / 2 + 10;

  doc.font("Helvetica-Bold").text("From", colLeftX, y);
  doc.font("Helvetica").moveDown(0.3);
  const sp = [
    supplier.name,
    ...(supplier.addressLines || []),
    supplier.email ? `Email: ${supplier.email}` : undefined,
    supplier.phone ? `Tel: ${supplier.phone}` : undefined,
    supplier.companyNumber ? `Company No: ${supplier.companyNumber}` : undefined,
    supplier.vatNumber ? `VAT No: ${supplier.vatNumber}` : undefined
  ].filter(Boolean) as string[];
  doc.text(sp.join("\n"), { width: doc.page.width / 2 - 48 });

  // Customer block
  doc.font("Helvetica-Bold").text("Bill To", colRightX, y);
  doc.font("Helvetica").moveDown(0.3);
  const cp = [
    customer.name,
    ...(customer.addressLines || []),
    customer.email ? `Email: ${customer.email}` : undefined
  ].filter(Boolean) as string[];
  doc.text(cp.join("\n"), { width: doc.page.width / 2 - 48 });

  // Invoice meta
  y = doc.y + 16;
  doc.moveTo(colLeftX, y).lineTo(doc.page.width - 36, y).strokeColor("#E5E7EB").stroke();

  y += 12;
  doc.font("Helvetica-Bold").text("Invoice No:", colLeftX, y);
  doc.font("Helvetica").text(invoiceNumber, colLeftX + 95, y);

  doc.font("Helvetica-Bold").text("Invoice Date:", colLeftX + 260, y);
  doc.font("Helvetica").text(invoiceDate, colLeftX + 360, y);

  y += 16;
  if (orderReference) {
    doc.font("Helvetica-Bold").text("Order Ref:", colLeftX, y);
    doc.font("Helvetica").text(orderReference, colLeftX + 95, y);
  }

  if (stripePaymentIntentId) {
    doc.font("Helvetica-Bold").text("Payment Ref:", colLeftX + 260, y);
    doc.font("Helvetica").text(stripePaymentIntentId, colLeftX + 360, y);
  } else if (stripeSessionId) {
    doc.font("Helvetica-Bold").text("Payment Ref:", colLeftX + 260, y);
    doc.font("Helvetica").text(stripeSessionId, colLeftX + 360, y);
  }

  // Delivery info (optional)
  if (delivery?.addressLines?.length || delivery?.date || delivery?.noteNumber) {
    y += 22;
    doc.font("Helvetica-Bold").text("Delivery", colLeftX, y);
    doc.font("Helvetica");
    const dl: string[] = [];
    if (delivery.date) dl.push(`Date: ${delivery.date}`);
    if (delivery.noteNumber) dl.push(`Note #: ${delivery.noteNumber}`);
    if (delivery.addressLines?.length) dl.push(`Address: ${delivery.addressLines.join(", ")}`);
    if (delivery.vehicleReg) dl.push(`Vehicle: ${delivery.vehicleReg}`);
    if (delivery.driver) dl.push(`Driver: ${delivery.driver}`);
    doc.text(dl.join("   •   "), colLeftX + 75, y, { width: doc.page.width - colLeftX - 36 });
  }

  // PAID ribbon
  if (payment?.status === "paid") {
    const label = `PAID ${payment.paidAt ? `• ${payment.paidAt}` : ""}${
      payment.method ? ` • ${payment.method}` : ""
    }`;
    const w = doc.widthOfString(label) + 16;
    doc.save()
      .rotate(0, { origin: [doc.page.width - w - 36, 90] })
      .fillColor("#16A34A") // green-600
      .roundedRect(doc.page.width - w - 36, 90, w, 22, 4)
      .fill()
      .fillColor("#FFFFFF")
      .font("Helvetica-Bold")
      .text(label, doc.page.width - w - 28, 95)
      .restore();
    doc.fillColor("#111827");
  }

  // Table header
  y = doc.y + 20;
  const tableX = colLeftX;
  const tableW = doc.page.width - 72;

  const cols = [
    { key: "description", label: "Description", width: 180, align: "left" as const },
    { key: "qty",          label: "Litres",      width: 70,  align: "right" as const },
    { key: "unit",         label: "Unit (ex-VAT)", width: 95, align: "right" as const },
    { key: "net",          label: "Net",         width: 95,  align: "right" as const },
    { key: "rate",         label: "VAT %",       width: 60,  align: "right" as const },
    { key: "vat",          label: "VAT",         width: 95,  align: "right" as const },
    { key: "gross",        label: "Total",       width: 95,  align: "right" as const },
  ];

  // header row
  doc.rect(tableX, y, tableW, 24).fill("#F3F4F6").strokeColor("#E5E7EB").stroke();
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(10);

  let x = tableX + 8;
  cols.forEach((c) => {
    const textX = c.align === "right" ? x + c.width - 8 : x;
    doc.text(c.label, textX, y + 7, { width: c.width - 16, align: c.align });
    x += c.width;
  });

  // rows
  doc.font("Helvetica").fontSize(10);
  let rowY = y + 24;
  computed.forEach((row, idx) => {
    const isZebra = idx % 2 === 1;
    if (isZebra) {
      doc.rect(tableX, rowY, tableW, 22).fill("#FAFAFA");
      doc.fillColor("#111827");
    }

    x = tableX + 8;
    const cells = [
      { v: row.description, align: "left" as const, width: cols[0].width },
      { v: row.quantity.toLocaleString(), align: "right" as const, width: cols[1].width },
      { v: money(row.unitPrice, currency), align: "right" as const, width: cols[2].width },
      { v: money(row.net, currency), align: "right" as const, width: cols[3].width },
      { v: (row.rate * 100).toFixed(0) + "%", align: "right" as const, width: cols[4].width },
      { v: money(row.vat, currency), align: "right" as const, width: cols[5].width },
      { v: money(row.gross, currency), align: "right" as const, width: cols[6].width },
    ];
    cells.forEach((c, i) => {
      const textX = c.align === "right" ? x + c.width - 8 : x;
      doc.text(String(c.v), textX, rowY + 6, { width: c.width - 16, align: c.align });
      x += c.width;
    });

    doc.rect(tableX, rowY, tableW, 22).strokeColor("#E5E7EB").stroke();
    rowY += 22;
  });

  // Totals
  rowY += 8;
  const rightBlockW = cols.slice(-3).reduce((sum, c) => sum + c.width, 0);
  const rightBlockX = tableX + tableW - rightBlockW;

  const totalRows = [
    { label: "Subtotal (Net)", value: money(netTotal, currency) },
    { label: "VAT",            value: money(vatTotal, currency) },
    { label: "Total",          value: money(grandTotal, currency), bold: true },
  ];

  totalRows.forEach((r, i) => {
    const h = 22;
    doc.rect(rightBlockX, rowY, rightBlockW, h).fill(i === totalRows.length - 1 ? "#F3F4F6" : "#FFFFFF").strokeColor("#E5E7EB").stroke();
    doc.fillColor("#111827").font(r.bold ? "Helvetica-Bold" : "Helvetica");

    doc.text(r.label, rightBlockX + 12, rowY + 6, { width: rightBlockW / 2 - 12, align: "left" });
    doc.text(r.value, rightBlockX + rightBlockW / 2, rowY + 6, { width: rightBlockW / 2 - 12, align: "right" });

    rowY += h;
  });

  // Notes
  if ((notes && notes.length) || payment?.status) {
    rowY += 12;
    doc.font("Helvetica-Bold").text("Notes", tableX, rowY);
    doc.font("Helvetica");

    const arr: string[] = [];
    if (payment?.status === "paid") arr.push("This invoice is marked as PAID.");
    if (payment?.reference) arr.push(`Payment ref: ${payment.reference}`);
    if (payment?.method) arr.push(`Payment method: ${payment.method}`);
    if (notes?.length) arr.push(...notes);

    doc.text(arr.join("\n"), tableX, rowY + 16, { width: tableW - 10 });
  }

  // Footer
  doc.fontSize(9).fillColor("#6B7280");
  doc.text(
    `${supplier.name} — Registered in England & Wales${supplier.companyNumber ? " • Company No " + supplier.companyNumber : ""}${supplier.vatNumber ? " • VAT No " + supplier.vatNumber : ""}`,
    36,
    doc.page.height - 40,
    { width: doc.page.width - 72, align: "center" }
  );

  doc.end();
  return done;
}

