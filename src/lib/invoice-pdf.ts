// src/lib/invoice-pdf.ts// src/lib/invoice-pdf.ts
//
// Generates a professional Invoice PDF (single page, clean layout) with pdfkit.
// Fixes TS issues by separating the value (constructor) and the type.
// - Value to construct:  default import PDFDocument
// - Type to annotate:    PDFKit.PDFDocument  → we'll alias it to PDFDoc

import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

// ---- Types you can reuse elsewhere ----

export type Currency = "GBP" | "EUR" | "USD";

export interface InvoiceLine {
  description: string;
  litres?: number | null;          // optional, will show if provided
  unitPrice: number;               // major units (e.g. 1.71 => £1.71)
  vatRatePct?: number | null;      // e.g. 20 means 20%
}

export interface Party {
  name?: string | null;
  email?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  postcode?: string | null;
}

export interface InvoiceInput {
  invoiceNumber: string;           // e.g. 'INV-1758456xxx'
  billTo: Party;                   // customer billing details
  currency: Currency;              // 'GBP' | 'EUR' | 'USD'
  lines: InvoiceLine[];            // at least 1 line
  notes?: string | null;           // optional footer/note
  // Company can be overridden via env; these are fallbacks
  company?: {
    name?: string;
    regNo?: string;
    vatNo?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string;              // multi-line allowed with "\n"
  };
}

export interface BuiltInvoice {
  pdfBuffer: Buffer;
  filename: string;
  total: number;                   // grand total (incl VAT)
}

// ---- PDFKit type alias (important to avoid the TS error) ----
type PDFDoc = PDFKit.PDFDocument;

// ---- Helpers ----

const MARGIN = 36; // half inch
const PAGE_WIDTH = 595.28; // A4 width in points

function currencySymbol(cur: Currency) {
  switch (cur) {
    case "GBP":
      return "£";
    case "EUR":
      return "€";
    case "USD":
      return "$";
    default:
      return "";
  }
}

function fmtMoney(n: number, sym: string) {
  return `${sym}${n.toFixed(2)}`;
}

function todayUK() {
  return new Date().toLocaleDateString("en-GB");
}

function sectionHeading(doc: PDFDoc, text: string, yPad = 8) {
  doc.moveDown(0.8);
  doc.fontSize(10).fillColor("#666").text(text.toUpperCase());
  doc.moveDown(yPad / 10);
  doc.fillColor("black");
}

function kvLine(doc: PDFDoc, key: string, value: string | undefined | null) {
  if (!value) return;
  const y = doc.y;
  doc.fontSize(10).fillColor("#333").text(key, MARGIN, y, { width: 90 });
  doc.fillColor("black").text(value, MARGIN + 90, y);
}

function drawRule(doc: PDFDoc, yOffset = 6) {
  const y = doc.y + yOffset;
  doc
    .moveTo(MARGIN, y)
    .lineTo(PAGE_WIDTH - MARGIN, y)
    .lineWidth(0.7)
    .strokeColor("#E6E8EB")
    .stroke()
    .strokeColor("black")
    .lineWidth(1);
  doc.moveDown(0.7);
}

// Try load /public/logo-email.png if present
function tryGetLogoPath(): string | null {
  const p = path.join(process.cwd(), "public", "logo-email.png");
  return fs.existsSync(p) ? p : null;
}

// ---- Main builder ----

