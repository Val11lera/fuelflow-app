// src/lib/invoice-pdf.ts
// src/lib/invoice-pdf.ts
import PDFDocument from "pdfkit";

export type LineItem = { description: string; quantity: number; unitPrice: number; };
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
  meta?: { invoiceNumber?: string; orderId?: string; notes?: string; };
};
export type BuiltInvoice = { pdfBuffer: Buffer; filename: string; total: number; };

const MARGIN = 36;

// Absolute text helper: never advance global flow
function t(doc: any, str: string, x: number, y: number, opt: any = {}) {
  const prevX = doc.x, prevY = doc.y;
  doc.text(str, x, y, { lineBreak: false, ...opt });
  doc.x = prevX; doc.y = prevY; // restore
}

function num(n: unknown, d = 0) { const v = Number(n); return Number.isFinite(v) ? v : d; }
function round2(n: number) { return Math.round(n * 100) / 100; }
function symbol(c: string) { c = (c || "").toUpperCase(); return c === "GBP" ? "£" : c === "EUR" ? "€" : c === "USD" ? "$" : ""; }
function fmtQty(n: number) { return new Intl.NumberFormat("en-GB",{maximumFractionDigits:2}).format(n); }
function money(n: number, c: string) { return `${symbol(c)}${round2(n).toFixed(2)}`; }

