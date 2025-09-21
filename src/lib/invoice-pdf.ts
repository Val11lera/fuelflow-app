// src/lib/invoice-pdf.ts// src/lib/invoice-pdf.ts
// src/lib/invoice-pdf.ts
//
// Build a single-page, professional invoice PDF.
// - Fixes overlapping: converts "\n" from env to real newlines before measure/draw
// - No cross-file type imports (avoids build errors)
// - Safe typings (no PDFDocument namespace used)
//
// Usage (example):
//   const { pdfBuffer, filename } = await buildInvoicePdf({
//     invoiceNumber: "INV-1758456",
//     date: new Date().toISOString(),
//     currency: "GBP",
//     billTo: { email: "customer@example.com" },
//     items: [{ description: "Fuel order — diesel", litres: 8, unitPrice: 1.71, vatRate: 0 }],
//   });
//
// Then email `pdfBuffer` as an attachment with contentType "application/pdf".

import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

// ---------- Local types you can use elsewhere if you want ----------
export type LineItem = {
  description: string;
  litres: number;       // quantity
  unitPrice: number;    // in major units (e.g. 1.71 => £1.71)
  vatRate?: number;     // 0, 5, 20 (percent); default 0
};

export type Party = {
  name?: string | null;
  email?: string | null;
  address?: string | null;   // can contain \n
};

export type InvoiceInput = {
  invoiceNumber: string;
  date?: string | Date;      // ISO or Date; default now
  currency?: string;         // default GBP
  billTo: Party;
  items: LineItem[];

  // Optional: override company values; otherwise env is used
  company?: {
    name?: string;
    address?: string;   // can contain \n
    email?: string;
    phone?: string;
    regNo?: string;
    vatNo?: string | null;
  };

  notes?: string | null;     // can contain \n
};

