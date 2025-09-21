// src/lib/invoice-pdf.ts
import PDFDocument from "pdfkit";

/* -------------------------------------------------------------------------- */
/* Types your service already uses                                            */
/* -------------------------------------------------------------------------- */

export type LineItemLike = {
  description: string;
  quantity: number;      // e.g. litres
  unitPrice: number;     // major units, ex-VAT (e.g. 1.71 for £1.71)
  vatRate?: number;      // optional, % e.g. 20; falls back to order.vatRate or 0
};

export type CustomerLike = {
  name?: string | null;
  email?: string | null;
  company?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  postcode?: string | null;
};

export type OrderLike = {
  invoiceNumber?: string;
  orderId?: string;
  issueDate?: string | Date;

  currency?: string;          // "GBP" | "EUR" | "USD" ...
  vatRate?: number;           // default VAT% for all lines if not set on item
  items?: LineItemLike[];
  customer?: CustomerLike;
  meta?: { notes?: string } | null;
};

export type BuiltInvoice = {
  pdfBuffer: Buffer;
  filename: string;
  total: number;              // gross total in major units
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const THEME = {
  brand: "#0f172a",    // deep navy
  text: "#111111",
  muted: "#666666",
  border: "#e5e7eb",
  headerText: "#ffffff",
  tableHeadBg: "#f8fafc",
};

function currencySymbol(cur?: string): string {
  const c = (cur || "").toUpperCase();
  if (c === "GBP") return "£";
  if (c === "EUR") return "€";
  if (c === "USD") return "$";
  return "";
}

function dateText(d?: string | Date) {
  const date = d ? new Date(d) : new Date();
  return date.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function fmt(n: number) {
  return n.toFixed(2);
}

/* -------------------------------------------------------------------------- */
/* Main builder                                                               */
/* -------------------------------------------------------------------------- */

export async function buildInvoicePdf(order: OrderLike): Promise<BuiltInvoice> {
  /* ------- Identity / contact pulled from env (all optional but nice) ------ */
  const COMPANY = process.env.COMPANY_NAME || "FuelFlow";
  const COMPANY_ADDR =
    process.env.COMPANY_ADDRESS ||
    "1 Example Street\nExample Town\nEX1 2MP\nUnited Kingdom";
  const COMPANY_PHONE = process.env.COMPANY_PHONE || "";
  const COMPANY_EMAIL = process.env.MAIL_FROM || process.env.COMPANY_EMAIL || "";
  const COMPANY_VAT = process.env.COMPANY_VAT || "";
  const COMPANY_REG = process.env.COMPANY_REG || "";

  // Payment details (optional)
  const BANK_NAME = process.env.COMPANY_BANK_NAME || "";
  const BANK_SORT = process.env.COMPANY_BANK_SORT || "";
  const BANK_ACC  = process.env.COMPANY_BANK_ACC  || "";
  const BANK_IBAN = process.env.COMPANY_IBAN || "";
  const BANK_SWIFT = process.env.COMPANY_SWIFT || "";

  const currency = (order.currency || "GBP").toUpperCase();
  const sym = currencySymbol(currency);

  const invoiceNumber =
    order.invoiceNumber || `INV-${Math.floor(Date.now() / 1000)}`;
  const issueDate = dateText(order.issueDate);

  const items: LineItemLike[] = Array.isArray(order.items) ? order.items : [];
  const customer: CustomerLike = order.customer ?? {};
  const defaultVat = Number.isFinite(order.vatRate) ? Number(order.vatRate) : 0;

  /* -------------------------------- PDF init ------------------------------- */
  const doc = new PDFDocument({
    size: "A4",
    margin: 56, // 56 ≈ 2cm; gives breathing room and prevents accidental page-overflow
    info: {
      Title: `${COMPANY} – Invoice ${invoiceNumber}`,
      Author: COMPANY,
      Creator: COMPANY,
    },
  });

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const M = doc.page.margins;       // {top,right,bottom,left}
  const CONTENT_RIGHT = pageW - M.right;
  const BOTTOM = pageH - M.bottom;

  // Collect output
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c as Buffer));
  const finished = new Promise<void>((r) => doc.on("end", r));

  /* ------------------------------ page helpers ----------------------------- */
  function ensureSpace(h: number) {
    if (doc.y + h <= BOTTOM - 24) return; // keep a small breathing space
    doc.addPage();
    drawHeaderBand();
    drawHeaderMeta(); // re-draw meta on new page to keep consistency
    drawTableHeader(); // in case we were in the middle of the table
  }

  /* ------------------------------- Header band ----------------------------- */
  function drawHeaderBand() {
    doc.save();
    doc.rect(0, 0, pageW, 56).fill(THEME.brand);
    doc.fillColor(THEME.headerText).fontSize(18).text(COMPANY, M.left, 18);
    doc
      .fontSize(10)
      .fillColor(THEME.headerText)
      .text("TAX INVOICE", CONTENT_RIGHT - 90, 22, { width: 90, align: "right" });
    doc.restore();
    doc.moveDown(1);
  }

  /* ----------------------------- From / Bill To ---------------------------- */
  function drawHeaderMeta() {
    const startY = 72; // below the dark band
    doc.y = startY;

    const colGap = 24;
    const colW = (CONTENT_RIGHT - M.left - colGap) / 2;

    // FROM
    doc.fillColor(THEME.text).fontSize(11).text("From", M.left, doc.y);
    doc
      .moveDown(0.2)
      .fontSize(10)
      .fillColor(THEME.muted)
      .text(
        [
          COMPANY,
          COMPANY_ADDR,
          COMPANY_EMAIL ? `Email: ${COMPANY_EMAIL}` : "",
          COMPANY_PHONE ? `Tel: ${COMPANY_PHONE}` : "",
          COMPANY_REG ? `Company No: ${COMPANY_REG}` : "",
          COMPANY_VAT ? `VAT No: ${COMPANY_VAT}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        M.left,
        undefined,
        { width: colW }
      );

    // BILL TO
    doc.fillColor(THEME.text).fontSize(11).text("Bill To", M.left + colW + colGap, startY);
    doc
      .moveDown(0.2)
      .fontSize(10)
      .fillColor(THEME.muted)
      .text(
        [
          customer.company || "",
          customer.name || "",
          customer.email ? `Email: ${customer.email}` : "",
          customer.address_line1 || "",
          customer.address_line2 || "",
          [customer.city, customer.postcode].filter(Boolean).join(" "),
        ]
          .filter(Boolean)
          .join("\n"),
        M.left + colW + colGap,
        undefined,
        { width: colW }
      );

    // Date + Invoice
    const metaX = M.left + colW + colGap;
    const metaY = Math.min(doc.y, startY + 60); // align around the same block

    doc
      .fillColor(THEME.text)
      .fontSize(10)
      .text(`Date: ${issueDate}`, metaX, metaY + 4, { width: colW, align: "right" })
      .text(`Invoice: ${invoiceNumber}`, metaX, undefined, { width: colW, align: "right" });

    doc.moveDown(1);
    doc.y += 8; // little spacing before table
  }

  /* --------------------------------- Table -------------------------------- */
  const table = {
    col1: M.left,            // Description
    col2: CONTENT_RIGHT - 210, // Litres
    col3: CONTENT_RIGHT - 150, // Unit (ex-VAT)
    col4: CONTENT_RIGHT - 90,  // VAT %
    col5: CONTENT_RIGHT - 0,   // Line (ex-VAT)
    rowH: 18,
  };

  function drawTableHeader() {
    const y = doc.y;
    doc.save();

    // Head background
    doc.rect(M.left, y, CONTENT_RIGHT - M.left, 22).fill(THEME.tableHeadBg);

    doc
      .fillColor(THEME.text)
      .fontSize(10)
      .text("Description", table.col1 + 6, y + 6)
      .text("Litres", table.col2, y + 6, { width: 60, align: "right" })
      .text("Unit (ex-VAT)", table.col3, y + 6, { width: 60, align: "right" })
      .text("VAT %", table.col4, y + 6, { width: 60, align: "right" })
      .text("Line (ex-VAT)", table.col5 - 60, y + 6, { width: 60, align: "right" });

    doc.restore();

    // Divider
    doc
      .strokeColor(THEME.border)
      .moveTo(M.left, y + 22)
      .lineTo(CONTENT_RIGHT, y + 22)
      .stroke();

    doc.y = y + 26;
  }

  function drawItemRow(it: LineItemLike) {
    const vat = Number.isFinite(it.vatRate) ? Number(it.vatRate) : defaultVat;
    const qty = Number(it.quantity || 0);
    const unit = Number(it.unitPrice || 0);
    const lineNet = qty * unit;

    ensureSpace(table.rowH + 10);

    const y = doc.y;
    doc
      .fontSize(10)
      .fillColor(THEME.text)
      .text(it.description, table.col1 + 6, y, { width: table.col2 - table.col1 - 12 })
      .text(qty.toString(), table.col2, y, { width: 60, align: "right" })
      .text(`${sym}${fmt(unit)}`, table.col3, y, { width: 60, align: "right" })
      .text(`${fmt(vat)}%`, table.col4, y, { width: 60, align: "right" })
      .text(`${sym}${fmt(lineNet)}`, table.col5 - 60, y, { width: 60, align: "right" });

    doc
      .strokeColor(THEME.border)
      .moveTo(M.left, y + table.rowH - 2)
      .lineTo(CONTENT_RIGHT, y + table.rowH - 2)
      .stroke();

    doc.y = y + table.rowH;
  }

  /* ---------------------------- Compute totals ---------------------------- */
  let net = 0;
  let vatAmt = 0;

  items.forEach((it) => {
    const vat = Number.isFinite(it.vatRate) ? Number(it.vatRate) : defaultVat;
    const qty = Number(it.quantity || 0);
    const unit = Number(it.unitPrice || 0);
    const lineNet = qty * unit;
    net += lineNet;
    vatAmt += (lineNet * vat) / 100;
  });

  const gross = net + vatAmt;

  /* --------------------------------- Draw --------------------------------- */
  drawHeaderBand();
  drawHeaderMeta();
  drawTableHeader();
  items.forEach(drawItemRow);

  // Totals panel (right aligned)
  ensureSpace(120);
  const totalsX = CONTENT_RIGHT - 220;
  const labelW = 100;
  const valueW = 120;

  doc.moveDown(0.4);
  doc
    .fontSize(10)
    .fillColor(THEME.text)
    .text("Subtotal (Net)", totalsX, doc.y, { width: labelW, align: "right", continued: true })
    .text(`${sym}${fmt(net)}`, totalsX + labelW, doc.y, { width: valueW, align: "right" });

  doc
    .fontSize(10)
    .fillColor(THEME.text)
    .text("VAT", totalsX, doc.y + 4, { width: labelW, align: "right", continued: true })
    .text(`${sym}${fmt(vatAmt)}`, totalsX + labelW, doc.y, { width: valueW, align: "right" });

  // Total with strong emphasis
  doc
    .fontSize(11)
    .fillColor(THEME.text)
    .text("Total", totalsX, doc.y + 8, { width: labelW, align: "right", continued: true })
    .text(`${sym}${fmt(gross)}`, totalsX + labelW, doc.y, { width: valueW, align: "right" });

  // Notes / Payment info box
  const showPayment =
    BANK_NAME || BANK_ACC || BANK_SORT || BANK_IBAN || BANK_SWIFT;

  if (order.meta?.notes || showPayment) {
    ensureSpace(120);
    doc.moveDown(1);

    doc.fontSize(11).fillColor(THEME.text).text("Notes & Payment");
    doc.strokeColor(THEME.border).moveTo(M.left, doc.y).lineTo(CONTENT_RIGHT, doc.y).stroke();
    doc.moveDown(0.5);

    if (order.meta?.notes) {
      doc.fontSize(10).fillColor(THEME.muted).text(order.meta.notes);
      doc.moveDown(0.5);
    }

    if (showPayment) {
      const lines = [
        BANK_NAME ? `Bank: ${BANK_NAME}` : "",
        BANK_ACC ? `Account: ${BANK_ACC}` : "",
        BANK_SORT ? `Sort Code: ${BANK_SORT}` : "",
        BANK_IBAN ? `IBAN: ${BANK_IBAN}` : "",
        BANK_SWIFT ? `SWIFT/BIC: ${BANK_SWIFT}` : "",
        `Please reference invoice number ${invoiceNumber}.`,
      ].filter(Boolean);

      doc.fontSize(10).fillColor(THEME.muted).text(lines.join("\n"));
    }
  }

  /* --------------------------------- Footer -------------------------------- */
  function drawFooter() {
    const y = pageH - 40;
    doc
      .strokeColor(THEME.border)
      .moveTo(M.left, y - 10)
      .lineTo(CONTENT_RIGHT, y - 10)
      .stroke();

    const footerLine = [
      COMPANY,
      COMPANY_REG ? `Registered in England & Wales · Company No ${COMPANY_REG}` : "",
      COMPANY_VAT ? `VAT No ${COMPANY_VAT}` : "",
    ]
      .filter(Boolean)
      .join(" · ");

    doc
      .fontSize(9)
      .fillColor(THEME.muted)
      .text(footerLine, M.left, y, { width: CONTENT_RIGHT - M.left, align: "center" });
  }

  // Keep footer on the current page; if we’re too close to the bottom, add a page first
  if (doc.y > BOTTOM - 60) {
    doc.addPage();
    drawHeaderBand();
    drawHeaderMeta();
  }
  drawFooter();

  doc.end();
  await finished;

  const pdfBuffer = Buffer.concat(chunks);
  const filename = `${invoiceNumber}.pdf`;

  return {
    pdfBuffer,
    filename,
    total: Number(gross.toFixed(2)),
  };
}

