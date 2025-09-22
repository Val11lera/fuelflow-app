// src/lib/invoice-pdf.ts
// src/lib/invoice-pdf.ts
import PDFDocument from "pdfkit";

export type LineItem = {
  description: string;
  quantity: number;          // litres
  unitPrice: number;         // major units (e.g., 1.71 = £1.71)
};

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
  currency: string; // "GBP" | "EUR" | "USD" | etc
  meta?: {
    invoiceNumber?: string;
    orderId?: string;
    notes?: string;
  };
};

export type BuiltInvoice = {
  pdfBuffer: Buffer;
  filename: string;
  total: number; // grand total (gross)
};

function currencySymbol(cur: string) {
  const c = (cur || "").toUpperCase();
  if (c === "GBP") return "£";
  if (c === "EUR") return "€";
  if (c === "USD") return "$";
  return "";
}

function num(n: unknown, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// Helper: draw multi-line block at (x,y) with fixed width and return endY
function drawBlock(doc: any, text: string, x: number, y: number, width: number) {
  const h = doc.heightOfString(text, { width });
  doc.text(text, x, y, { width });
  return y + h;
}

export async function buildInvoicePdf(payload: InvoiceInput): Promise<BuiltInvoice> {
  // VAT config (same as your API route)
  const VAT_ENABLED = process.env.VAT_ENABLED !== "false";
  const VAT_RATE = Math.max(0, parseFloat(process.env.VAT_RATE ?? "20")) / 100; // 0.20
  const PRICES_INCLUDE_VAT = process.env.PRICES_INCLUDE_VAT === "true";

  const MARGIN = 36;
  const doc: any = new PDFDocument({ size: "A4", margin: MARGIN });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve) => doc.on("end", () => resolve()));

  const pageW = doc.page.width;
  const pageH = doc.page.height;

  const companyName = process.env.COMPANY_NAME || "FuelFlow";
  // Accept both "\n" and "\\n" for env address
  const companyAddr =
    (process.env.COMPANY_ADDRESS || "1 Example Street\\nExample Town\\nEX1 2MP\\nUnited Kingdom").replace(/\\n/g, "\n");
  const companyEmail = process.env.COMPANY_EMAIL || "invoices@mail.fuelflow.co.uk";
  const companyPhone = process.env.COMPANY_PHONE || "";
  const companyVat = process.env.COMPANY_VAT_NUMBER || process.env.COMPANY_VAT_NO || "";
  const companyNo = process.env.COMPANY_NUMBER || process.env.COMPANY_REG_NO || "";

  const cur = (payload.currency || "GBP").toUpperCase();
  const sym = currencySymbol(cur);
  const invNo = payload.meta?.invoiceNumber || `INV-${Math.floor(Date.now() / 1000)}`;
  const invDate = new Date().toLocaleDateString("en-GB");

  /* ======== Header (navy bar + TAX INVOICE) ======== */
  doc.rect(0, 0, pageW, 70).fill("#0F172A"); // navy/shell
  doc
    .fill("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(22)
    .text(companyName, MARGIN, 22, { width: pageW - MARGIN * 2, align: "left" })
    .font("Helvetica")
    .fontSize(12)
    .text("TAX INVOICE", { align: "right" });

  doc.fill("#111827"); // back to dark text

  /* ======== From (left) / Bill To (right) — measured columns ======== */
  const colGap = 10;
  const leftX = MARGIN;
  const rightX = pageW / 2 + colGap;
  const colW = pageW / 2 - MARGIN - colGap - 12; // ~half page, minus gap

  let y = 90;

  // Left title
  doc.font("Helvetica-Bold").fontSize(11).text("From", leftX, y);
  // Build left block string
  const leftLines = [
    companyName,
    ...companyAddr.split("\n"),
    companyEmail ? `Email: ${companyEmail}` : undefined,
    companyPhone ? `Tel: ${companyPhone}` : undefined,
    companyNo ? `Company No: ${companyNo}` : undefined,
    companyVat ? `VAT No: ${companyVat}` : undefined,
  ].filter(Boolean) as string[];

  // Right title
  doc.font("Helvetica-Bold").fontSize(11).text("Bill To", rightX, y);

  // Body text style
  doc.font("Helvetica").fontSize(10);

  const leftBodyY = y + 15;
  const rightBodyY = y + 15;

  // Measure & draw both columns, then advance y to the max
  const leftText = leftLines.join("\n");
  const rightLines = [
    payload.customer.name || "Customer",
    payload.customer.address_line1 || undefined,
    payload.customer.address_line2 || undefined,
    [payload.customer.city, payload.customer.postcode].filter(Boolean).join(" ") || undefined,
    payload.customer.email ? `Email: ${payload.customer.email}` : undefined,
  ].filter(Boolean) as string[];
  const rightText = rightLines.join("\n");

  const leftEndY = drawBlock(doc, leftText, leftX, leftBodyY, colW);
  const rightEndY = drawBlock(doc, rightText, rightX, rightBodyY, colW);

  y = Math.max(leftEndY, rightEndY) + 12; // spacer below columns

  /* ======== Invoice Meta (always below the taller column) ======== */
  doc
    .moveTo(MARGIN, y)
    .lineTo(pageW - MARGIN, y)
    .strokeColor("#E5E7EB")
    .stroke();

  y += 10;

  doc.font("Helvetica-Bold").fontSize(10).fill("#111827");
  doc.text("Invoice No:", MARGIN, y);
  doc.font("Helvetica").text(invNo, MARGIN + 95, y);

  doc.font("Helvetica-Bold").text("Date:", MARGIN + 260, y);
  doc.font("Helvetica").text(invDate, MARGIN + 310, y);

  if (payload.meta?.orderId) {
    y += 16;
    doc.font("Helvetica-Bold").text("Order Ref:", MARGIN, y);
    doc.font("Helvetica").text(String(payload.meta.orderId), MARGIN + 95, y);
  }

  /* ======== Compute rows (VAT aware) ======== */
  type Row = {
    description: string;
    qty: number;
    unitEx: number; // ex-VAT
    net: number;
    vatRatePct: number;
    vat: number;
    gross: number;
  };

  const rows: Row[] = [];
  let netTotal = 0;
  let vatTotal = 0;

  payload.items.forEach((it) => {
    const qty = num(it.quantity, 0);
    const unitRaw = num(it.unitPrice, 0);
    const unitEx = !VAT_ENABLED ? unitRaw : PRICES_INCLUDE_VAT ? unitRaw / (1 + VAT_RATE) : unitRaw;

    const net = qty * unitEx;
    const vat = VAT_ENABLED ? net * VAT_RATE : 0;
    const gross = net + vat;

    netTotal += net;
    vatTotal += vat;

    rows.push({
      description: it.description || "Item",
      qty,
      unitEx,
      net,
      vatRatePct: VAT_ENABLED ? VAT_RATE * 100 : 0,
      vat,
      gross,
    });
  });

  netTotal = round2(netTotal);
  vatTotal = round2(vatTotal);
  const grandTotal = round2(netTotal + vatTotal);

  /* ======== Table (fixed positions; no accidental flow) ======== */
  y += 22; // space before table
  const tableX = MARGIN;
  const tableW = pageW - MARGIN * 2;

  // Header band
  doc
    .rect(tableX, y, tableW, 24)
    .fill("#F3F4F6")
    .strokeColor("#E5E7EB")
    .stroke();

  doc.fill("#111827").font("Helvetica-Bold").fontSize(10);

  const cols = [
    { label: "Description", w: 180, align: "left" as const },
    { label: "Litres", w: 70, align: "right" as const },
    { label: "Unit (ex-VAT)", w: 95, align: "right" as const },
    { label: "Net", w: 90, align: "right" as const },
    { label: "VAT %", w: 55, align: "right" as const },
    { label: "VAT", w: 90, align: "right" as const },
    { label: "Total", w: 100, align: "right" as const },
  ];

  let x = tableX + 8;
  cols.forEach((c) => {
    const tx = c.align === "right" ? x + c.w - 8 : x;
    doc.text(c.label, tx, y + 7, { width: c.w - 16, align: c.align });
    x += c.w;
  });

  // Rows
  let rowY = y + 24;
  doc.font("Helvetica").fontSize(10).fill("#111827");
  const money = (n: number) => `${sym}${round2(n).toFixed(2)}`;

  const rowH = 22;
  const bottomSafe = pageH - 140; // leave room for totals + notes + footer

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];

    // Keep single page: stop rendering rows if we’d overflow
    if (rowY + rowH > bottomSafe) {
      const remaining = rows.length - i;
      doc.font("Helvetica-Oblique").fontSize(9).fill("#6B7280").text(
        `(+${remaining} more item${remaining > 1 ? "s" : ""} not shown to keep single-page layout)`,
        tableX + 8,
        rowY + 6,
        { width: tableW - 16 }
      );
      rowY += rowH;
      break;
    }

    if (i % 2 === 1) {
      doc.rect(tableX, rowY, tableW, rowH).fill("#FAFAFA");
      doc.fill("#111827");
    }

    x = tableX + 8;
    const cells = [
      { v: r.description, w: cols[0].w, align: cols[0].align },
      { v: r.qty.toLocaleString(), w: cols[1].w, align: cols[1].align },
      { v: money(r.unitEx), w: cols[2].w, align: cols[2].align },
      { v: money(r.net), w: cols[3].w, align: cols[3].align },
      { v: VAT_ENABLED ? `${r.vatRatePct.toFixed(0)}%` : "—", w: cols[4].w, align: cols[4].align },
      { v: VAT_ENABLED ? money(r.vat) : money(0), w: cols[5].w, align: cols[5].align },
      { v: money(r.gross), w: cols[6].w, align: cols[6].align },
    ] as const;

    cells.forEach((c) => {
      const tx = c.align === "right" ? x + c.w - 8 : x;
      doc.text(String(c.v), tx, rowY + 6, { width: c.w - 16, align: c.align });
      x += c.w;
    });

    // row border
    doc.rect(tableX, rowY, tableW, rowH).strokeColor("#E5E7EB").stroke();
    rowY += rowH;
  }

  /* ======== Totals block (right aligned) ======== */
  rowY += 10;
  const totalsW = cols.slice(-3).reduce((acc, c) => acc + c.w, 0);
  const totalsX = tableX + tableW - totalsW;

  const totals = [
    { label: "Subtotal (Net)", value: money(netTotal), bold: false },
    { label: "VAT", value: money(vatTotal), bold: false },
    { label: "Total", value: money(grandTotal), bold: true },
  ];

  totals.forEach((t, idx) => {
    const h = 22;
    doc
      .rect(totalsX, rowY, totalsW, h)
      .fill(idx === totals.length - 1 ? "#F3F4F6" : "#FFFFFF")
      .strokeColor("#E5E7EB")
      .stroke();

    doc.fill("#111827").font(t.bold ? "Helvetica-Bold" : "Helvetica");
    doc.text(t.label, totalsX + 12, rowY + 6, { width: totalsW / 2 - 12, align: "left" });
    doc.text(t.value, totalsX + totalsW / 2, rowY + 6, { width: totalsW / 2 - 12, align: "right" });

    rowY += h;
  });

  /* ======== Notes (optional) ======== */
  if (payload.meta?.notes) {
    rowY += 14;
    doc.font("Helvetica-Bold").fontSize(10).fill("#111827").text("Notes", tableX, rowY);
    doc.font("Helvetica").fill("#374151");
    doc.text(payload.meta.notes, tableX, rowY + 16, { width: tableW });
    doc.fill("#111827");
  }

  /* ======== Footer (fixed position, no page break) ======== */
  doc
    .font("Helvetica")
    .fontSize(9)
    .fill("#6B7280")
    .text(
      `${companyName} — Registered in England & Wales${companyNo ? " • Company No " + companyNo : ""}${
        companyVat ? " • VAT No " + companyVat : ""
      }`,
      MARGIN,
      pageH - 40,
      { width: pageW - MARGIN * 2, align: "center" }
    );

  doc.end();
  await done;

  return {
    pdfBuffer: Buffer.concat(chunks),
    filename: `${invNo}.pdf`,
    total: grandTotal,
  };
}
