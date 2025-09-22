// src/lib/invoice-pdf.ts
// src/lib/invoice-pdf.ts
import PDFDocument from "pdfkit";

export type LineItem = { description: string; quantity: number; unitPrice: number }; // unitPrice = price per litre
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

// Absolute text helper: draw and restore cursor so PDFKit never flows/paginates.
function drawText(doc: any, str: string, x: number, y: number, opt: any = {}) {
  const px = doc.x, py = doc.y;
  doc.text(str, x, y, { lineBreak: false, ...opt });
  doc.x = px; doc.y = py;
}
function n(v: unknown, d = 0) { const x = Number(v); return Number.isFinite(x) ? x : d; }
function r2(v: number) { return Math.round(v * 100) / 100; }
function sym(c: string) { c = (c || "").toUpperCase(); return c === "GBP" ? "£" : c === "EUR" ? "€" : c === "USD" ? "$" : ""; }
function money(v: number, c: string) { return `${sym(c)}${r2(v).toFixed(2)}`; }
function qty(v: number) { return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(v); }

export async function buildInvoicePdf(input: InvoiceInput): Promise<BuiltInvoice> {
  const VAT_ENABLED = process.env.VAT_ENABLED !== "false";
  const VAT_RATE = Math.max(0, parseFloat(process.env.VAT_RATE ?? "20")) / 100;
  const PRICES_INCLUDE_VAT = process.env.PRICES_INCLUDE_VAT === "true";

  // IMPORTANT: let PDFKit create the first page itself (no addPage)
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
  const topMargin = doc.page.margins.top ?? MARGIN;
  const bottomMargin = doc.page.margins.bottom ?? MARGIN;
  const C = (input.currency || "GBP").toUpperCase();

  const companyName = process.env.COMPANY_NAME || "FuelFlow";
  const companyAddr = (process.env.COMPANY_ADDRESS || "1 Example Street\\nExample Town\\nEX1 2MP\\nUnited Kingdom").replace(/\\n/g, "\n");
  const companyEmail = process.env.COMPANY_EMAIL || "invoices@mail.fuelflow.co.uk";
  const companyPhone = process.env.COMPANY_PHONE || "";
  const companyVat   = process.env.COMPANY_VAT_NUMBER || process.env.COMPANY_VAT_NO || "";
  const companyNo    = process.env.COMPANY_NUMBER     || process.env.COMPANY_REG_NO || "";

  const invNo = input.meta?.invoiceNumber || `INV-${Math.floor(Date.now() / 1000)}`;
  const invDate = new Date().toLocaleDateString("en-GB");

  // Header band
  doc.rect(0, 0, W, 84).fill("#0F172A");
  doc.fill("#FFFFFF").font("Helvetica-Bold").fontSize(26);
  drawText(doc, companyName, MARGIN, 26, { width: W - MARGIN * 2 });
  doc.font("Helvetica").fontSize(12);
  drawText(doc, "TAX INVOICE", W - MARGIN - 200, 34, { width: 200, align: "right" });

  // Body
  doc.fill("#111827").font("Helvetica").fontSize(10);

  const leftX = MARGIN;
  const rightX = W / 2 + 12;
  const colW = W / 2 - MARGIN - 24;
  let y = topMargin + 64; // content below header

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

  doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).strokeColor("#E5E7EB").stroke();
  y += 10;

  doc.font("Helvetica-Bold").fontSize(10);
  drawText(doc, "Invoice No:", MARGIN, y);
  doc.font("Helvetica");
  drawText(doc, invNo, MARGIN + 95, y);
  doc.font("Helvetica-Bold");
  drawText(doc, "Date:", MARGIN + 260, y);
  doc.font("Helvetica");
  drawText(doc, invDate, MARGIN + 310, y);

  if (input.meta?.orderId) {
    y += 16;
    doc.font("Helvetica-Bold");
    drawText(doc, "Order Ref:", MARGIN, y);
    doc.font("Helvetica");
    drawText(doc, String(input.meta.orderId), MARGIN + 95, y);
  }

  // Compute lines
  type Row = { d: string; q: number; ux: number; net: number; vp: number; vat: number; gross: number };
  const rows: Row[] = [];
  let netTotal = 0, vatTotal = 0;

  for (const it of input.items) {
    const q  = n(it.quantity, 0);
    const up = n(it.unitPrice, 0);
    const ux = !VAT_ENABLED ? up : PRICES_INCLUDE_VAT ? up / (1 + VAT_RATE) : up; // ex-VAT per litre
    const net = q * ux;
    const v   = VAT_ENABLED ? net * VAT_RATE : 0;
    const g   = net + v;
    netTotal += net; vatTotal += v;
    rows.push({ d: it.description || "Item", q, ux, net, vp: VAT_RATE * 100, vat: v, gross: g });
  }
  netTotal = r2(netTotal); vatTotal = r2(vatTotal);
  const grand = r2(netTotal + vatTotal);

  // Table
  y += 22;
  const tableX = MARGIN, tableW = W - MARGIN * 2;
  const cols = [
    { label: "Description", w: 210, align: "left"  as const },
    { label: "Litres",      w:  60, align: "right" as const },
    { label: "Unit ex-VAT", w:  90, align: "right" as const },
    { label: "Net",         w:  75, align: "right" as const },
    { label: "VAT %",       w:  55, align: "right" as const },
    { label: "VAT",         w:  85, align: "right" as const },
    { label: "Total",       w:  90, align: "right" as const },
  ];

  doc.rect(tableX, y, tableW, 24).fill("#F3F4F6").strokeColor("#E5E7EB").stroke();
  doc.fill("#111827").font("Helvetica-Bold").fontSize(9);
  let x = tableX + 10;
  for (const c of cols) {
    const tx = c.align === "right" ? x + c.w - 10 : x;
    drawText(doc, c.label, tx, y + 7, { width: c.w - 20, align: c.align });
    x += c.w;
  }

  let rowY = y + 24;
  const rowH = 22;
  // Keep rows well above bottom margin so viewers never “create” a second sheet
  const bottomSafe = H - bottomMargin - 190;
  doc.font("Helvetica").fontSize(10).fill("#111827");

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (rowY + rowH > bottomSafe) {
      doc.font("Helvetica-Oblique").fontSize(9).fill("#6B7280");
      drawText(doc, `(+${rows.length - i} more item${rows.length - i > 1 ? "s" : ""} not shown)`,
               tableX + 10, rowY + 6, { width: tableW - 20 });
      rowY += rowH;
      break;
    }
    if (i % 2 === 1) { doc.rect(tableX, rowY, tableW, rowH).fill("#FAFAFA"); doc.fill("#111827"); }

    x = tableX + 10;
    const cells = [
      { v: r.d,               w: cols[0].w, align: cols[0].align },
      { v: qty(r.q),          w: cols[1].w, align: cols[1].align },
      { v: money(r.ux, C),    w: cols[2].w, align: cols[2].align },
      { v: money(r.net, C),   w: cols[3].w, align: cols[3].align },
      { v: VAT_ENABLED ? `${Math.round(r.vp)}%` : "—", w: cols[4].w, align: cols[4].align },
      { v: VAT_ENABLED ? money(r.vat, C) : money(0, C), w: cols[5].w, align: cols[5].align },
      { v: money(r.gross, C), w: cols[6].w, align: cols[6].align },
    ] as const;

    for (const c of cells) {
      const tx = c.align === "right" ? x + c.w - 10 : x;
      drawText(doc, String(c.v), tx, rowY + 6, { width: c.w - 20, align: c.align });
      x += c.w;
    }

    doc.rect(tableX, rowY, tableW, rowH).strokeColor("#E5E7EB").stroke();
    rowY += rowH;
  }

  // Totals
  rowY += 12;
  const totalsW = cols.slice(-3).reduce((a, c) => a + c.w, 0);
  const totalsX = tableX + tableW - totalsW;
  const totals = [
    { label: "Subtotal (Net)", value: money(netTotal, C), bold: false },
    { label: "VAT",            value: money(vatTotal, C), bold: false },
    { label: "Total",          value: money(grand,   C),  bold: true  },
  ];

  for (let i = 0; i < totals.length; i++) {
    const h = 22, T = totals[i];
    doc.rect(totalsX, rowY, totalsW, h).fill(i === totals.length - 1 ? "#F3F4F6" : "#FFFFFF").strokeColor("#E5E7EB").stroke();
    doc.font(T.bold ? "Helvetica-Bold" : "Helvetica").fontSize(10).fill("#111827");
    drawText(doc, T.label, totalsX + 12, rowY + 6, { width: totalsW / 2 - 12, align: "left"  });
    drawText(doc, T.value, totalsX + totalsW / 2, rowY + 6, { width: totalsW / 2 - 12, align: "right" });
    rowY += h;
  }

  // Notes (optional) — draw line by line, and stop well above bottom margin
  if (input.meta?.notes) {
    rowY += 16;
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

  // Footer — anchor *inside* the bottom margin
  const footerY = H - bottomMargin - 18;
  doc.font("Helvetica").fontSize(9).fill("#6B7280");
  drawText(
    doc,
    `${companyName} — Registered in England & Wales${companyNo ? " • Company No " + companyNo : ""}${companyVat ? " • VAT No " + companyVat : ""}`,
    MARGIN,
    footerY,
    { width: W - MARGIN * 2, align: "center" }
  );

  const pr = doc.bufferedPageRange?.();
  const pages = pr && typeof pr.count === "number" ? pr.count : 1;

  doc.end();
  await done;

  return { pdfBuffer: Buffer.concat(chunks), filename: `${invNo}.pdf`, total: grand, pages };
}