export async function buildInvoicePdf(
  order: InvoiceInput
): Promise<BuiltInvoice> {
  if (!order.lines || order.lines.length === 0) {
    throw new Error("Invoice has no line items");
  }

  const companyName =
    order.company?.name ?? process.env.COMPANY_NAME ?? "FuelFlow";

  const companyReg =
    order.company?.regNo ?? process.env.COMPANY_REG_NO ?? "Company No 12345678";

  // VAT may be optional in your business model; display only if present
  const companyVat =
    order.company?.vatNo ?? process.env.COMPANY_VAT_NO ?? null;

  const companyPhone =
    order.company?.phone ?? process.env.COMPANY_PHONE ?? null;

  const companyEmail =
    order.company?.email ?? process.env.INVOICE_FROM ?? "invoices@mail.fuelflow.co.uk";

  const companyAddress =
    order.company?.address ??
    process.env.COMPANY_ADDRESS ??
    "1 Example Street\nExample Town\nEX1 2MP\nUnited Kingdom";

  const sym = currencySymbol(order.currency);

  // Compute totals
  let net = 0;
  let vat = 0;

  for (const l of order.lines) {
    const qty = Number(l.litres ?? 1);
    const lineNet = qty * Number(l.unitPrice);
    net += lineNet;
    const rate = Number(l.vatRatePct ?? 0) / 100;
    vat += lineNet * rate;
  }

  const total = net + vat;

  // ---------- Create PDF ----------
  const doc = new PDFDocument({ size: "A4", margin: MARGIN }) as PDFDoc;

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve) => doc.on("end", resolve));

  // ---------- Header bar ----------
  doc
    .rect(0, 0, PAGE_WIDTH, 56)
    .fill("#0F1A2B"); // dark header
  doc.fillColor("white").fontSize(22).text(companyName, MARGIN, 16);

  // Right side "TAX INVOICE" label
  doc
    .fontSize(10)
    .text("TAX INVOICE", PAGE_WIDTH - MARGIN - 100, 22, { width: 100, align: "right" });

  // Optional logo (draw over the dark bar)
  const logo = tryGetLogoPath();
  if (logo) {
    // *No* align here — we position by x/y
    doc.image(logo, MARGIN, 14, { width: 120, height: 24 });
  }

  doc.moveDown(3);
  doc.fillColor("black");

  // ---------- From (company) ----------
  sectionHeading(doc, "From", 4);
  kvLine(doc, "", companyName);
  kvLine(doc, "", companyAddress);
  if (companyEmail) kvLine(doc, "Email:", companyEmail);
  if (companyPhone) kvLine(doc, "Tel:", companyPhone);
  kvLine(doc, "Company:", companyReg);
  if (companyVat) kvLine(doc, "VAT:", companyVat);

  // ---------- Bill To ----------
  const saveY = doc.y - 80; // start of right column
  doc.y = saveY;
  const rightX = PAGE_WIDTH / 2;
  doc.fontSize(10);
  doc.text("", rightX, doc.y); // set cursor to right column

  sectionHeading(doc, "Bill To", 4);
  kvLine(doc, "", order.billTo.name ?? "");
  if (order.billTo.email) kvLine(doc, "Email:", order.billTo.email);
  if (order.billTo.address_line1) kvLine(doc, "", String(order.billTo.address_line1));
  if (order.billTo.address_line2) kvLine(doc, "", String(order.billTo.address_line2));
  if (order.billTo.city || order.billTo.postcode) {
    kvLine(
      doc,
      "",
      [order.billTo.city, order.billTo.postcode].filter(Boolean).join(" ")
    );
  }
  kvLine(doc, "Date:", todayUK());
  kvLine(doc, "Invoice #:", order.invoiceNumber);

  // Back to full width flow
  doc.moveDown(1.2);
  drawRule(doc, 2);

  // ---------- Lines table ----------
  const col1 = MARGIN;
  const col2 = PAGE_WIDTH - MARGIN - 170;   // Unit
  const col3 = PAGE_WIDTH - MARGIN - 90;    // VAT %
  const col4 = PAGE_WIDTH - MARGIN;         // Line total (right al.)

  doc.fontSize(10).fillColor("#666");
  doc.text("Description", col1, doc.y, { continued: true });
  doc.text("Unit (ex-VAT)", col2, doc.y, { width: 80, align: "right", continued: true });
  doc.text("VAT %", col3, doc.y, { width: 60, align: "right", continued: true });
  doc.text("Line", col4, doc.y, { width: 60, align: "right" });
  drawRule(doc, 2);
  doc.fillColor("black");

  for (const l of order.lines) {
    const qty = Number(l.litres ?? 1);
    const lineNet = qty * Number(l.unitPrice);
    const rate = Number(l.vatRatePct ?? 0);
    const y = doc.y;

    const desc = l.litres != null ? `${l.description} — ${qty}` : l.description;

    doc.text(desc, col1, y, { width: col2 - col1 - 6 });
    doc.text(fmtMoney(Number(l.unitPrice), sym), col2, y, {
      width: 80,
      align: "right",
    });
    doc.text(`${rate}%`, col3, y, { width: 60, align: "right" });
    doc.text(fmtMoney(lineNet, sym), col4, y, { width: 60, align: "right" });
    doc.moveDown(0.3);
  }

  drawRule(doc, 4);

  // ---------- Totals ----------
  const labelW = 80;
  const valW = 60;
  const xLabel = col3; // align with VAT % col
  const xVal = col4;

  doc.fontSize(10).fillColor("#666").text("Subtotal (Net)", xLabel, doc.y, {
    width: labelW,
    align: "right",
    continued: true,
  });
  doc.fillColor("black").text(fmtMoney(net, sym), xVal, doc.y, {
    width: valW,
    align: "right",
  });

  doc.fontSize(10).fillColor("#666").text("VAT", xLabel, doc.y + 4, {
    width: labelW,
    align: "right",
    continued: true,
  });
  doc.fillColor("black").text(fmtMoney(vat, sym), xVal, doc.y + 4, {
    width: valW,
    align: "right",
  });

  doc.fontSize(10).fillColor("#666").text("Total", xLabel, doc.y + 10, {
    width: labelW,
    align: "right",
    continued: true,
  });
  doc.fillColor("black").fontSize(11).text(fmtMoney(total, sym), xVal, doc.y + 10, {
    width: valW,
    align: "right",
  });

  // ---------- Notes ----------
  if (order.notes) {
    doc.moveDown(1.2);
    drawRule(doc, 2);
    doc.fontSize(9).fillColor("#666").text(order.notes);
    doc.fillColor("black");
  }

  // ---------- Footer ----------
  doc.moveTo(MARGIN, 792 - 36).lineTo(PAGE_WIDTH - MARGIN, 792 - 36).lineWidth(2).stroke("#222");
  doc
    .fontSize(8)
    .fillColor("#666")
    .text(
      `${companyName} — Registered in England & Wales • ${companyReg}` +
        (companyVat ? ` • VAT No ${companyVat}` : ""),
      MARGIN,
      792 - 28,
      { width: PAGE_WIDTH - MARGIN * 2, align: "center" }
    );

  doc.end();
  await done;

  return {
    pdfBuffer: Buffer.concat(chunks),
    filename: `${order.invoiceNumber}.pdf`,
    total,
  };
}

