// src/lib/invoice-pdf.ts
// src/lib/invoice-pdf.ts
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

/** -------------------- Types -------------------- */
export type LineItem = {
  description: string;
  litres?: number;          // optional: show litres column
  unitPrice: number;        // price per litre (ex VAT) in major units (e.g. 1.75 = £1.75)
  vatRatePct?: number;      // per-line VAT rate (percentage). If omitted, falls back to invoice default.
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
  companyNumber?: string | null;  // “Company No”
  vatNumber?: string | null;      // “VAT No”
  address: string[];              // lines for address block
  website?: string | null;
};

export type InvoiceInput = {
  invoiceNumber: string;          // e.g. INV-1758466223
  issueDateISO?: string;          // defaults to today (en-GB)
  currency: "GBP" | "EUR" | "USD" | string;
  billTo: Party;
  items: LineItem[];
  defaultVatRatePct?: number;     // if lines omit vatRatePct
  notes?: string | null;          // optional note printed under totals
  footerNote?: string | null;     // optional small footer note
  company: CompanyMeta;
};

export type BuiltInvoice = {
  filename: string;
  subtotal: number;    // ex VAT
  vat: number;
  total: number;
  pdfBuffer: Buffer;
};

/** -------------------- Helpers -------------------- */
const MARGIN = 36;                 // 0.5 inch
const BAR_H = 42;
const THEME = {
  dark: "#0E2A3A",
  darkAccent: "#122F40",
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

function toMoney(n: number) {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function safeDate(d?: string) {
  try {
    return (d ? new Date(d) : new Date()).toLocaleDateString("en-GB");
  } catch {
    return new Date().toLocaleDateString("en-GB");
  }
}

/** Render a key:value small meta row on same y */
function metaRow(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  label: string,
  value: string,
  labelColor = THEME.muted
) {
  doc
    .fillColor(labelColor)
    .fontSize(9)
    .text(label, x, y);
  const w = doc.widthOfString(label + " ");
  doc
    .fillColor(THEME.text)
    .fontSize(9)
    .text(value, x + w, y);
}

/** Draw a hairline */
function hr(doc: PDFKit.PDFDocument, x1: number, y: number, x2: number) {
  doc
    .save()
    .moveTo(x1, y)
    .lineTo(x2, y)
    .lineWidth(0.5)
    .strokeColor("#D7DEE5")
    .stroke()
    .restore();
}

/** -------------------- Main builder -------------------- */
export async function buildInvoicePdf(input: InvoiceInput): Promise<BuiltInvoice> {
  const cur = input.currency || "GBP";
  const sym = currencySymbol(cur);
  const issueDate = safeDate(input.issueDateISO);

  // Create doc with enough top margin to draw the header bar
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MARGIN + BAR_H + 18, bottom: 56, left: MARGIN, right: MARGIN },
    bufferPages: true,
  });

  // Collect buffers
  const chunks: Buffer[] = [];
  doc.on("data", (b) => chunks.push(b));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  /** ---------- Header bar (dark) ---------- */
  doc
    .save()
    .rect(0, 0, doc.page.width, BAR_H)
    .fill(THEME.dark)
    .restore();

  // Logo (optional) – will not use align (fix for your compile error)
  const publicDir = path.join(process.cwd(), "public");
  const logoPath = path.join(publicDir, "logo-email.png"); // you uploaded this
  if (fs.existsSync(logoPath)) {
    // y centered in bar
    const logoH = 24;
    const logoW = 120;
    const y = (BAR_H - logoH) / 2;
    doc.image(logoPath, MARGIN, y, { width: logoW, height: logoH }); // <-- no align here
  } else {
    // Fallback wordmark
    doc
      .fillColor(THEME.light)
      .font("Helvetica-Bold")
      .fontSize(18)
      .text(input.company.companyName, MARGIN, 12);
  }

  // "TAX INVOICE" label on the right
  doc
    .fillColor(THEME.light)
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("TAX INVOICE", doc.page.width - MARGIN - 120, 14, {
      width: 120,
      align: "right",
    });

  /** ---------- Company & Bill-To blocks ---------- */
  const topY = MARGIN + 8; // first content line under the header
  const colW = (doc.page.width - MARGIN * 2) / 2;

  // Company block (From)
  doc
    .fillColor(THEME.text)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("From", MARGIN, topY);
  doc
    .font("Helvetica")
    .fillColor(THEME.text)
    .fontSize(9)
    .text(input.company.companyName);
  input.company.address.forEach((line) => doc.text(line));
  if (input.company.companyEmail) doc.text(input.company.companyEmail);
  if (input.company.companyPhone) doc.text(`Tel: ${input.company.companyPhone}`);
  if (input.company.companyNumber) doc.text(`Company No: ${input.company.companyNumber}`);
  if (input.company.vatNumber) doc.text(`VAT No: ${input.company.vatNumber}`);

  // Bill To
  const billX = MARGIN + colW;
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("Bill To", billX, topY);
  doc
    .font("Helvetica")
    .fillColor(THEME.text)
    .fontSize(9)
    .text(input.billTo.name || "Customer", billX);
  if (input.billTo.email) doc.text(String(input.billTo.email), billX);
  if (input.billTo.addressLine1) doc.text(String(input.billTo.addressLine1), billX);
  if (input.billTo.addressLine2) doc.text(String(input.billTo.addressLine2), billX);
  if (input.billTo.city || input.billTo.postcode) {
    doc.text(
      [input.billTo.city, input.billTo.postcode].filter(Boolean).join(" "),
      billX
    );
  }

  // Invoice meta (top-right area)
  const metaY = topY + 2;
  metaRow(doc, billX, metaY + 58, "Date:", issueDate);
  metaRow(doc, billX, metaY + 72, "Invoice No:", input.invoiceNumber);

  /** ---------- Table header ---------- */
  doc.moveDown(2);
  let y = doc.y + 6;

  const tableLeft = MARGIN;
  const tableRight = doc.page.width - MARGIN;
  const colDesc = tableLeft;
  const colLitres = tableLeft + 260;
  const colUnit = tableLeft + 340;
  const colNet = tableLeft + 430;

  // header background
  doc
    .save()
    .rect(tableLeft, y - 14, tableRight - tableLeft, 22)
    .fill(THEME.tableHeader)
    .restore();

  doc
    .fillColor(THEME.muted)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("Description", colDesc, y);
  doc.text("Litres", colLitres, y, { width: 60, align: "right" });
  doc.text("Unit (ex-VAT)", colUnit, y, { width: 70, align: "right" });
  doc.text("Net", colNet, y, { width: tableRight - colNet, align: "right" });

  y += 16;
  hr(doc, tableLeft, y, tableRight);
  y += 6;

  /** ---------- Line items ---------- */
  let subtotal = 0;
  const defaultVat = input.defaultVatRatePct ?? 0;

  doc.font("Helvetica").fontSize(9).fillColor(THEME.text);

  input.items.forEach((it) => {
    const qty = it.litres ?? 0;
    const unit = it.unitPrice ?? 0;
    const lineNet = qty * unit;
    subtotal += lineNet;

    doc.text(it.description, colDesc, y);
    doc.text(qty ? String(qty) : "-", colLitres, y, { width: 60, align: "right" });
    doc.text(`${sym}${toMoney(unit)}`, colUnit, y, { width: 70, align: "right" });
    doc.text(`${sym}${toMoney(lineNet)}`, colNet, y, { width: tableRight - colNet, align: "right" });

    y += 16;
  });

  // divider
  y += 2;
  hr(doc, tableLeft, y, tableRight);
  y += 6;

  /** ---------- Totals ---------- */
  const vatRateUsed = defaultVat; // single VAT in totals; per-line support can be added if needed
  const vat = subtotal * (vatRateUsed / 100);
  const total = subtotal + vat;

  // Labels
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(THEME.text)
    .text("Subtotal (Net)", colUnit, y, { width: 70, align: "right" });
  doc.text(`${sym}${toMoney(subtotal)}`, colNet, y, { width: tableRight - colNet, align: "right" });
  y += 16;

  doc
    .fillColor(THEME.text)
    .text(`VAT (${toMoney(vatRateUsed)}%)`, colUnit, y, { width: 70, align: "right" });
  doc.text(`${sym}${toMoney(vat)}`, colNet, y, { width: tableRight - colNet, align: "right" });
  y += 18;

  // Bold total
  doc
    .font("Helvetica-Bold")
    .text("Total", colUnit, y, { width: 70, align: "right" });
  doc.text(`${sym}${toMoney(total)}`, colNet, y, { width: tableRight - colNet, align: "right" });

  /** ---------- Notes (optional) ---------- */
  if (input.notes) {
    y += 22;
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(THEME.muted)
      .text(input.notes, tableLeft, y, { width: tableRight - tableLeft });
  }

  /** ---------- Footer ---------- */
  const footerY = doc.page.height - doc.page.margins.bottom + 16;
  hr(doc, MARGIN, footerY - 10, doc.page.width - MARGIN);

  const footerText =
    input.footerNote ??
    `${input.company.companyName} — Registered in England & Wales` +
      (input.company.companyNumber ? ` • Company No ${input.company.companyNumber}` : "") +
      (input.company.vatNumber ? ` • VAT No ${input.company.vatNumber}` : "");

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(THEME.muted)
    .text(footerText, MARGIN, footerY, {
      width: doc.page.width - MARGIN * 2,
      align: "center",
    });

  // Page numbers (if the content ever spills)
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    const label = `Page ${i + 1} / ${pageCount}`;
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(THEME.muted)
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
