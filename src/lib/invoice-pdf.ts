// src/lib/invoice-pdf.ts// src/lib/invoice-pdf.ts
// src/lib/invoice-pdf.ts
//
// Stable, single-page invoice layout with explicit positioning.
// Fixes “format all over the place” by:
//  - Separate left/right columns with independent y-cursors
//  - All text calls have width, so long lines wrap predictably
//  - All sections advance y deterministically using heightOfString
//  - No .text({ continued: true }) except when intentionally inline
//
// Types match previous version so invoice.service.ts keeps working.

import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

export type Currency = "GBP" | "EUR" | "USD";

export interface InvoiceLine {
  description: string;
  litres?: number | null;
  unitPrice: number;
  vatRatePct?: number | null;
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
  invoiceNumber: string;
  billTo: Party;
  currency: Currency;
  lines: InvoiceLine[];
  notes?: string | null;
  company?: {
    name?: string;
    regNo?: string;
    vatNo?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string; // allow "\n" for multiline
  };
}

export interface BuiltInvoice {
  pdfBuffer: Buffer;
  filename: string;
  total: number;
}

type PDFDoc = PDFKit.PDFDocument;

// ------------ Layout constants ------------
const MARGIN = 36;                     // 0.5"
const PAGE_W = 595.28;                 // A4 width
const PAGE_H = 841.89;                 // A4 height
const HEADER_H = 64;

const COL_GAP = 18;
const LEFT_W = 260;                    // left column width
const RIGHT_W = PAGE_W - MARGIN - (MARGIN + LEFT_W + COL_GAP); // remaining width

const FONT = "Helvetica";
const FONT_BOLD = "Helvetica-Bold";

function sym(cur: Currency) {
  return cur === "GBP" ? "£" : cur === "EUR" ? "€" : cur === "USD" ? "$" : "";
}
function money(n: number, s: string) {
  return `${s}${n.toFixed(2)}`;
}

// try to load /public/logo-email.png
function tryLogo(): string | null {
  const p = path.join(process.cwd(), "public", "logo-email.png");
  return fs.existsSync(p) ? p : null;
}

// helper: write multi-line text in a box and return the height used
function boxText(
  doc: PDFDoc,
  text: string,
  x: number,
  y: number,
  width: number,
  opts: PDFKit.Mixins.TextOptions & { fontSize?: number; color?: string } = {}
) {
  const fontSize = opts.fontSize ?? 10;
  const color = opts.color ?? "black";
  doc.font(FONT).fillColor(color).fontSize(fontSize);
  const h = doc.heightOfString(text, { width, align: opts.align ?? "left" });
  doc.text(text, x, y, { width, align: opts.align ?? "left" });
  return h;
}

// helper: label/value stacked (label muted)
function kv(
  doc: PDFDoc,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number
) {
  const lh = boxText(doc, label, x, y, width, { fontSize: 9, color: "#666" });
  const vh = boxText(doc, value, x, y + lh + 2, width, { fontSize: 10 });
  return lh + 2 + vh;
}

