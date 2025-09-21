// src/lib/invoice-pdf.ts// src/lib/invoice-pdf.ts
import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

export type LineItem = {
  description: string;
  litres: number;
  unitPrice: number;      // major units
  vatRate?: number;       // 0 | 5 | 20 …
};

export type Party = {
  name?: string | null;
  email?: string | null;
  address?: string | null; // can contain \n or \\n
};

export type InvoiceInput = {
  invoiceNumber: string;
  date?: string | Date;
  currency?: string;       // default GBP
  billTo: Party;
  items: LineItem[];
  company?: {
    name?: string;
    address?: string;      // can contain \n or \\n
    email?: string;
    phone?: string;
    regNo?: string;
    vatNo?: string | null;
  };
  notes?: string | null;
};

// Convert either "\n" or "\\n" into a real newline
const nl = (s?: string | null) => (s ?? "").replace(/\\n|\n/g, "\n");

const fmtDate = (d?: string | Date) =>
  (d ? new Date(d) : new Date()).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

const sym = (cur: string) =>
  ({ GBP: "£", EUR: "€", USD: "$" }[cur.toUpperCase()] ?? "");

export async function buildInvoicePdf(order: InvoiceInput) {
  // Page + layout
  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const MARGIN = 40;
  const GAP = 24;
  const CONTENT_W = PAGE_W - 2 * MARGIN;

  // Use a fixed left column width to avoid any chance of overlap
  const LEFT_W = 260; // ~9.2cm
  const RIGHT_W = CONTENT_W - LEFT_W - GAP;
  const RIGHT_X = MARGIN + LEFT_W + GAP;

  // Company (env defaults)
  const companyName =
    order.company?.name ?? process.env.COMPANY_NAME ?? "FuelFlow";
  const companyAddress = nl(
    order.company?.address ??
      process.env.COMPANY_ADDRESS ??
      "1 Example Street\\nExample Town\\nEX1 2MP\\nUnited Kingdom"
  );
  const companyEmail =
    order.company?.email ??
    process.env.INVOICE_FROM ??
    "invoices@mail.fuelflow.co.uk";
  const companyPhone =
    order.company?.phone ?? process.env.COMPANY_PHONE ?? "+44 (0)20 1234 5678";
  const companyRegNo =
    order.company?.regNo ?? process.env.COMPANY_REG_NO ?? "Company No 12345678";
  const companyVatNo =
    order.company?.vatNo ?? process.env.COMPANY_VAT_NO ?? null;

  const billName = order.billTo.name ?? "";
  const billEmail = order.billTo.email ?? "";
  const billAddr = nl(order.billTo.address ?? "");

  const currency = (order.currency ?? "GBP").toUpperCase();
  const dateStr = fmtDate(order.date);

  // Doc + buffer
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
  });
  const bufs: Buffer[] = [];
  doc.on("data", (c) => bufs.push(c));
  const done = new Promise<void>((r) => doc.on("end", r));

  // --- Header bar (visual fingerprint so you know this file is used) ---
  const BAR_H = 48;
  doc.save().rect(0, 0, PAGE_W, BAR_H).fill("#0C1A2B").restore();
  const logoPath = path.join(process.cwd(), "public", "logo-email.png");
  if (fs.existsSync(logoPath)) {
    try {
      doc.image(logoPath, MARGIN, 10, { height: 28 });
    } catch {}
  }
  doc
    .fillColor("#fff")
    .fontSize(14)
    .text("TAX INVOICE", 0, 16, { width: PAGE_W - MARGIN, align: "right" })
    .fillColor("#000");

  let y = BAR_H + 18;

  // --- Left column: From (company)
  y += label(doc, "From", MARGIN, y);
  y += title(doc, companyName, MARGIN, y);

  const fromText =
    [
      companyAddress,
      `Email: ${companyEmail}`,
      `Tel: ${companyPhone}`,
      companyRegNo,
      companyVatNo ? `VAT No: ${companyVatNo}` : "",
    ]
      .filter(Boolean)
      .join("\n") || "";

  y += block(doc, fromText, MARGIN, y, LEFT_W);

  // --- Right column: Bill To + Date
  let ry = BAR_H + 18;
  ry += label(doc, "Bill To", RIGHT_X, ry);

  const billLines = [
    billName && `Name: ${billName}`,
    billEmail && `Email: ${billEmail}`,
    billAddr,
  ]
    .filter(Boolean)
    .join("\n");

  ry += block(doc, billLines, RIGHT_X, ry, RIGHT_W);
  ry += 6;
  ry += kv(doc, "Date:", dateStr, RIGHT_X, ry, RIGHT_W);

  y = Math.max(y, ry) + 18;

  // --- Table header
  const colDesc = MARGIN;
  const colLitres = colDesc + Math.floor(CONTENT_W * 0.58);
  const colUnit = colLitres + 70;
  const colVat = colUnit + 90;
  headerRow(
    doc,
    ["Description", "Litres", "Unit (ex-VAT)", "VAT %"],
    [colDesc, colLitres, colUnit, colVat],
    y,
    PAGE_W - MARGIN
  );
  y += 26;

  // --- Items
  let net = 0;
  let vat = 0;
  const cSym = sym(currency);

  for (const it of order.items) {
    const qty = +it.litres || 0;
    const unit = +it.unitPrice || 0;
    const rate = +((it.vatRate ?? 0) || 0);
    const lineNet = qty * unit;
    const lineVat = +(lineNet * (rate / 100)).toFixed(2);
    net += lineNet;
    vat += lineVat;

    const h = Math.max(doc.heightOfString(it.description, { width: colLitres - colDesc - 8 }), 12);

    // hard wrap using the same width we measured
    doc.fontSize(10).fillColor("#000");
    doc.text(it.description, colDesc, y, {
      width: colLitres - colDesc - 8,
      lineBreak: true,
      continued: false,
    });
    doc.text(qty.toString(), colLitres, y, { width: 50, align: "right" });
    doc.text(`${cSym}${unit.toFixed(2)}`, colUnit, y, { width: 70, align: "right" });
    doc.text(`${rate.toFixed(0)}%`, colVat, y, { width: 50, align: "right" });

    y += h + 8;
  }

  // --- Totals
  hr(doc, MARGIN, y, PAGE_W - MARGIN);
  y += 10;

  const totalsW = 200;
  const totalsX = PAGE_W - MARGIN - totalsW;
  y = Math.max(y, kv(doc, "Subtotal (Net):", `${cSym}${net.toFixed(2)}`, totalsX, y, totalsW));
  y = Math.max(y, kv(doc, "VAT:", `${cSym}${vat.toFixed(2)}`, totalsX, y, totalsW));
  doc.font("Helvetica-Bold");
  y = Math.max(y, kv(doc, "Total:", `${cSym}${(net + vat).toFixed(2)}`, totalsX, y, totalsW));
  doc.font("Helvetica");

  y += 16;

  // Notes
  const notes = nl(order.notes ?? "");
  if (notes) {
    y += label(doc, "Notes", MARGIN, y);
    y += block(doc, notes, MARGIN, y, CONTENT_W, true);
  }

  // Footer
  const foot = `${companyName} — Registered in England & Wales — ${companyRegNo}${
    companyVatNo ? ` — VAT No ${companyVatNo}` : ""
  }`;
  doc
    .fontSize(8)
    .fillColor("#777")
    .text(foot, MARGIN, PAGE_H - MARGIN - 12, { width: CONTENT_W, align: "center" })
    .fillColor("#000");

  doc.end();
  await done;
  return {
    pdfBuffer: Buffer.concat(bufs),
    filename: `${order.invoiceNumber}.pdf`,
    total: +(net + vat).toFixed(2),
  };

  // ---- helpers ----
  function label(d: any, t: string, x: number, y0: number) {
    d.font("Helvetica-Bold").fontSize(11).fillColor("#0C1A2B").text(t, x, y0);
    d.font("Helvetica").fillColor("#000");
    return 16;
  }
  function title(d: any, t: string, x: number, y0: number) {
    d.font("Helvetica-Bold").fontSize(13).text(t, x, y0);
    d.font("Helvetica").fontSize(10);
    return 16;
  }
  function block(d: any, t: string, x: number, y0: number, w: number, dim = false) {
    d.fontSize(10).fillColor(dim ? "#555" : "#000");
    const h = d.heightOfString(t, { width: w, lineBreak: true });
    d.text(t, x, y0, { width: w, lineBreak: true });
    d.fillColor("#000");
    return h;
  }
  function kv(d: any, k: string, v: string, x: number, y0: number, w: number) {
    const kw = 90;
    d.fontSize(10).fillColor("#555").text(k, x, y0, { width: kw, align: "right" });
    d.fillColor("#000").text(v, x + kw + 8, y0, { width: w - kw - 8, align: "right" });
    return 14;
  }
  function headerRow(d: any, names: string[], xs: number[], y0: number, rightEdge: number) {
    d.save().rect(MARGIN - 2, y0 - 6, rightEdge - (MARGIN - 2), 22).fill("#EEF3F8").restore();
    d.font("Helvetica-Bold").fontSize(10);
    d.text(names[0], xs[0], y0, { width: xs[1] - xs[0] - 8, align: "left" });
    d.text(names[1], xs[1], y0, { width: 50, align: "right" });
    d.text(names[2], xs[2], y0, { width: 70, align: "right" });
    d.text(names[3], xs[3], y0, { width: 50, align: "right" });
    d.font("Helvetica");
  }
  function hr(d: any, x1: number, y0: number, x2: number) {
    d.save().moveTo(x1, y0).lineTo(x2, y0).lineWidth(1).strokeColor("#D6DEE6").stroke().restore();
  }
}

