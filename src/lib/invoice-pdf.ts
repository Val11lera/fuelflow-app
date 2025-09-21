// src/lib/invoice-pdf.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

/** what the builder returns */
export type BuiltInvoice = {
  pdfBuffer: Buffer;
  filename: string;
  total: number;
};

/** Canonical internal shape the renderer uses */
type InvoiceInput = {
  invoiceNumber: string;
  billTo: {
    name?: string | null;
    email?: string | null;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    postcode?: string | null;
  };
  items: Array<{
    description: string;
    litres?: number | null;
    unitPrice: number; // major units (e.g. 1.71)
    vatRate?: number | null; // percent, e.g. 20
  }>;
  currency: string; // "GBP", "EUR", "USD"
  meta?: {
    notes?: string | null;
    orderId?: string | null;
  };
};

/** Legacy/API shape we may receive from your /api/invoices/create route */
type ApiInvoicePayload = {
  customer: {
    name?: string | null;
    email: string;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    postcode?: string | null;
  };
  items: Array<{
    description: string;
    quantity?: number;
    litres?: number; // tolerate both
    unitPrice: number;
    vatRate?: number | null;
  }>;
  currency: string;
  meta?: {
    invoiceNumber?: string;
    orderId?: string;
    notes?: string;
  };
};

// ---------- helpers ----------

const COMPANY_NAME = process.env.COMPANY_NAME || "FuelFlow";
const COMPANY_ADDRESS =
  process.env.COMPANY_ADDRESS ||
  "1 Example Street\nExample Town\nEX1 2MP\nUnited Kingdom";
const COMPANY_EMAIL =
  process.env.COMPANY_EMAIL || "invoices@mail.fuelflow.co.uk";
const COMPANY_PHONE = process.env.COMPANY_PHONE || "+44 (0)20 1234 5678";
const COMPANY_COMPANY_NO = process.env.COMPANY_NUMBER || "12345678";
const COMPANY_VAT_NO = process.env.VAT_NUMBER || "GB123456789";

const BRAND_DARK = "#101827"; // header band
const BRAND_ACCENT = "#0ea5e9"; // thin lines
const GREY = "#6b7280";
const BLACK = "#0b0f16";

function currencySymbol(cur: string) {
  const c = (cur || "").toUpperCase();
  if (c === "GBP") return "£";
  if (c === "EUR") return "€";
  if (c === "USD") return "$";
  return "";
}

function money(n: number, cur: string) {
  const sym = currencySymbol(cur);
  return `${sym}${(isFinite(n) ? n : 0).toFixed(2)}`;
}

function formatDate(d: Date) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function looksLikeLegacy(x: any): x is ApiInvoicePayload {
  return (
    x &&
    typeof x === "object" &&
    x.customer &&
    typeof x.customer.email === "string" &&
    Array.isArray(x.items) &&
    typeof x.currency === "string"
  );
}

function looksLikeInput(x: any): x is InvoiceInput {
  return (
    x &&
    typeof x === "object" &&
    Array.isArray(x.items) &&
    ("billTo" in x || "invoiceNumber" in x)
  );
}

/** Convert legacy/API shape to our internal InvoiceInput */
function legacyToInput(src: ApiInvoicePayload): InvoiceInput {
  const invoiceNumber =
    src.meta?.invoiceNumber || `INV-${Math.floor(Date.now() / 1000)}`;

  return {
    invoiceNumber,
    billTo: {
      name: src.customer?.name ?? null,
      email: src.customer?.email ?? null,
      address_line1: src.customer?.address_line1 ?? null,
      address_line2: src.customer?.address_line2 ?? null,
      city: src.customer?.city ?? null,
      postcode: src.customer?.postcode ?? null,
    },
    items: (src.items || []).map((it) => ({
      description: it.description,
      litres: (it.litres ?? it.quantity) ?? null,
      unitPrice: it.unitPrice,
      vatRate: it.vatRate ?? null,
    })),
    currency: (src.currency || "GBP").toUpperCase(),
    meta: {
      notes: src.meta?.notes ?? null,
      orderId: src.meta?.orderId ?? null,
    },
  };
}

