// src/lib/invoice-pdf.ts
// src/lib/invoice-pdf.ts
import PDFDocument from "pdfkit";

export type LineItem = { description: string; quantity: number; unitPrice: number };
export type InvoiceInput = {
  customer: {
    name?: string | null;
    email: string;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    postcode?: string | null;
  };
  items: LineItem[];
  currency: string;
  meta?: { invoiceNumber?: string; orderId?: string; notes?: string };
};
export type BuiltInvoice = { pdfBuffer: Buffer; filename: string; total: number; pages?: number };

const MARGIN = 36;
const NAVY   = "#0F172A";
const TEXT   = "#111827";
const BORDER = "#E5E7EB";
const GRAY   = "#F3F4F6";
const ZEBRA  = "#FAFAFA";

const n = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const r2 = (v: number) => Math.round(v * 100) / 100;
const sym = (c: string) => (c || "").toUpperCase() === "GBP" ? "£" : (c || "").toUpperCase() === "EUR" ? "€" : (c || "").toUpperCase() === "USD" ? "$" : "";
const money = (v: number, c: string) => `${sym(c)}${r2(v).toFixed(2)}`;
const qfmt  = (v: number) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(v);

function t(doc: any, s: string, x: number, y: number, opt: any = {}) {
  const px = doc.x, py = doc.y;
  doc.text(s, x, y, { lineBreak: false, ...opt });
  doc.x = px; doc.y = py;
}

