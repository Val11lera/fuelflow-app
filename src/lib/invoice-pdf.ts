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
  meta?: { invoiceNumber?: string; orderId?: string; notes?: string; dateISO?: string };
};
export type BuiltInvoice = { pdfBuffer: Buffer; filename: string; total: number; pages?: number };

const MARGIN = 36;

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
async function fetchArrayBuffer(url: string): Promise<ArrayBuffer | null> {
  try { const resp = await fetch(url); if (!resp.ok) return null; return await resp.arrayBuffer(); }
  catch { return null; }
}
function drawBlock(doc: any, lines: string[], x: number, y: number, width: number, lineHeight = 14) {
  let yy = y;
  for (const line of lines) {
    drawText(doc, line, x, yy, { width, lineBreak: false });
    yy += lineHeight;
  }
  return yy;
}

export async function buildInvoicePdf(input: InvoiceInput): Promise<BuiltInvoice> {
  const VAT_ENABLED = process.env.VAT_ENABLED !== "false";
  const VAT_RATE = Math.max(0, parseFloat(process.env.VAT_RATE ?? "20")) / 100;
  const PRICES_INCLUDE_VAT = process.env.PRICES_INCLUDE_VAT === "true";

  const doc: any = new PDFDocument({
    size: "A4",
    autoFirstPage: true,
    bufferPages: true,
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
  const companyVat   = process.env.COMPANY_VAT_NUMBER || process.env.COMPANY_VAT_NO || "";
  const companyNo    = process.env.COMPANY_NUMBER     || process.env.COMPANY_REG_NO || "";

  const invNo   = input.meta?.invoiceNumber || `INV-${Math.floor(Date.now() / 1000)}`;
  const invDate = new Date(input.meta?.dateISO || Date.now()).toLocaleDateString("en-GB");

  // Header
  const headerH = 90;
  doc.rect(0, 0, W, headerH).fill("#0F172A");

  const logoUrl = process.env.COMPANY_LOGO_URL || "https://dashboard.fuelflow.co.uk/logo-email.png";
  let logoDrawn = false;
  try {
    const ab = await fetchArrayBuffer(logoUrl);
    if (ab) { doc.image(Buffer.from(ab), MARGIN, 26, { width: 156, height: 42, fit: [156, 42] }); logoDrawn = true; }
  } catch {}
  if (!logoDrawn) {
    doc.fill("#FFFFFF").font("Helvetica-Bold").fontSize(26);
    drawText(doc, companyName, MARGIN, 30, { width: W - MARGIN * 2 });
  }
  doc.fill("#FFFFFF").font("Helvetica").fontSize(12);
  drawText(doc, "TAX INVOICE", W - MARGIN - 200, 34, { width: 200, align: "right" });

  // Addresses
  const gridLH = 14;
  const gapUnderHeader = 24;
  const gapUnderBlocks = 16;

  let y = topMargin + headerH - MARGIN + gapUnderHeader;

  const leftX  = MARGIN;
  const rightX = W / 2 + 20;
  const leftW  = W / 2 - MARGIN - 28;
  const rightW = W - rightX - MARGIN;

  doc.font("Helvetica-Bold").fontSize(11).fill("#111827");
  drawText(doc, "From", leftX, y);
  drawText(doc, "Bill To", rightX, y);
  y += 14;

  doc.font("Helvetica").fontSize(10).fill("#111827");
  const leftLines = [
    companyName,
    ...companyAddr.split("\n"),
    companyEmail ? `Email: ${companyEmail}` : undefined,
    companyNo ? `Company No: ${companyNo}` : undefined,
    companyVat ? `VAT No: ${companyVat}` : undefined,
  ].filter(Boolean) as string[];

  const c = input.customer;
  const rightLines = [
    c.name || "Customer",
    c.address_line1 || undefined,
    c.address_line2 || undefined,
    [c.city, c.postcode].filter(Boolean).join(" ") || undefined,
    c.email ? `Email: ${c.email}` : undefined,
  ].filter(Boolean) as string[];

  const leftEndY  = drawBlock(doc, leftLines,  leftX,  y, leftW,  gridLH);
  const rightEndY = drawBlock(doc, rightLines, rightX, y, rightW, gridLH);
  y = Math.max(leftEndY, rightEndY) + gapUnderBlocks;

  // Meta
  doc.moveTo(MARGIN + 0.5, y).lineTo(W - MARGIN - 0.5, y).strokeColor("#E5E7EB").lineWidth(1).stroke();
  y += 14;

  doc.font("Helvetica-Bold").fontSize(10).fill("#111827");
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

  // Compute items
  type Row = { d: string; q: number; ux: number; net: number; vp: number; vat: number; gross: number };
  const rows: Row[] = [];
  let netTotal = 0, vatTotal = 0;

  for (const it of input.items) {
    const q  = n(it.quantity, 0);
    const up = n(it.unitPrice, 0);
    const ux = !VAT_ENABLED ? up : (PRICES_INCLUDE_VAT ? up / (1 + VAT_RATE) : up);
    const net = q * ux;
    const v   = VAT_ENABLED ? net * VAT_RATE : 0;
    const g   = net + v;
    netTotal += net; vatTotal += v;
    rows.push({ d: it.description || "Item", q, ux, net, vp: VAT_RATE * 100, vat: v, gross: g });
  }
  netTotal = r2(netTotal); vatTotal = r2(vatTotal);
  const grand = r2(netTotal + vatTotal);

  // Table
  y += 20;
  const tableX = MARGIN + 0.5;
  const tableW = W - MARGIN * 2 - 7; // keep away from right edge

  // Proportional columns with sensible minimums (px)
  const PAD_R = 10;              // right padding for right-aligned cells
  const PAD_L = 10;              // left padding
  const MIN_VATP = 38;           // ensures "VAT %" fits in header
  const MIN_VAT  = 40;           // ensures "VAT" fits
  const MIN_TOTAL = 48;          // space for totals

  // Base fractions (~1.00)
  const base = [
    { label: "Description", frac: 0.38, align: "left"  as const, min: 140 },
    { label: "Litres",      frac: 0.12, align: "right" as const, min: 56  },
    { label: "Unit ex-VAT", frac: 0.15, align: "right" as const, min: 72  },
    { label: "Net",         frac: 0.14, align: "right" as const, min: 68  },
    { label: "VAT %",       frac: 0.07, align: "right" as const, min: MIN_VATP },
    { label: "VAT",         frac: 0.07, align: "right" as const, min: MIN_VAT  },
    { label: "Total",       frac: 0.07, align: "right" as const, min: MIN_TOTAL },
  ];

  // Convert to exact pixel widths (respect mins, last column absorbs rounding)
  const firstSix = base.slice(0, -1).map(c => Math.max(Math.floor(c.frac * tableW), c.min));
  let used = firstSix.reduce((a, b) => a + b, 0);
  // If mins overflow table, scale them down proportionally (rare on A4, but safe)
  if (used > tableW - MIN_TOTAL) {
    const scale = (tableW - MIN_TOTAL) / used;
    for (let i = 0; i < firstSix.length; i++) firstSix[i] = Math.floor(firstSix[i] * scale);
    used = firstSix.reduce((a, b) => a + b, 0);
  }
  const lastW = Math.max(tableW - used, MIN_TOTAL);
  const cols = [
    ...firstSix.map((w, i) => ({ label: base[i].label, w, align: base[i].align })),
    { label: base.at(-1)!.label, w: lastW, align: base.at(-1)!.align },
  ];

  // Header row
  doc.rect(tableX, y, tableW, 24).fill("#F3F4F6").strokeColor("#E5E7EB").lineWidth(0.6).stroke();
  doc.fill("#111827").font("Helvetica-Bold").fontSize(9);
  let x = tableX;
  for (const c of cols) {
    const innerX = c.align === "right" ? x + c.w - PAD_R : x + PAD_L;
    const innerW = c.w - (PAD_L + PAD_R);
    drawText(doc, c.label, innerX, y + 7, { width: Math.max(innerW, 24), align: c.align });
    x += c.w;
  }

  // Rows
  let rowY = y + 24;
  const rowH = 24;
  const bottomSafe = H - bottomMargin - 190;
  doc.font("Helvetica").fontSize(10).fill("#111827");

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (rowY + rowH > bottomSafe) {
      doc.font("Helvetica-Oblique").fontSize(9).fill("#6B7280");
      drawText(doc, `(+${rows.length - i} more item${rows.length - i > 1 ? "s" : ""} not shown)`,
               tableX + PAD_L, rowY + 6, { width: tableW - (PAD_L + PAD_R) });
      rowY += rowH;
      break;
    }
    if (i % 2 === 1) { doc.rect(tableX, rowY, tableW, rowH).fill("#FAFAFA"); doc.fill("#111827"); }

    x = tableX;
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
      const innerX = c.align === "right" ? x + c.w - PAD_R : x + PAD_L;
      const innerW = c.w - (PAD_L + PAD_R);
      drawText(doc, String(c.v), innerX, rowY + 6, { width: Math.max(innerW, 24), align: c.align });
      x += c.w;
    }

    doc.rect(tableX, rowY, tableW, rowH).strokeColor("#E5E7EB").lineWidth(0.6).stroke();
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
    const h = 24, T = totals[i];
    doc.rect(totalsX, rowY, totalsW, h)
       .fill(i === totals.length - 1 ? "#F3F4F6" : "#FFFFFF")
       .strokeColor("#E5E7EB").lineWidth(0.6).stroke();
    doc.font(T.bold ? "Helvetica-Bold" : "Helvetica").fontSize(10).fill("#111827");
    drawText(doc, T.label, totalsX + 12, rowY + 7, { width: totalsW / 2 - 12, align: "left"  });
    drawText(doc, T.value, totalsX + totalsW / 2, rowY + 7, { width: totalsW / 2 - 12, align: "right" });
    rowY += h;
  }

  // Notes
  if (input.meta?.notes) {
    rowY += 16;
    const notesMaxY = H - bottomMargin - 80;
    doc.font("Helvetica-Bold").fontSize(10).fill("#111827");
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

    let ny = rowY + 14;
    for (const s of lines) {
      if (ny + 14 > notesMaxY) break;
      drawText(doc, s, MARGIN, ny, { width: W - MARGIN * 2 });
      ny += 14;
    }
  }

  // Footer
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

  return { pdfBuffer: Buffer.concat(chunks), filename: `${invNo}.pdf`, total: r2(netTotal + vatTotal), pages };
}


