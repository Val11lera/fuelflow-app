// src/lib/invoice-pdf.ts
// src/lib/invoice-pdf.ts
import PDFDocument from "pdfkit";

/** Public types (unchanged for the rest of your app) */
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

/** Layout helpers */
const MARGIN = 36;
const NAVY = "#0F172A";
const TEXT = "#111827";
const BORDER = "#E5E7EB";
const GRAY = "#F3F4F6";
const ZEBRA = "#FAFAFA";

const clampN = (v: unknown, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const round2 = (v: number) => Math.round(v * 100) / 100;
const sym = (c: string) => {
  c = (c || "").toUpperCase();
  return c === "GBP" ? "£" : c === "EUR" ? "€" : c === "USD" ? "$" : "";
};
const money = (v: number, c: string) => `${sym(c)}${round2(v).toFixed(2)}`;
const qtyFmt = (v: number) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(v);

/** Draw absolute text without advancing PDFKit’s cursor */
function drawText(doc: any, str: string, x: number, y: number, opt: any = {}) {
  const px = doc.x, py = doc.y;
  doc.text(str, x, y, { lineBreak: false, ...opt });
  doc.x = px; doc.y = py;
}

export async function buildInvoicePdf(input: InvoiceInput): Promise<BuiltInvoice> {
  const VAT_ENABLED = process.env.VAT_ENABLED !== "false";
  const VAT_RATE = Math.max(0, parseFloat(process.env.VAT_RATE ?? "20")) / 100;
  const PRICES_INCLUDE_VAT = process.env.PRICES_INCLUDE_VAT === "true";
  const C = (input.currency || "GBP").toUpperCase();

  const doc: any = new PDFDocument({
    size: "A4",
    autoFirstPage: true,
    margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: MARGIN },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve) => doc.on("end", resolve));

  const W = doc.page.width;
  const H = doc.page.height;
  const bottomMargin = doc.page.margins.bottom ?? MARGIN;

  const companyName = process.env.COMPANY_NAME || "FuelFlow";
  const companyAddr = (process.env.COMPANY_ADDRESS || "1 Example Street\\nExample Town\\nEX1 2MP\\nUnited Kingdom").replace(/\\n/g, "\n");
  const companyEmail = process.env.COMPANY_EMAIL || "invoices@mail.fuelflow.co.uk";
  const companyPhone = process.env.COMPANY_PHONE || "";
  const companyVat   = process.env.COMPANY_VAT_NUMBER || process.env.COMPANY_VAT_NO || "";
  const companyNo    = process.env.COMPANY_NUMBER     || process.env.COMPANY_REG_NO || "";

  const invNo = input.meta?.invoiceNumber || `INV-${Math.floor(Date.now() / 1000)}`;
  const invDate = new Date().toLocaleDateString("en-GB");

  /** =================== HEADER =================== */
  const headerH = 70;
  doc.rect(0, 0, W, headerH).fill(NAVY);
  doc.fill("#FFFFFF").font("Helvetica-Bold").fontSize(20);
  drawText(doc, companyName, MARGIN, 22, { width: W - MARGIN * 2 });
  doc.font("Helvetica").fontSize(11);
  drawText(doc, "TAX INVOICE", W - MARGIN - 180, 26, { width: 180, align: "right" });

  /** =================== ADDRESS BLOCKS =================== */
  doc.fill(TEXT).font("Helvetica").fontSize(10);

  const leftX = MARGIN;
  const rightX = W / 2 + 12;
  const colW = W / 2 - MARGIN - 24;

  let y = headerH + 10;

  doc.font("Helvetica-Bold").fontSize(11);
  drawText(doc, "From", leftX, y);
  drawText(doc, "Bill To", rightX, y);

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
  for (const s of left)  { drawText(doc, s, leftX,  yl, { width: colW }); yl += lh; }
  for (const s of right) { drawText(doc, s, rightX, yr, { width: colW }); yr += lh; }
  y = Math.max(yl, yr) + 14;

  doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).strokeColor(BORDER).stroke();
  y += 12;

  /** =================== META =================== */
  doc.font("Helvetica-Bold").fontSize(10);
  drawText(doc, "Invoice No:", MARGIN, y);
  doc.font("Helvetica");
  drawText(doc, invNo, MARGIN + 95, y);

  doc.font("Helvetica-Bold");
  drawText(doc, "Date:", MARGIN + 260, y);
  doc.font("Helvetica");
  drawText(doc, invDate, MARGIN + 310, y);

  if (input.meta?.orderId) {
    y += 18;
    doc.font("Helvetica-Bold");
    drawText(doc, "Order Ref:", MARGIN, y);
    doc.font("Helvetica");
    drawText(doc, String(input.meta.orderId), MARGIN + 95, y);
  }

  /** =================== LINE ITEMS =================== */
  // Calculate row data (ex-VAT unit, net, VAT, total)
  type Row = { d: string; q: number; ux: number; net: number; vat: number; gross: number };
  const rows: Row[] = [];
  let netTotal = 0, vatTotal = 0;

  for (const it of input.items) {
    const q  = clampN(it.quantity, 0);
    const up = clampN(it.unitPrice, 0);
    const ux = !VAT_ENABLED ? up : PRICES_INCLUDE_VAT ? up / (1 + VAT_RATE) : up; // ex-VAT per litre
    const net = q * ux;
    const vat = VAT_ENABLED ? net * VAT_RATE : 0;
    const gross = net + vat;
    netTotal += net; vatTotal += vat;
    rows.push({ d: it.description || "Item", q, ux, net, vat, gross });
  }
  netTotal = round2(netTotal);
  vatTotal = round2(vatTotal);
  const grand = round2(netTotal + vatTotal);

  y += 24;

  // Proportional table: 48 | 10 | 16 | 16 | 10
  const tableX = MARGIN;
  const tableW = W - MARGIN * 2;
  const cellPad = 12;
  const headH = 26;
  const rowH = 24;

  const colPerc = [0.48, 0.10, 0.16, 0.16, 0.10];
  const widths = colPerc.map(p => Math.floor(tableW * p));
  // Labels: Description | Litres | Unit ex-VAT | Net | VAT %
  const labels = ["Description", "Litres", "Unit ex-VAT", "Net", "VAT %"];
  const aligns: ("left"|"right")[] = ["left", "right", "right", "right", "right"];

  // Header band
  doc.rect(tableX, y, tableW, headH).fill(GRAY).strokeColor(BORDER).stroke();
  doc.fill(TEXT).font("Helvetica-Bold").fontSize(10.5);

  let x = tableX;
  for (let i = 0; i < widths.length; i++) {
    const w = widths[i];
    const tx = aligns[i] === "right" ? x + w - cellPad : x + cellPad;
    drawText(doc, labels[i], tx, y + 7, { width: w - cellPad * 2, align: aligns[i] });
    x += w;
  }

  // Rows
  let rowY = y + headH;
  const bottomSafe = H - bottomMargin - 180; // generous buffer for totals/footer
  doc.font("Helvetica").fontSize(10).fill(TEXT);

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (rowY + rowH > bottomSafe) {
      // safety: if we ever overflow, show a marker (shouldn’t with typical data)
      doc.font("Helvetica-Oblique").fontSize(9).fill("#6B7280");
      drawText(doc, `(+${rows.length - i} more item${rows.length - i > 1 ? "s" : ""} not shown)`,
               tableX + cellPad, rowY + 6, { width: tableW - cellPad * 2 });
      rowY += rowH;
      break;
    }

    if (i % 2 === 1) { doc.rect(tableX, rowY, tableW, rowH).fill(ZEBRA).fillColor(TEXT); }
    doc.rect(tableX, rowY, tableW, rowH).strokeColor(BORDER).stroke();

    x = tableX;
    const cells = [
      { v: r.d,             w: widths[0], a: "left"  as const },
      { v: qtyFmt(r.q),     w: widths[1], a: "right" as const },
      { v: money(r.ux, C),  w: widths[2], a: "right" as const },
      { v: money(r.net, C), w: widths[3], a: "right" as const },
      { v: VAT_ENABLED ? "20%" : "—", w: widths[4], a: "right" as const }, // header says VAT %, keep tidy
    ];

    for (const c of cells) {
      const tx = c.a === "right" ? x + c.w - cellPad : x + cellPad;
      drawText(doc, String(c.v), tx, rowY + 6, { width: c.w - cellPad * 2, align: c.a });
      x += c.w;
    }
    rowY += rowH;
  }

  /** =================== TOTALS =================== */
  rowY += 16;
  const totalsW = widths[widths.length - 1] + widths[widths.length - 2] + widths[widths.length - 3]; // last 3 cols
  const totalsX = tableX + tableW - totalsW;

  const totals = [
    { label: "Subtotal (Net)", value: money(netTotal, C), bold: false },
    { label: "VAT",            value: money(vatTotal, C), bold: false },
    { label: "Total",          value: money(grand,   C), bold: true  },
  ];

  for (let i = 0; i < totals.length; i++) {
    const h = 24, t = totals[i];
    doc.rect(totalsX, rowY, totalsW, h).fill(i === totals.length - 1 ? GRAY : "#FFFFFF").strokeColor(BORDER).stroke();
    doc.font(t.bold ? "Helvetica-Bold" : "Helvetica").fontSize(10).fill(TEXT);
    drawText(doc, t.label, totalsX + cellPad, rowY + 6, { width: totalsW / 2 - cellPad, align: "left" });
    drawText(doc, t.value, totalsX + totalsW / 2, rowY + 6, { width: totalsW / 2 - cellPad, align: "right" });
    rowY += h;
  }

  /** =================== NOTES (optional) =================== */
  if (input.meta?.notes) {
    rowY += 18;
    const notesMaxY = H - bottomMargin - 80;
    doc.font("Helvetica-Bold").fontSize(10);
    drawText(doc, "Notes", MARGIN, rowY);
    doc.font("Helvetica").fontSize(10).fill("#374151");

    const words = input.meta.notes.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      if ((line + " " + w).trim().length > 90) { lines.push(line.trim()); line = w; }
      else line += " " + w;
    }
    if (line.trim()) lines.push(line.trim());

    const lh2 = doc.currentLineHeight();
    let ny = rowY + 14;
    for (const s of lines) {
      if (ny + lh2 > notesMaxY) break;
      drawText(doc, s, MARGIN, ny, { width: W - MARGIN * 2 });
      ny += lh2;
    }
  }

  /** =================== FOOTER =================== */
  const footerY = H - bottomMargin - 18;
  doc.font("Helvetica").fontSize(9).fill("#6B7280");
  drawText(
    doc,
    `${companyName} — Registered in England & Wales${companyNo ? " • Company No " + companyNo : ""}${companyVat ? " • VAT No " + companyVat : ""}`,
    MARGIN, footerY, { width: W - MARGIN * 2, align: "center" }
  );

  const pr = doc.bufferedPageRange?.();
  const pages = pr && typeof pr.count === "number" ? pr.count : 1;

  doc.end();
  await done;

  return { pdfBuffer: Buffer.concat(chunks), filename: `${invNo}.pdf`, total: grand, pages };
}

