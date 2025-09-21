// src/lib/invoice-pdf.ts
// src/lib/invoice-pdf.ts
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

/* =========================
   Public types you can import
   ========================= */

export type LineItem = {
  description: string;
  litres?: number;          // used by InvoiceInput
  unitPrice: number;        // price per litre (ex VAT) — major units
  vatRatePct?: number;      // optional per-line VAT (not used in total calc below)
};

export type Party = {
  name: string;
  email?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  postcode?: string | null;
  phone?: string | null;
};

export type CompanyMeta = {
  companyName: string;
  companyEmail?: string | null;
  companyPhone?: string | null;
  companyNumber?: string | null;
  vatNumber?: string | null;
  address: string[];
  website?: string | null;
};

export type InvoiceInput = {
  invoiceNumber: string;
  issueDateISO?: string;
  currency: "GBP" | "EUR" | "USD" | string;
  billTo: Party;
  items: LineItem[];
  defaultVatRatePct?: number;
  notes?: string | null;
  footerNote?: string | null;
  company: CompanyMeta;
};

export type BuiltInvoice = {
  filename: string;
  subtotal: number;  // ex VAT
  vat: number;
  total: number;
  pdfBuffer: Buffer;
};

/* ==========================================================
   Compatibility type – this is what your existing code passes
   (from /api/invoices/create.ts).
   We’ll accept this too and normalise it.
   ========================================================== */

export type LegacyInvoicePayload = {
  customer: {
    name?: string | null;
    email: string;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    postcode?: string | null;
  };
  items: { description: string; quantity: number; unitPrice: number }[];
  currency: string;
  meta?: { invoiceNumber?: string; orderId?: string; notes?: string | null };
};

/* =========================
   Internal helpers
   ========================= */

const MARGIN = 36;
const BAR_H = 42;
const THEME = {
  dark: "#0E2A3A",
  light: "#FFFFFF",
  text: "#222",
  muted: "#5A6673",
  tableHeader: "#F2F5F8",
};

function currencySymbol(cur: string) {
  switch ((cur || "").toUpperCase()) {
    case "GBP": return "£";
    case "EUR": return "€";
    case "USD": return "$";
    default: return "";
  }
}
function toMoney(n: number) { return (Math.round(n * 100) / 100).toFixed(2); }
function safeDate(d?: string) {
  try { return (d ? new Date(d) : new Date()).toLocaleDateString("en-GB"); }
  catch { return new Date().toLocaleDateString("en-GB"); }
}
function hr(doc: PDFKit.PDFDocument, x1: number, y: number, x2: number) {
  doc.save().moveTo(x1, y).lineTo(x2, y).lineWidth(0.5).strokeColor("#D7DEE5").stroke().restore();
}
function metaRow(doc: PDFKit.PDFDocument, x: number, y: number, label: string, value: string) {
  doc.fillColor(THEME.muted).fontSize(9).text(label, x, y);
  const w = doc.widthOfString(label + " ");
  doc.fillColor(THEME.text).fontSize(9).text(value, x + w, y);
}

/* ==========================================================
   Normalisers: ENV → CompanyMeta, Legacy → InvoiceInput
   ========================================================== */

function companyFromEnv(): CompanyMeta {
  const name  = process.env.COMPANY_NAME || "FuelFlow";
  const addr  = (process.env.COMPANY_ADDRESS || "1 Example Street\nExample Town\nEX1 2MP\nUnited Kingdom")
                  .split(/\r?\n/).filter(Boolean);
  return {
    companyName: name,
    address: addr,
    companyEmail: process.env.COMPANY_EMAIL || "invoices@mail.fuelflow.co.uk",
    companyPhone: process.env.COMPANY_PHONE || undefined,
    companyNumber: process.env.COMPANY_NUMBER || undefined,
    vatNumber: process.env.VAT_NUMBER || process.env.COMPANY_VAT || undefined,
    website: process.env.COMPANY_WEBSITE || undefined,
  };
}