export async function buildInvoicePdf(
  order: InvoiceInput
): Promise<{ pdfBuffer: Buffer; filename: string; total: number }> {
  const PAGE_W = 595.28; // A4 width pt
  const PAGE_H = 841.89; // A4 height pt
  const MARGIN = 40;

  // turn "\n" that come from .env into real line breaks for PDFKit
  const nl = (s?: string | null) => (s ?? "").replace(/\\n/g, "\n");

  const currency = (order.currency ?? "GBP").toUpperCase();
  const sym = currencySymbol(currency);

  // ---- Company (defaults from env, overridable by order.company) ----
  const companyName =
    order.company?.name ?? process.env.COMPANY_NAME ?? "FuelFlow";
  const companyAddress = nl(
    order.company?.address ??
      process.env.COMPANY_ADDRESS ??
      "1 Example Street\\nExample Town\\nEX1 2MP\\nUnited Kingdom"
  );
  const companyEmail =
    order.company?.email ?? process.env.INVOICE_FROM ?? "invoices@mail.fuelflow.co.uk";
  const companyPhone =
    order.company?.phone ?? process.env.COMPANY_PHONE ?? "+44 (0)20 1234 5678";
  const companyRegNo =
    order.company?.regNo ?? process.env.COMPANY_REG_NO ?? "Company No 12345678";
  const companyVatNo =
    order.company?.vatNo ?? process.env.COMPANY_VAT_NO ?? null;

  // ---- Bill To & date ----
  const billToLabel = "Bill To";
  const billEmail = order.billTo.email ?? "";
  const billName = order.billTo.name ?? "";
  const billAddress = nl(order.billTo.address ?? "");

  const dateStr = formatDisplayDate(order.date);

  // ---- Prepare doc/buffer ----
  const doc = new PDFDocument({ size: "A4", margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<void>((resolve) => doc.on("end", () => resolve()));

  // ---- Header bar (brand) ----
  const BAR_H = 48;
  doc.save();
  doc.rect(0, 0, PAGE_W, BAR_H).fill("#0C1A2B").restore();

  // Optional logo at left of the bar
  const logoPath = path.join(process.cwd(), "public", "logo-email.png");
  if (fs.existsSync(logoPath)) {
    try {
      doc.image(logoPath, MARGIN, 10, { height: 28 });
    } catch {
      // ignore image errors
    }
  }
  // "TAX INVOICE" on the right of the bar
  doc
    .fillColor("#fff")
    .fontSize(14)
    .text("TAX INVOICE", 0, 16, { width: PAGE_W - MARGIN, align: "right" })
    .fillColor("#000");

  let y = BAR_H + 18;

  // ---- Left column: company details ----
  const LEFT_W = 0.5 * (PAGE_W - 2 * MARGIN) - 10;
  const RIGHT_W = 0.5 * (PAGE_W - 2 * MARGIN) - 10;

  // Company label
  y += label(doc, "From", MARGIN, y);
  y += title(doc, companyName, MARGIN, y);
  y += block(
    doc,
    [companyAddress, `Email: ${companyEmail}`, `Tel: ${companyPhone}`, companyRegNo, companyVatNo ? `VAT No: ${companyVatNo}` : ""]
      .filter(Boolean)
      .join("\n"),
    MARGIN,
    y,
    LEFT_W
  );

  // ---- Right column: Bill To + Date
  let rightY = BAR_H + 18;
  rightY += label(doc, billToLabel, MARGIN + LEFT_W + 20, rightY);
  rightY += block(
    doc,
    [
      billName && `Name: ${billName}`,
      billEmail && `Email: ${billEmail}`,
      billAddress,
    ]
      .filter(Boolean)
      .join("\n"),
    MARGIN + LEFT_W + 20,
    rightY,
    RIGHT_W
  );
  // Date
  rightY += 6;
  rightY += twoColKV(doc, "Date:", dateStr, MARGIN + LEFT_W + 20, rightY, RIGHT_W);

  // y is the lower of the two columns
  y = Math.max(y, rightY) + 18;

  // ---- Table header
  const col1 = MARGIN;              // Description
  const col2 = col1 + 0.60 * (PAGE_W - 2 * MARGIN); // Litres col start (rough split)
  const col3 = col2 + 70;           // Unit ex VAT
  const col4 = col3 + 90;           // VAT %

  headerRow(doc, ["Description", "Litres", "Unit (ex-VAT)", "VAT %"], [col1, col2, col3, col4], y, PAGE_W - MARGIN);
  y += 26;

  // ---- Line items
  let subNet = 0;
  let totalVat = 0;

  for (const it of order.items) {
    const qty = Number(it.litres || 0);
    const unit = Number(it.unitPrice || 0);
    const vatRate = Number(it.vatRate ?? 0);
    const lineNet = qty * unit;
    const lineVat = +(lineNet * (vatRate / 100)).toFixed(2);
    subNet += lineNet;
    totalVat += lineVat;

    // description may wrap; measure height first
    const lineH = Math.max(
      doc.heightOfString(it.description, { width: col2 - col1 - 6 }),
      12
    );

    doc.fontSize(10).fillColor("#000");
    doc.text(it.description, col1, y, { width: col2 - col1 - 6 });
    doc.text(qty.toString(), col2, y, { width: 50, align: "right" });
    doc.text(`${sym}${unit.toFixed(2)}`, col3, y, { width: 70, align: "right" });
    doc.text(`${vatRate.toFixed(0)}%`, col4, y, { width: 50, align: "right" });

    y += lineH + 8;
  }

  // ---- Totals
  drawHR(doc, MARGIN, y, PAGE_W - MARGIN);
  y += 10;

  const totalsW = 200;
  const leftSpace = PAGE_W - MARGIN - totalsW;

  // Subtotal (Net)
  y = Math.max(
    y,
    block(doc, "Subtotal (Net)", leftSpace - 10, y, totalsW - 90, { align: "right", dim: true })
  );
  blockMoney(doc, `${sym}${subNet.toFixed(2)}`, leftSpace + totalsW - 60, y - 12, 60);

  y += 6;

  // VAT
  y = Math.max(
    y,
    block(doc, "VAT", leftSpace - 10, y, totalsW - 90, { align: "right", dim: true })
  );
  blockMoney(doc, `${sym}${totalVat.toFixed(2)}`, leftSpace + totalsW - 60, y - 12, 60);

  y += 6;

  // Total (bold)
  y = Math.max(
    y,
    block(doc, "Total", leftSpace - 10, y, totalsW - 90, { align: "right" })
  );
  doc.font("Helvetica-Bold");
  blockMoney(doc, `${sym}${(subNet + totalVat).toFixed(2)}`, leftSpace + totalsW - 60, y - 12, 60);
  doc.font("Helvetica");

  y += 20;

  // ---- Optional notes
  const notesText = nl(order.notes ?? "");
  if (notesText) {
    y += label(doc, "Notes", MARGIN, y);
    y += block(doc, notesText, MARGIN, y, PAGE_W - 2 * MARGIN, { dim: true }) + 10;
  }

  // ---- Footer / legal line
  const footer = `${companyName} — Registered in England & Wales — ${companyRegNo}${
    companyVatNo ? ` — VAT No ${companyVatNo}` : ""
  }`;
  doc
    .fontSize(8)
    .fillColor("#777")
    .text(footer, MARGIN, PAGE_H - MARGIN - 12, {
      width: PAGE_W - 2 * MARGIN,
      align: "center",
    })
    .fillColor("#000");

  doc.end();
  await done;

  const pdfBuffer = Buffer.concat(chunks);
  const filename = `${order.invoiceNumber}.pdf`;
  return { pdfBuffer, filename, total: +(subNet + totalVat).toFixed(2) };

  // ---------------- helpers ----------------

  function currencySymbol(cur: string) {
    const c = (cur || "").toUpperCase();
    if (c === "GBP") return "£";
    if (c === "EUR") return "€";
    if (c === "USD") return "$";
    return "";
  }

  function formatDisplayDate(d?: string | Date) {
    const dt = d ? new Date(d) : new Date();
    return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function label(doc: any, text: string, x: number, yVal: number) {
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#0C1A2B").text(text, x, yVal);
    doc.font("Helvetica").fillColor("#000");
    return 16;
  }

  function title(doc: any, text: string, x: number, yVal: number) {
    doc.font("Helvetica-Bold").fontSize(13).text(text, x, yVal);
    doc.font("Helvetica").fontSize(10);
    return 16;
  }

  function block(
    doc: any,
    text: string,
    x: number,
    yVal: number,
    width: number,
    opts?: { align?: "left" | "right" | "center"; dim?: boolean }
  ) {
    doc.fontSize(10).fillColor(opts?.dim ? "#555" : "#000");
    const h = doc.heightOfString(text, { width, align: opts?.align ?? "left" });
    doc.text(text, x, yVal, { width, align: opts?.align ?? "left" });
    doc.fillColor("#000");
    return h;
  }

  function twoColKV(doc: any, key: string, value: string, x: number, yVal: number, width: number) {
    const keyW = 60;
    doc.fontSize(10).fillColor("#555").text(key, x, yVal, { width: keyW, align: "left" });
    doc.fillColor("#000").text(value, x + keyW, yVal, { width: width - keyW, align: "left" });
    return 14;
  }

  function headerRow(doc: any, cols: string[], xPositions: number[], yVal: number, rightEdge: number) {
    doc.save();
    doc.rect(MARGIN - 2, yVal - 6, rightEdge - (MARGIN - 2), 22).fill("#EEF3F8").restore();
    doc.font("Helvetica-Bold").fontSize(10);
    for (let i = 0; i < cols.length; i++) {
      const x = xPositions[i];
      doc.text(cols[i], x, yVal, { align: i === 0 ? "left" : "right", width: (i === 0 ? xPositions[1] - x : 80) });
    }
    doc.font("Helvetica");
  }

  function drawHR(doc: any, x1: number, yHr: number, x2: number) {
    doc.save().moveTo(x1, yHr).lineTo(x2, yHr).lineWidth(1).strokeColor("#D6DEE6").stroke().restore();
  }

  function blockMoney(doc: any, text: string, x: number, yVal: number, width: number) {
    doc.text(text, x, yVal, { width, align: "right" });
  }
}