function kv(
  doc: PDFDocument,
  key: string,
  value: string | undefined | null,
  x: number,
  y: number,
  keyWidth = 60,
  valueWidth = 200
) {
  const yy = y;
  doc.fillColor(GREY).fontSize(8).text(key, x, yy, {
    width: keyWidth,
  });
  doc
    .fillColor(BLACK)
    .fontSize(9)
    .text(value || "", x + keyWidth, yy, { width: valueWidth });
}

function rule(doc: PDFDocument, x1: number, y: number, x2: number) {
  doc
    .moveTo(x1, y)
    .lineTo(x2, y)
    .lineWidth(0.7)
    .strokeColor(BRAND_ACCENT)
    .stroke();
}

// ---------- main builder ----------

/**
 * Accepts ANY shape, normalises to `InvoiceInput` and renders.
 * This avoids TS type fights while keeping the layout consistent.
 */
export async function buildInvoicePdf(source: unknown): Promise<BuiltInvoice> {
  const anySrc = source as any;

  // Normalise
  const input: InvoiceInput = looksLikeInput(anySrc)
    ? anySrc
    : legacyToInput(looksLikeLegacy(anySrc) ? anySrc : ({} as ApiInvoicePayload));

  // PDF doc
  const doc = new PDFDocument({
    size: "A4",
    margin: 40,
    bufferPages: false,
    autoFirstPage: true,
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<void>((resolve) => doc.on("end", () => resolve()));

  // Header dark band
  const pageWidth = doc.page.width;
  const MARGIN = 40;
  const bandHeight = 48;

  doc.save();
  doc.rect(0, 0, pageWidth, bandHeight).fill(BRAND_DARK).restore();

  // Logo (optional)
  const logoPath = path.join(process.cwd(), "public", "logo-email.png");
  const hasLogo = fs.existsSync(logoPath);
  if (hasLogo) {
    // NOTE: no 'align' in image options (that caused your previous TS error)
    doc.image(logoPath, MARGIN, 10, { width: 120, height: 24 });
  }

  // Title
  doc
    .fillColor("#ffffff")
    .fontSize(10)
    .text("TAX INVOICE", pageWidth - MARGIN - 120, 18, {
      width: 120,
      align: "right",
    })
    .fillColor(BLACK);

  let y = bandHeight + 12;

  // Seller block + Bill To block
  // Left (From)
  doc
    .fontSize(9)
    .fillColor(GREY)
    .text("From", MARGIN, y)
    .fillColor(BLACK)
    .moveDown(0.3);

  const sellerText = [
    COMPANY_NAME,
    COMPANY_ADDRESS,
    `Email: ${COMPANY_EMAIL}`,
    `Tel: ${COMPANY_PHONE}`,
    `Company No: ${COMPANY_COMPANY_NO}`,
  ].join("\n");

  doc.fontSize(9).text(sellerText, MARGIN, doc.y);

  // Right (Bill To)
  const rightColX = pageWidth / 2 + 10;
  doc
    .fontSize(9)
    .fillColor(GREY)
    .text("Bill To", rightColX, y)
    .fillColor(BLACK)
    .moveDown(0.3);

  const billToLines = [
    input.billTo?.name,
    input.billTo?.email,
    input.billTo?.address_line1,
    input.billTo?.address_line2,
    [input.billTo?.city, input.billTo?.postcode].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join("\n");

  doc.fontSize(9).text(billToLines || "—", rightColX, doc.y);

  // Meta (invoice no / date / order)
  y = Math.max(doc.y, bandHeight + 80) + 6;
  rule(doc, MARGIN, y, pageWidth - MARGIN);
  y += 10;

  kv(doc, "Invoice #", input.invoiceNumber, MARGIN, y);
  kv(doc, "Date", formatDate(new Date()), MARGIN + 200, y);
  if (input.meta?.orderId) {
    kv(doc, "Order Ref", input.meta.orderId, MARGIN + 380, y);
  }
  y += 30;

  // Table header
  const colDesc = MARGIN;
  const colLitres = pageWidth * 0.50;
  const colUnit = pageWidth * 0.66;
  const colLine = pageWidth * 0.83;
  doc
    .fontSize(9)
    .fillColor(GREY)
    .text("Description", colDesc, y)
    .text("Litres", colLitres, y, { width: 60, align: "right" })
    .text("Unit (ex-VAT)", colUnit, y, { width: 80, align: "right" })
    .text("Line", colLine, y, { width: pageWidth - colLine - MARGIN, align: "right" })
    .fillColor(BLACK);
  y += 14;
  rule(doc, MARGIN, y, pageWidth - MARGIN);
  y += 8;

  // Lines
  let subTotal = 0;
  for (const it of input.items) {
    const qty = it.litres ?? null;
    const line = (qty ?? 1) * (it.unitPrice ?? 0);
    subTotal += line;

    doc
      .fontSize(9)
      .text(it.description || "", colDesc, y, {
        width: colLitres - colDesc - 8,
      })
      .text(qty != null ? String(qty) : "—", colLitres, y, {
        width: 60,
        align: "right",
      })
      .text(money(it.unitPrice ?? 0, input.currency), colUnit, y, {
        width: 80,
        align: "right",
      })
      .text(money(line, input.currency), colLine, y, {
        width: pageWidth - colLine - MARGIN,
        align: "right",
      });

    y += 18;

    // If near the bottom, add a page (rare for one line invoices)
    if (y > doc.page.height - 120) {
      doc.addPage();
      y = bandHeight + 12;
    }
  }

  y += 4;
  rule(doc, MARGIN, y, pageWidth - MARGIN);
  y += 8;

  // Totals
  const vatRate =
    input.items.find((i) => typeof i.vatRate === "number")?.vatRate ?? 0;
  const vatAmount = (subTotal * (vatRate || 0)) / 100;
  const grandTotal = subTotal + vatAmount;

  doc
    .fontSize(9)
    .fillColor(GREY)
    .text("Subtotal (Net)", colUnit, y, { width: 120, align: "right" })
    .fillColor(BLACK)
    .text(money(subTotal, input.currency), colLine, y, {
      width: pageWidth - colLine - MARGIN,
      align: "right",
    });
  y += 16;

  doc
    .fontSize(9)
    .fillColor(GREY)
    .text("VAT", colUnit, y, { width: 120, align: "right" })
    .fillColor(BLACK)
    .text(money(vatAmount, input.currency), colLine, y, {
      width: pageWidth - colLine - MARGIN,
      align: "right",
    });
  y += 16;

  doc
    .fontSize(10)
    .fillColor(BLACK)
    .text("Total", colUnit, y, { width: 120, align: "right" })
    .font("Helvetica-Bold")
    .text(money(grandTotal, input.currency), colLine, y, {
      width: pageWidth - colLine - MARGIN,
      align: "right",
    })
    .font("Helvetica");

  y += 24;

  if (input.meta?.notes) {
    rule(doc, MARGIN, y, pageWidth - MARGIN);
    y += 8;
    doc.fillColor(GREY).fontSize(9).text(String(input.meta.notes), MARGIN, y, {
      width: pageWidth - MARGIN * 2,
    });
    y = doc.y + 4;
  }

  // Footer
  const footerY = doc.page.height - 42;
  doc.save();
  rule(doc, MARGIN, footerY - 8, pageWidth - MARGIN);
  doc
    .fontSize(8)
    .fillColor(GREY)
    .text(
      `${COMPANY_NAME} — Registered in England & Wales · Company No ${COMPANY_COMPANY_NO} · VAT No ${COMPANY_VAT_NO}`,
      MARGIN,
      footerY,
      { width: pageWidth - MARGIN * 2, align: "center" }
    )
    .restore();

  doc.end();
  await done;

  const pdfBuffer = Buffer.concat(chunks);
  const filename = `${input.invoiceNumber}.pdf`;
  return { pdfBuffer, filename, total: grandTotal };
}
