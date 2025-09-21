// src/lib/invoice-pdf.ts
// src/lib/invoice-pdf.ts
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

/** What the API passes in */
export type LineItem = {
  description: string;
  quantity: number; // litres
  unitPrice: number; // price per litre in major units (1.71 = £1.71)
  vatRate?: number; // e.g. 0, 5, 20
};

export type InvoicePayload = {
  customer: {
    name?: string | null;
    email: string;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    postcode?: string | null;
  };
  items: LineItem[];
  currency: string; // "GBP" | "EUR" | "USD"...
  meta?: {
    invoiceNumber?: string;
    orderId?: string;
    notes?: string;
    vatNumber?: string | null; // optional customer VAT number
  };
};

export type BuiltInvoice = {
  pdfBuffer: Buffer;
  filename: string;
  total: number;
};

const A4_WIDTH = 595.28;  // points
const A4_HEIGHT = 841.89; // points
const MARGIN = 40;

function sym(c: string) {
  const u = (c || "").toUpperCase();
  if (u === "GBP") return "£";
  if (u === "EUR") return "€";
  if (u === "USD") return "$";
  return "";
}

/**
 * Builds a single-page professional invoice.
 * Tight column widths prevent overlap and auto-wrap keeps everything tidy.
 */
export async function buildInvoicePdf(payload: InvoicePayload): Promise<BuiltInvoice> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    autoFirstPage: true,
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<void>((resolve) => doc.on("end", () => resolve()));

  // ------- Brand + header bar -------
  const brand = process.env.COMPANY_NAME || "FuelFlow";
  const headerH = 44;
  doc.save();
  doc.rect(0, 0, A4_WIDTH, headerH).fill("#0f1629"); // dark blue header

  // Logo (if present)
  try {
    const logoPath = path.join(process.cwd(), "public", "logo-email.png");
    if (fs.existsSync(logoPath)) {
      // draw light logo on the dark bar (y centered in header)
      doc.image(logoPath, MARGIN, 10, { width: 120, height: 24, align: "left" });
    } else {
      doc
        .fontSize(18)
        .fillColor("#ffffff")
        .text(brand, MARGIN, 12, { width: 300, height: headerH - 12, align: "left" });
    }
  } catch {
    doc
      .fontSize(18)
      .fillColor("#ffffff")
      .text(brand, MARGIN, 12, { width: 300, height: headerH - 12, align: "left" });
  }

  doc
    .fontSize(10)
    .fillColor("#ffffff")
    .text("TAX INVOICE", A4_WIDTH - MARGIN - 120, 14, { width: 120, align: "right" });
  doc.restore();

  let y = headerH + 16;

  // ------- Seller / Buyer blocks -------
  const companyAddress =
    process.env.COMPANY_ADDRESS ||
    "1 Example Street\nExample Town\nEX1 2MP\nUnited Kingdom";
  const companyEmail = (process.env.MAIL_FROM || "invoices@mail.fuelflow.co.uk").replace(
    /^.*</,
    ""
  ).replace(/>$/, "");
  const companyPhone = process.env.COMPANY_PHONE || "+44 (0)20 1234 5678";
  const companyReg = process.env.COMPANY_REG || "12345678";
  const companyVat = process.env.COMPANY_VAT || "GB123456789";

  const leftColX = MARGIN;
  const rightColX = A4_WIDTH / 2;
  const colW = A4_WIDTH / 2 - MARGIN;

  doc.fontSize(9).fillColor("#5f6b7a");
  doc.text("From", leftColX, y);
  doc.text("Bill To", rightColX, y);
  y += 12;

  doc.fillColor("#0f1629").fontSize(10);
  // left – seller details with width to wrap correctly
  doc.text(brand, leftColX, y, { width: colW });
  doc.text(companyAddress, { width: colW });
  doc.text(`Email: ${companyEmail}`, { width: colW });
  doc.text(`Tel: ${companyPhone}`, { width: colW });
  doc.text(`Company No: ${companyReg}`, { width: colW });
  if (companyVat) doc.text(`VAT No: ${companyVat}`, { width: colW });

  // right – buyer details
  const buyerLines = [
    payload.customer.name || "",
    payload.customer.email,
    payload.customer.address_line1 || "",
    payload.customer.address_line2 || "",
    [payload.customer.city, payload.customer.postcode].filter(Boolean).join(" "),
    payload.meta?.vatNumber ? `VAT No: ${payload.meta.vatNumber}` : "",
  ].filter(Boolean);

  // ensure right column prints starting at same y
  const rightStartY = headerH + 28;
  doc.text(buyerLines.join("\n"), rightColX, rightStartY, { width: colW });

  // invoice meta (right column, under buyer)
  const invNo = payload.meta?.invoiceNumber || `INV-${Math.floor(Date.now() / 1000)}`;
  const dateStr = new Date().toLocaleDateString("en-GB");
  const metaY = rightStartY + 72;
  doc.fillColor("#5f6b7a").text("Date:", rightColX, metaY, { width: 100 });
  doc.fillColor("#0f1629").text(dateStr, rightColX + 40, metaY, { width: colW - 40 });
  doc.fillColor("#5f6b7a").text("Invoice #:", rightColX, metaY + 14, { width: 100 });
  doc.fillColor("#0f1629").text(invNo, rightColX + 60, metaY + 14, { width: colW - 60 });
  if (payload.meta?.orderId) {
    doc.fillColor("#5f6b7a").text("Order:", rightColX, metaY + 28, { width: 100 });
    doc.fillColor("#0f1629").text(String(payload.meta.orderId), rightColX + 40, metaY + 28, {
      width: colW - 40,
    });
  }

  // horizontal rule
  y = Math.max(
    doc.y + 10,
    metaY + 44
  );
  doc
    .moveTo(MARGIN, y)
    .lineTo(A4_WIDTH - MARGIN, y)
    .lineWidth(0.5)
    .strokeColor("#e7ecf3")
    .stroke();
  y += 12;

  // ------- Items table -------
  const s = sym(payload.currency || "GBP");
  const table = {
    x: MARGIN,
    y,
    w: A4_WIDTH - MARGIN * 2,
    col: {
      desc: 250,
      litres: 60,
      unit: 80,
      net: 80,
      vat: 40,
    },
    rowH: 18,
  };

  // headers
  doc.fillColor("#5f6b7a").fontSize(9);
  doc.text("Description", table.x, table.y, { width: table.col.desc });
  doc.text("Litres", table.x + table.col.desc, table.y, { width: table.col.litres, align: "right" });
  doc.text("Unit (ex-VAT)", table.x + table.col.desc + table.col.litres, table.y, {
    width: table.col.unit,
    align: "right",
  });
  doc.text("Net", table.x + table.col.desc + table.col.litres + table.col.unit, table.y, {
    width: table.col.net,
    align: "right",
  });
  doc.text("VAT %", table.x + table.col.desc + table.col.litres + table.col.unit + table.col.net, table.y, {
    width: table.col.vat,
    align: "right",
  });

  y = table.y + table.rowH;
  doc
    .moveTo(table.x, y - 4)
    .lineTo(table.x + table.w, y - 4)
    .lineWidth(0.5)
    .strokeColor("#e7ecf3")
    .stroke();
  doc.fontSize(10).fillColor("#0f1629");

  let subtotal = 0;
  let totalVat = 0;

  payload.items.forEach((it) => {
    const qty = Number(it.quantity || 0);
    const unit = Number(it.unitPrice || 0);
    const lineNet = qty * unit;
    const vatRate = (it.vatRate ?? 0) / 100;
    const vatAmt = lineNet * vatRate;

    subtotal += lineNet;
    totalVat += vatAmt;

    doc.text(it.description, table.x, y, { width: table.col.desc });
    doc.text(qty.toString(), table.x + table.col.desc, y, {
      width: table.col.litres,
      align: "right",
    });
    doc.text(`${s}${unit.toFixed(2)}`, table.x + table.col.desc + table.col.litres, y, {
      width: table.col.unit,
      align: "right",
    });
    doc.text(`${s}${lineNet.toFixed(2)}`, table.x + table.col.desc + table.col.litres + table.col.unit, y, {
      width: table.col.net,
      align: "right",
    });
    doc.text(`${(it.vatRate ?? 0).toFixed(0)}%`, table.x + table.col.desc + table.col.litres + table.col.unit + table.col.net, y, {
      width: table.col.vat,
      align: "right",
    });

    y += table.rowH;
  });

  // Totals box (right side)
  y += 6;
  const totalsX = table.x + table.w - (table.col.net + table.col.vat + table.col.unit);
  const lineGap = 14;

  const drawKV = (label: string, value: string) => {
    doc.fillColor("#5f6b7a").text(label, totalsX, y, { width: 130, align: "right" });
    doc.fillColor("#0f1629").text(value, totalsX + 140, y, { width: 90, align: "right" });
    y += lineGap;
  };

  drawKV("Subtotal (Net):", `${s}${subtotal.toFixed(2)}`);
  drawKV("VAT:", `${s}${totalVat.toFixed(2)}`);

  doc
    .moveTo(totalsX, y - 6)
    .lineTo(totalsX + 230, y - 6)
    .lineWidth(0.5)
    .strokeColor("#e7ecf3")
    .stroke();

  drawKV("Total:", `${s}${(subtotal + totalVat).toFixed(2)}`);

  // Optional notes
  if (payload.meta?.notes) {
    y += 6;
    doc.fillColor("#5f6b7a").fontSize(9).text("Notes", MARGIN, y);
    y += 10;
    doc.fillColor("#0f1629").fontSize(9).text(payload.meta.notes, MARGIN, y, {
      width: A4_WIDTH - MARGIN * 2,
    });
    y = doc.y + 8;
  }

  // ------- Footer (always on same page, centered) -------
  const footer = `${brand} — Registered in England & Wales • Company No ${companyReg}` +
    (companyVat ? ` • VAT No ${companyVat}` : "");
  doc
    .fontSize(8)
    .fillColor("#7b8794")
    .text(footer, MARGIN, A4_HEIGHT - MARGIN - 10, {
      width: A4_WIDTH - MARGIN * 2,
      align: "center",
    });

  // Finish
  doc.end();
  await done;

  const pdfBuffer = Buffer.concat(chunks);
  return {
    pdfBuffer,
    filename: `${invNo}.pdf`,
    total: subtotal + totalVat,
  };
}