export async function buildInvoicePdf(input: InvoiceInput): Promise<BuiltInvoice> {
  const VAT_ENABLED = process.env.VAT_ENABLED !== "false";
  const VAT_RATE    = Math.max(0, parseFloat(process.env.VAT_RATE ?? "20")) / 100;
  const PRICES_INCLUDE_VAT = process.env.PRICES_INCLUDE_VAT === "true";
  const C = (input.currency || "GBP").toUpperCase();

  const doc: any = new PDFDocument({
    size: "A4",
    autoFirstPage: true,
    margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: MARGIN },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((r) => doc.on("end", r));

  const W = doc.page.width;
  const H = doc.page.height;
  const bottomMargin = doc.page.margins.bottom ?? MARGIN;

  const companyName = process.env.COMPANY_NAME || "FuelFlow";
  const companyAddr = (process.env.COMPANY_ADDRESS || "1 Example Street\\nExample Town\\nEX1 2MP\\nUnited Kingdom").replace(/\\n/g, "\n");
  const companyEmail = process.env.COMPANY_EMAIL || "invoices@mail.fuelflow.co.uk";
  const companyPhone = process.env.COMPANY_PHONE || "";
  const companyVat   = process.env.COMPANY_VAT_NUMBER || process.env.COMPANY_VAT_NO || "";
  const companyNo    = process.env.COMPANY_NUMBER     || process.env.COMPANY_REG_NO || "";

  const invNo   = input.meta?.invoiceNumber || `INV-${Math.floor(Date.now() / 1000)}`;
  const invDate = new Date().toLocaleDateString("en-GB");

  /* ===== Header ===== */
  const headerH = 66;
  doc.rect(0, 0, W, headerH).fill(NAVY);
  doc.fill("#FFFFFF").font("Helvetica-Bold").fontSize(22);
  t(doc, companyName, MARGIN, 20, { width: W - MARGIN * 2 });
  doc.font("Helvetica").fontSize(11);
  t(doc, "TAX INVOICE", W - MARGIN - 160, 24, { width: 160, align: "right" });

  /* ===== From / Bill To ===== */
  doc.fill(TEXT).font("Helvetica").fontSize(10);

  const leftX = MARGIN;
  const rightX = W / 2 + 12;
  const colW = W / 2 - MARGIN - 24;

  let y = headerH + 12;

  doc.font("Helvetica-Bold").fontSize(11);
  t(doc, "From", leftX, y);
  t(doc, "Bill To", rightX, y);

  doc.font("Helvetica").fontSize(10);
  const left = [
    companyName, ...companyAddr.split("\n"),
    companyEmail ? `Email: ${companyEmail}` : undefined,
    companyPhone ? `Tel: ${companyPhone}` : undefined,
    companyNo ? `Company No: ${companyNo}` : undefined,
    companyVat ? `VAT No: ${companyVat}` : undefined,
  ].filter(Boolean) as string[];
  const right = [
    input.customer.name || "Customer",
    input.customer.address_line1 || undefined,
    input.customer.address_line2 || undefined,
    [input.customer.city, input.customer.postcode].filter(Boolean).join(" ") || undefined,
    input.customer.email ? `Email: ${input.customer.email}` : undefined,
  ].filter(Boolean) as string[];

  const lh = doc.currentLineHeight();
  let yl = y + 16, yr = y + 16;
  for (const s of left)  { t(doc, s, leftX,  yl, { width: colW }); yl += lh; }
  for (const s of right) { t(doc, s, rightX, yr, { width: colW }); yr += lh; }
  y = Math.max(yl, yr) + 14;

  doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).strokeColor(BORDER).stroke();
  y += 12;

  /* ===== Meta (2 columns: left labels, right date) ===== */
  // Left column (Invoice No / Order Ref)
  doc.font("Helvetica-Bold").fontSize(10);
  t(doc, "Invoice No:", MARGIN, y);
  doc.font("Helvetica");
  t(doc, invNo, MARGIN + 95, y);

  let yMeta = y;
  if (input.meta?.orderId) {
    yMeta += 18;
    doc.font("Helvetica-Bold");
    t(doc, "Order Ref:", MARGIN, yMeta);
    doc.font("Helvetica");
    t(doc, String(input.meta.orderId), MARGIN + 95, yMeta);
  }

  // Right column (Date)
  const rightMetaW = 160;
  const rightMetaX = W - MARGIN - rightMetaW;
  doc.font("Helvetica-Bold").fontSize(10);
  t(doc, "Date:", rightMetaX, y);
  doc.font("Helvetica");
  t(doc, invDate, rightMetaX + 48, y);

  /* ===== Compute rows ===== */
  type Row = { d: string; q: number; ux: number; net: number; vat: number; gross: number; vp: number };
  const rows: Row[] = [];
  let netTotal = 0, vatTotal = 0;

  for (const it of input.items) {
    const q  = n(it.quantity, 0);
    const up = n(it.unitPrice, 0);
    const ux = !VAT_ENABLED ? up : PRICES_INCLUDE_VAT ? up / (1 + VAT_RATE) : up; // ex-VAT / litre
    const net = q * ux;
    const vat = VAT_ENABLED ? net * VAT_RATE : 0;
    const gross = net + vat;
    netTotal += net; vatTotal += vat;
    rows.push({ d: it.description || "Item", q, ux, net, vat, gross, vp: VAT_RATE * 100 });
  }
  netTotal = r2(netTotal); vatTotal = r2(vatTotal);
  const grand = r2(netTotal + vatTotal);

  /* ===== Table ===== */
  y = Math.max(yMeta + 18, y + 24);

  // Fixed widths that fill the printable width exactly (A4: 595.28, margins 36 → ~523.28)
  // 255 + 70 + 88 + 80 + 30 = 523
  const tableX = MARGIN;
  const tableW = W - MARGIN * 2;
  const wDesc = 255, wQty = 70, wUnit = 88, wNet = 80, wVatPct = 30;
  const cellPad = 8;
  const headH = 24;
  const rowH  = 22;

  // Header row
  doc.rect(tableX, y, tableW, headH).fill(GRAY).strokeColor(BORDER).stroke();
  doc.fill(TEXT).font("Helvetica-Bold").fontSize(10);

  let x = tableX;
  t(doc, "Description", x + cellPad, y + 6, { width: wDesc - cellPad * 2, align: "left" }); x += wDesc;
  t(doc, "Litres",      x + wQty - cellPad, y + 6, { width: wQty - cellPad * 2, align: "right" }); x += wQty;
  t(doc, "Unit ex-VAT", x + wUnit - cellPad, y + 6, { width: wUnit - cellPad * 2, align: "right" }); x += wUnit;
  t(doc, "Net",         x + wNet - cellPad,  y + 6, { width: wNet - cellPad * 2, align: "right" }); x += wNet;
  t(doc, "VAT %",       x + wVatPct - cellPad, y + 6, { width: wVatPct - cellPad * 2, align: "right" });

  // Body rows
  let rowY = y + headH;
  const bottomSafe = H - bottomMargin - 180;
  doc.font("Helvetica").fontSize(10).fill(TEXT);

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (rowY + rowH > bottomSafe) {
      doc.font("Helvetica-Oblique").fontSize(9).fill("#6B7280");
      t(doc, `(+${rows.length - i} more item${rows.length - i > 1 ? "s" : ""} not shown)`,
        tableX + cellPad, rowY + 5, { width: tableW - cellPad * 2 });
      rowY += rowH; break;
    }

    if (i % 2 === 1) { doc.rect(tableX, rowY, tableW, rowH).fill(ZEBRA).fillColor(TEXT); }
    doc.rect(tableX, rowY, tableW, rowH).strokeColor(BORDER).stroke();

    x = tableX;
    t(doc, r.d,                x + cellPad,           rowY + 5, { width: wDesc - cellPad * 2, align: "left"  }); x += wDesc;
    t(doc, qfmt(r.q),          x + wQty - cellPad,    rowY + 5, { width: wQty  - cellPad * 2, align: "right" }); x += wQty;
    t(doc, money(r.ux, C),     x + wUnit - cellPad,   rowY + 5, { width: wUnit - cellPad * 2, align: "right" }); x += wUnit;
    t(doc, money(r.net, C),    x + wNet - cellPad,    rowY + 5, { width: wNet  - cellPad * 2, align: "right" }); x += wNet;
    t(doc, VAT_ENABLED ? `${Math.round(r.vp)}%` : "—",
                           x + wVatPct - cellPad,     rowY + 5, { width: wVatPct - cellPad * 2, align: "right" });

    rowY += rowH;
  }

  /* ===== Totals ===== */
  rowY += 16;
  const totalsW = wUnit + wNet + wVatPct;
  const totalsX = tableX + tableW - totalsW;

  const totals = [
    { label: "Subtotal (Net)", value: money(netTotal, C), bold: false },
    { label: "VAT",            value: money(vatTotal, C), bold: false },
    { label: "Total",          value: money(grand,   C),  bold: true  },
  ];

  for (let i = 0; i < totals.length; i++) {
    const h = 24, tRow = totals[i];
    doc.rect(totalsX, rowY, totalsW, h).fill(i === totals.length - 1 ? GRAY : "#FFFFFF").strokeColor(BORDER).stroke();
    doc.font(tRow.bold ? "Helvetica-Bold" : "Helvetica").fontSize(10).fill(TEXT);
    t(doc, tRow.label, totalsX + cellPad, rowY + 6, { width: totalsW / 2 - cellPad, align: "left"  });
    t(doc, tRow.value, totalsX + totalsW / 2, rowY + 6, { width: totalsW / 2 - cellPad, align: "right" });
    rowY += h;
  }

  /* ===== Notes (optional) ===== */
  if (input.meta?.notes) {
    rowY += 18;
    const notesMaxY = H - bottomMargin - 80;
    doc.font("Helvetica-Bold").fontSize(10);
    t(doc, "Notes", MARGIN, rowY);
    doc.font("Helvetica").fontSize(10).fill("#374151");
    const lines = input.meta.notes.replace(/\r\n/g, "\n").split("\n");
    const lh2 = doc.currentLineHeight();
    let ny = rowY + 14;
    for (const s of lines) {
      if (ny + lh2 > notesMaxY) break;
      t(doc, s, MARGIN, ny, { width: W - MARGIN * 2 });
      ny += lh2;
    }
  }

  /* ===== Footer ===== */
  const footerY = H - bottomMargin - 18;
  doc.font("Helvetica").fontSize(9).fill("#6B7280");
  t(doc, `${companyName} — Registered in England & Wales${companyNo ? " • Company No " + companyNo : ""}${companyVat ? " • VAT No " + companyVat : ""}`,
    MARGIN, footerY, { width: W - MARGIN * 2, align: "center" });

  const pr = doc.bufferedPageRange?.();
  const pages = pr && typeof pr.count === "number" ? pr.count : 1;

  doc.end();
  await done;

  return { pdfBuffer: Buffer.concat(chunks), filename: `${invNo}.pdf`, total: grand, pages };
}