function legacyToInput(payload: LegacyInvoicePayload): InvoiceInput {
  const invoiceNumber = payload.meta?.invoiceNumber || `INV-${Math.floor(Date.now() / 1000)}`;
  const defaultVat = Number(process.env.VAT_RATE || 0) || 0;

  return {
    invoiceNumber,
    issueDateISO: new Date().toISOString(),
    currency: (payload.currency || "GBP") as InvoiceInput["currency"],
    billTo: {
      name: payload.customer.name || "Customer",
      email: payload.customer.email,
      addressLine1: payload.customer.address_line1,
      addressLine2: payload.customer.address_line2,
      city: payload.customer.city,
      postcode: payload.customer.postcode,
    },
    items: payload.items.map(i => ({
      description: i.description,
      litres: i.quantity,
      unitPrice: i.unitPrice,
    })),
    defaultVatRatePct: defaultVat,
    notes: payload.meta?.notes || null,
    footerNote: null,
    company: companyFromEnv(),
  };
}

/* ==========================================================
   MAIN: buildInvoicePdf – now accepts EITHER shape
   ========================================================== */

export async function buildInvoicePdf(
  source: InvoiceInput | LegacyInvoicePayload
): Promise<BuiltInvoice> {
  // Normalise to InvoiceInput
  const input: InvoiceInput = (source as any).billTo
    ? (source as InvoiceInput)
    : legacyToInput(source as LegacyInvoicePayload);

  const cur = input.currency || "GBP";
  const sym = currencySymbol(cur);
  const issueDate = safeDate(input.issueDateISO);

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MARGIN + BAR_H + 18, bottom: 56, left: MARGIN, right: MARGIN },
    bufferPages: true,
  });

  const chunks: Buffer[] = [];
  doc.on("data", (b) => chunks.push(b));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  /* ----- Header bar ----- */
  doc.save().rect(0, 0, doc.page.width, BAR_H).fill(THEME.dark).restore();

  // Logo (no align property -> fixes your TS error)
  const logoPath = path.join(process.cwd(), "public", "logo-email.png");
  if (fs.existsSync(logoPath)) {
    const h = 24, w = 120, y = (BAR_H - h) / 2;
    doc.image(logoPath, MARGIN, y, { width: w, height: h });
  } else {
    doc.fillColor(THEME.light).font("Helvetica-Bold").fontSize(18).text(input.company.companyName, MARGIN, 12);
  }
  doc.fillColor(THEME.light).font("Helvetica-Bold").fontSize(10)
     .text("TAX INVOICE", doc.page.width - MARGIN - 120, 14, { width: 120, align: "right" });

  /* ----- Parties ----- */
  const topY = MARGIN + 8;
  const colW = (doc.page.width - MARGIN * 2) / 2;

  // From
  doc.fillColor(THEME.text).font("Helvetica-Bold").fontSize(9).text("From", MARGIN, topY);
  doc.font("Helvetica").fontSize(9).fillColor(THEME.text).text(input.company.companyName);
  input.company.address.forEach((l) => doc.text(l));
  if (input.company.companyEmail) doc.text(input.company.companyEmail);
  if (input.company.companyPhone) doc.text(`Tel: ${input.company.companyPhone}`);
  if (input.company.companyNumber) doc.text(`Company No: ${input.company.companyNumber}`);
  if (input.company.vatNumber) doc.text(`VAT No: ${input.company.vatNumber}`);

  // Bill To
  const billX = MARGIN + colW;
  doc.font("Helvetica-Bold").fontSize(9).text("Bill To", billX, topY);
  doc.font("Helvetica").fontSize(9).fillColor(THEME.text).text(input.billTo.name || "Customer", billX);
  if (input.billTo.email) doc.text(String(input.billTo.email), billX);
  if (input.billTo.addressLine1) doc.text(String(input.billTo.addressLine1), billX);
  if (input.billTo.addressLine2) doc.text(String(input.billTo.addressLine2), billX);
  if (input.billTo.city || input.billTo.postcode) {
    doc.text([input.billTo.city, input.billTo.postcode].filter(Boolean).join(" "), billX);
  }

  // Meta
  metaRow(doc, billX, topY + 60, "Date:", issueDate);
  metaRow(doc, billX, topY + 74, "Invoice No:", input.invoiceNumber);

  /* ----- Table header ----- */
  doc.moveDown(2);
  let y = doc.y + 6;

  const left = MARGIN, right = doc.page.width - MARGIN;
  const colDesc = left;
  const colLitres = left + 260;
  const colUnit  = left + 340;
  const colNet   = left + 430;

  doc.save().rect(left, y - 14, right - left, 22).fill(THEME.tableHeader).restore();
  doc.fillColor(THEME.muted).font("Helvetica-Bold").fontSize(9)
     .text("Description", colDesc, y);
  doc.text("Litres",       colLitres, y, { width: 60, align: "right" });
  doc.text("Unit (ex-VAT)",colUnit,   y, { width: 70, align: "right" });
  doc.text("Net",          colNet,    y, { width: right - colNet, align: "right" });
  y += 16; hr(doc, left, y, right); y += 6;

  /* ----- Lines ----- */
  let subtotal = 0;
  const defaultVat = input.defaultVatRatePct ?? 0;

  doc.font("Helvetica").fontSize(9).fillColor(THEME.text);
  input.items.forEach((it) => {
    const qty = it.litres ?? 0;
    const unit = it.unitPrice ?? 0;
    const line = qty * unit;
    subtotal += line;

    doc.text(it.description, colDesc, y);
    doc.text(qty ? String(qty) : "-",      colLitres, y, { width: 60, align: "right" });
    doc.text(`${sym}${toMoney(unit)}`,     colUnit,   y, { width: 70, align: "right" });
    doc.text(`${sym}${toMoney(line)}`,     colNet,    y, { width: right - colNet, align: "right" });
    y += 16;
  });

  y += 2; hr(doc, left, y, right); y += 6;

  /* ----- Totals ----- */
  const vat = subtotal * (defaultVat / 100);
  const total = subtotal + vat;

  doc.font("Helvetica").fontSize(9).fillColor(THEME.text)
     .text("Subtotal (Net)", colUnit, y, { width: 70, align: "right" });
  doc.text(`${sym}${toMoney(subtotal)}`, colNet, y, { width: right - colNet, align: "right" });
  y += 16;

  doc.text(`VAT (${toMoney(defaultVat)}%)`, colUnit, y, { width: 70, align: "right" });
  doc.text(`${sym}${toMoney(vat)}`,          colNet, y, { width: right - colNet, align: "right" });
  y += 18;

  doc.font("Helvetica-Bold").text("Total", colUnit, y, { width: 70, align: "right" });
  doc.text(`${sym}${toMoney(total)}`,   colNet, y, { width: right - colNet, align: "right" });

  /* ----- Notes ----- */
  if (input.notes) {
    y += 22;
    doc.font("Helvetica").fontSize(9).fillColor(THEME.muted)
       .text(input.notes, left, y, { width: right - left });
  }

  /* ----- Footer ----- */
  const footerY = doc.page.height - doc.page.margins.bottom + 16;
  hr(doc, MARGIN, footerY - 10, doc.page.width - MARGIN);

  const footerText =
    input.footerNote ??
    `${input.company.companyName} — Registered in England & Wales` +
    (input.company.companyNumber ? ` • Company No ${input.company.companyNumber}` : "") +
    (input.company.vatNumber ? ` • VAT No ${input.company.vatNumber}` : "");

  doc.font("Helvetica").fontSize(8).fillColor(THEME.muted)
     .text(footerText, MARGIN, footerY, {
       width: doc.page.width - MARGIN * 2,
       align: "center",
     });

  // Page numbers (in case it ever spills)
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    const label = `Page ${i + 1} / ${pageCount}`;
    doc.font("Helvetica").fontSize(8).fillColor(THEME.muted)
       .text(label, MARGIN, doc.page.height - 22, {
         width: doc.page.width - MARGIN * 2,
         align: "right",
       });
  }

  doc.end();
  const pdfBuffer = await done;

  return {
    filename: `Invoice ${input.invoiceNumber}.pdf`,
    subtotal: Number(toMoney(subtotal)),
    vat: Number(toMoney(vat)),
    total: Number(toMoney(total)),
    pdfBuffer,
  };
}