export async function buildInvoicePdf(order: InvoiceInput): Promise<BuiltInvoice> {
  if (!order.lines?.length) throw new Error("Invoice has no line items");

  // company from env with sensible fallbacks
  const companyName =
    order.company?.name ?? process.env.COMPANY_NAME ?? "FuelFlow";
  const companyReg =
    order.company?.regNo ?? process.env.COMPANY_REG_NO ?? "Company No 12345678";
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

  const symbol = sym(order.currency);

  // compute totals
  let net = 0;
  let vat = 0;
  for (const l of order.lines) {
    const q = Number(l.litres ?? 1);
    const lineNet = q * Number(l.unitPrice);
    net += lineNet;
    vat += lineNet * (Number(l.vatRatePct ?? 0) / 100);
  }
  const total = net + vat;

  const doc = new PDFDocument({ size: "A4", margin: MARGIN }) as PDFDoc;

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve) => doc.on("end", resolve));

  // ---------- header bar ----------
  doc.rect(0, 0, PAGE_W, HEADER_H).fill("#0F1A2B");
  doc.fillColor("white").font(FONT_BOLD).fontSize(22).text(companyName, MARGIN, 18, {
    width: PAGE_W - MARGIN * 2 - 120,
  });
  doc.font(FONT).fontSize(10).text("TAX INVOICE", PAGE_W - MARGIN - 100, 22, {
    width: 100,
    align: "right",
  });
  const logo = tryLogo();
  if (logo) {
    // positioned explicitly — no align prop
    doc.image(logo, PAGE_W - MARGIN - 120, 16, { width: 120, height: 28 });
  }
  doc.fillColor("black").font(FONT);

  // layout cursors
  let y = HEADER_H + 18; // first content baseline
  let leftY = y;
  let rightY = y;

  // ---------- left column: company ----------
  leftY += boxText(doc, "From", MARGIN, leftY, LEFT_W, { fontSize: 9, color: "#666" }) + 4;
  leftY += boxText(doc, companyName, MARGIN, leftY, LEFT_W, { fontSize: 10 }) + 2;
  leftY += boxText(doc, companyAddress, MARGIN, leftY, LEFT_W, { fontSize: 10 }) + 4;

  if (companyEmail)
    leftY += kv(doc, "Email", String(companyEmail), MARGIN, leftY, LEFT_W) + 6;
  if (companyPhone)
    leftY += kv(doc, "Tel", String(companyPhone), MARGIN, leftY, LEFT_W) + 6;

  leftY += kv(doc, "Company", companyReg, MARGIN, leftY, LEFT_W) + 6;
  if (companyVat) leftY += kv(doc, "VAT", companyVat, MARGIN, leftY, LEFT_W) + 6;

  // ---------- right column: bill to ----------
  const rightX = MARGIN + LEFT_W + COL_GAP;
  rightY += boxText(doc, "Bill To", rightX, rightY, RIGHT_W, { fontSize: 9, color: "#666" }) + 4;
  if (order.billTo.name)
    rightY += boxText(doc, String(order.billTo.name), rightX, rightY, RIGHT_W, { fontSize: 10 }) + 2;

  if (order.billTo.email)
    rightY += kv(doc, "Email", String(order.billTo.email), rightX, rightY, RIGHT_W) + 6;

  let addr = "";
  if (order.billTo.address_line1) addr += String(order.billTo.address_line1) + "\n";
  if (order.billTo.address_line2) addr += String(order.billTo.address_line2) + "\n";
  const cityPost = [order.billTo.city, order.billTo.postcode].filter(Boolean).join(" ");
  if (cityPost) addr += cityPost;
  if (addr.trim()) rightY += kv(doc, "Address", addr.trim(), rightX, rightY, RIGHT_W) + 6;

  rightY += kv(
    doc,
    "Date",
    new Date().toLocaleDateString("en-GB"),
    rightX,
    rightY,
    RIGHT_W
  ) + 6;

  rightY += kv(
    doc,
    "Invoice #",
    order.invoiceNumber,
    rightX,
    rightY,
    RIGHT_W
  ) + 6;

  // sync y for next full-width section
  y = Math.max(leftY, rightY) + 12;

  // ---------- table header ----------
  // columns
  const col1 = MARGIN;                          // description
  const col2 = PAGE_W - MARGIN - 180;           // unit ex-vat
  const col3 = PAGE_W - MARGIN - 100;           // vat %
  const col4 = PAGE_W - MARGIN;                 // line total (right-aligned)
  const descW = col2 - col1 - 8;

  // rule
  doc
    .moveTo(MARGIN, y)
    .lineTo(PAGE_W - MARGIN, y)
    .lineWidth(0.7)
    .strokeColor("#E6E8EB")
    .stroke()
    .strokeColor("black")
    .lineWidth(1);
  y += 6;

  doc.font(FONT).fontSize(10).fillColor("#666");
  doc.text("Description", col1, y, { width: descW });
  doc.text("Unit (ex-VAT)", col2, y, { width: 80, align: "right" });
  doc.text("VAT %", col3, y, { width: 60, align: "right" });
  doc.text("Line", col4, y, { width: 60, align: "right" });
  doc.fillColor("black");
  y += 16;

  // lines
  for (const l of order.lines) {
    const qty = Number(l.litres ?? 1);
    const lineNet = qty * Number(l.unitPrice);
    const rate = Number(l.vatRatePct ?? 0);

    const desc =
      l.litres != null ? `${l.description} — ${qty}` : l.description;

    const rowH = Math.max(
      doc.heightOfString(desc, { width: descW }),
      12
    );

    // draw row
    doc.text(desc, col1, y, { width: descW });
    doc.text(money(Number(l.unitPrice), symbol), col2, y, {
      width: 80,
      align: "right",
    });
    doc.text(`${rate}%`, col3, y, { width: 60, align: "right" });
    doc.text(money(lineNet, symbol), col4, y, { width: 60, align: "right" });

    y += rowH + 6;
  }

  // rule
  doc
    .moveTo(MARGIN, y)
    .lineTo(PAGE_W - MARGIN, y)
    .lineWidth(0.7)
    .strokeColor("#E6E8EB")
    .stroke()
    .strokeColor("black")
    .lineWidth(1);
  y += 10;

  // ---------- totals ----------
  const labelW = 80;
  const valueW = 60;
  const xLabel = col3;
  const xVal = col4;

  doc.font(FONT).fontSize(10).fillColor("#666")
    .text("Subtotal (Net)", xLabel, y, { width: labelW, align: "right" });
  doc.fillColor("black")
    .text(money(net, symbol), xVal, y, { width: valueW, align: "right" });
  y += 14;

  doc.font(FONT).fontSize(10).fillColor("#666")
    .text("VAT", xLabel, y, { width: labelW, align: "right" });
  doc.fillColor("black")
    .text(money(vat, symbol), xVal, y, { width: valueW, align: "right" });
  y += 16;

  doc.font(FONT_BOLD).fontSize(11).fillColor("#333")
    .text("Total", xLabel, y, { width: labelW, align: "right" });
  doc.font(FONT_BOLD).fillColor("#111")
    .text(money(total, symbol), xVal, y, { width: valueW, align: "right" });
  y += 24;

  // ---------- notes ----------
  if (order.notes) {
    const noteH = boxText(
      doc,
      order.notes,
      MARGIN,
      y,
      PAGE_W - MARGIN * 2,
      { fontSize: 9, color: "#666" }
    );
    y += noteH + 10;
  }

  // ---------- footer ----------
  const footerY = PAGE_H - 32;
  doc
    .moveTo(MARGIN, footerY - 10)
    .lineTo(PAGE_W - MARGIN, footerY - 10)
    .lineWidth(2)
    .stroke("#222");
  const footerTxt =
    `${companyName} — Registered in England & Wales • ${companyReg}` +
    (companyVat ? ` • VAT No ${companyVat}` : "");
  doc.font(FONT).fontSize(8).fillColor("#666").text(
    footerTxt,
    MARGIN,
    footerY,
    { width: PAGE_W - MARGIN * 2, align: "center" }
  );

  doc.end();
  await done;

  return {
    pdfBuffer: Buffer.concat(chunks),
    filename: `${order.invoiceNumber}.pdf`,
    total,
  };
}