export async function buildInvoicePdf(payload: InvoiceInput): Promise<BuiltInvoice> {
  const VAT_ENABLED = process.env.VAT_ENABLED !== "false";
  const VAT_RATE = Math.max(0, parseFloat(process.env.VAT_RATE ?? "20")) / 100;
  const PRICES_INCLUDE_VAT = process.env.PRICES_INCLUDE_VAT === "true";

  const doc: any = new PDFDocument({ size: "A4", autoFirstPage: false });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((r) => doc.on("end", () => r()));

  // Single controlled page
  doc.addPage({ size: "A4", margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: MARGIN } });
  const W = doc.page.width, H = doc.page.height;

  const companyName = process.env.COMPANY_NAME || "FuelFlow";
  const companyAddr = (process.env.COMPANY_ADDRESS || "1 Example Street\\nExample Town\\nEX1 2MP\\nUnited Kingdom").replace(/\\n/g,"\n");
  const companyEmail = process.env.COMPANY_EMAIL || "invoices@mail.fuelflow.co.uk";
  const companyPhone = process.env.COMPANY_PHONE || "";
  const companyVat = process.env.COMPANY_VAT_NUMBER || process.env.COMPANY_VAT_NO || "";
  const companyNo  = process.env.COMPANY_NUMBER     || process.env.COMPANY_REG_NO || "";

  const C = (payload.currency || "GBP").toUpperCase();
  const invNo = payload.meta?.invoiceNumber || `INV-${Math.floor(Date.now()/1000)}`;
  const invDate = new Date().toLocaleDateString("en-GB");

  /* Header (absolute everything) */
  doc.rect(0, 0, W, 84).fill("#0F172A");
  doc.fill("#FFFFFF").font("Helvetica-Bold").fontSize(26);
  t(doc, companyName, MARGIN, 26, { width: W - MARGIN*2 });
  doc.font("Helvetica").fontSize(12);
  t(doc, "TAX INVOICE", W - MARGIN - 200, 34, { width: 200, align: "right" });

  doc.fill("#111827").font("Helvetica").fontSize(10);

  /* From / Bill To */
  const leftX = MARGIN, rightX = W/2 + 12, colW = W/2 - MARGIN - 24;
  let y = 100;

  doc.font("Helvetica-Bold").fontSize(11);
  t(doc, "From", leftX, y);
  t(doc, "Bill To", rightX, y);

  doc.font("Helvetica").fontSize(10);
  const leftLines = [
    companyName, ...companyAddr.split("\n"),
    companyEmail ? `Email: ${companyEmail}` : undefined,
    companyPhone ? `Tel: ${companyPhone}` : undefined,
    companyNo ? `Company No: ${companyNo}` : undefined,
    companyVat ? `VAT No: ${companyVat}` : undefined,
  ].filter(Boolean) as string[];
  const rightLines = [
    payload.customer.name || "Customer",
    payload.customer.address_line1 || undefined,
    payload.customer.address_line2 || undefined,
    [payload.customer.city, payload.customer.postcode].filter(Boolean).join(" ") || undefined,
    payload.customer.email ? `Email: ${payload.customer.email}` : undefined,
  ].filter(Boolean) as string[];

  // draw each line manually so there is NO flow
  let yl = y + 16, yr = y + 16;
  const lh = doc.currentLineHeight();
  for (const s of leftLines) { t(doc, s, leftX, yl, { width: colW }); yl += lh; }
  for (const s of rightLines){ t(doc, s, rightX, yr, { width: colW }); yr += lh; }
  y = Math.max(yl, yr) + 14;

  // Divider
  doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).strokeColor("#E5E7EB").stroke();
  y += 10;

  doc.font("Helvetica-Bold").fontSize(10);
  t(doc, "Invoice No:", MARGIN, y);
  doc.font("Helvetica"); t(doc, invNo, MARGIN + 95, y);
  doc.font("Helvetica-Bold"); t(doc, "Date:", MARGIN + 260, y);
  doc.font("Helvetica"); t(doc, invDate, MARGIN + 310, y);

  if (payload.meta?.orderId) {
    y += 16;
    doc.font("Helvetica-Bold"); t(doc, "Order Ref:", MARGIN, y);
    doc.font("Helvetica"); t(doc, String(payload.meta.orderId), MARGIN + 95, y);
  }

  /* Build rows (per-litre pricing) */
  type Row = { d: string; q: number; ux: number; net: number; vp: number; v: number; g: number; };
  const rows: Row[] = [];
  let netTotal = 0, vatTotal = 0;

  for (const it of payload.items) {
    const q = num(it.quantity, 0);
    const raw = num(it.unitPrice, 0);
    const ux = !VAT_ENABLED ? raw : PRICES_INCLUDE_VAT ? raw/(1+VAT_RATE) : raw; // per-litre ex-VAT
    const net = q * ux;
    const v   = VAT_ENABLED ? net * VAT_RATE : 0;
    const g   = net + v;
    netTotal += net; vatTotal += v;
    rows.push({ d: it.description || "Item", q, ux, net, vp: VAT_ENABLED ? VAT_RATE*100 : 0, v, g });
  }
  netTotal = round2(netTotal); vatTotal = round2(vatTotal);
  const grand = round2(netTotal + vatTotal);

  /* Table */
  y += 22;
  const tableX = MARGIN, tableW = W - MARGIN*2;
  const cols = [
    { label: "Description", w: 210, align: "left"  as const },
    { label: "Litres",      w:  60, align: "right" as const },
    { label: "Unit ex-VAT", w:  90, align: "right" as const },
    { label: "Net",         w:  75, align: "right" as const },
    { label: "VAT %",       w:  55, align: "right" as const },
    { label: "VAT",         w:  85, align: "right" as const },
    { label: "Total",       w:  90, align: "right" as const },
  ];

  // header band
  doc.rect(tableX, y, tableW, 24).fill("#F3F4F6").strokeColor("#E5E7EB").stroke();
  doc.fill("#111827").font("Helvetica-Bold").fontSize(9);
  let x = tableX + 10;
  for (const c of cols) {
    const tx = c.align === "right" ? x + c.w - 10 : x;
    t(doc, c.label, tx, y + 7, { width: c.w - 20, align: c.align });
    x += c.w;
  }

  // rows (no wrapping; one page guard)
  let rowY = y + 24;
  const rowH = 22;
  const bottomSafe = H - 150;
  doc.font("Helvetica").fontSize(10).fill("#111827");

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (rowY + rowH > bottomSafe) {
      doc.font("Helvetica-Oblique").fontSize(9).fill("#6B7280");
      t(doc, `(+${rows.length - i} more item${rows.length - i > 1 ? "s" : ""} not shown)`, tableX + 10, rowY + 6, { width: tableW - 20 });
      rowY += rowH;
      break;
    }
    if (i % 2 === 1) { doc.rect(tableX, rowY, tableW, rowH).fill("#FAFAFA"); doc.fill("#111827"); }

    x = tableX + 10;
    const cells = [
      { v: r.d,                   w: cols[0].w, align: cols[0].align },
      { v: fmtQty(r.q),           w: cols[1].w, align: cols[1].align },
      { v: money(r.ux, C),        w: cols[2].w, align: cols[2].align },
      { v: money(r.net, C),       w: cols[3].w, align: cols[3].align },
      { v: VAT_ENABLED ? `${r.vp.toFixed(0)}%` : "—", w: cols[4].w, align: cols[4].align },
      { v: VAT_ENABLED ? money(r.v, C) : money(0, C), w: cols[5].w, align: cols[5].align },
      { v: money(r.g, C),         w: cols[6].w, align: cols[6].align },
    ] as const;

    for (const c of cells) {
      const tx = c.align === "right" ? x + c.w - 10 : x;
      t(doc, String(c.v), tx, rowY + 6, { width: c.w - 20, align: c.align });
      x += c.w;
    }
    doc.rect(tableX, rowY, tableW, rowH).strokeColor("#E5E7EB").stroke();
    rowY += rowH;
  }

  // totals
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
    t(doc, T.label, totalsX + 12, rowY + 6, { width: totalsW / 2 - 12, align: "left"  });
    t(doc, T.value, totalsX + totalsW / 2, rowY + 6, { width: totalsW / 2 - 12, align: "right" });
    rowY += h;
  }

  // notes (optional) — draw line by line to avoid flow
  if (payload.meta?.notes) {
    rowY += 16;
    doc.font("Helvetica-Bold").fontSize(10); t(doc, "Notes", tableX, rowY);
    doc.font("Helvetica").fontSize(10).fill("#374151");
    const words = payload.meta.notes.split(/\s+/); const lines: string[] = [];
    let line = "";
    for (const w of words) {
      if ((line + " " + w).trim().length > 90) { lines.push(line.trim()); line = w; }
      else line += " " + w;
    }
    if (line.trim()) lines.push(line.trim());
    const lh2 = doc.currentLineHeight();
    let ny = rowY + 14;
    for (const s of lines) { t(doc, s, tableX, ny, { width: W - MARGIN * 2 }); ny += lh2; }
  }

  // footer (absolute, same page)
  doc.font("Helvetica").fontSize(9).fill("#6B7280");
  t(
    doc,
    `${companyName} — Registered in England & Wales${companyNo ? " • Company No " + companyNo : ""}${companyVat ? " • VAT No " + companyVat : ""}`,
    MARGIN,
    H - 40,
    { width: W - MARGIN * 2, align: "center" }
  );

  doc.end();
  await done;

  return { pdfBuffer: Buffer.concat(chunks), filename: `${invNo}.pdf`, total: grand };
}

