// src/lib/refinery-order-pdf.ts
// src/lib/refinery-order-pdf.ts
// Nicely formatted refinery order confirmation PDF – no commission info shown.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type RefineryOrderForPdf = {
  orderId: string;
  refineryRef: string;
  customerName: string | null;
  customerEmail: string | null;
  deliveryAddress: string;
  deliveryDate: string | null;
  product: string;
  litres: number;
  // internal only – we don't show this in the PDF
  unitPriceCustomerGbp: number;
  totalForRefineryGbp: number;
};

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

function fmtMoney(v: number) {
  return gbp.format(v);
}

function fmtDate(dateIso: string | null) {
  if (!dateIso) return "";
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB");
}

export async function buildRefineryOrderPdf(order: RefineryOrderForPdf) {
  const pdfDoc = await PDFDocument.create();

  // A4
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const page = pdfDoc.addPage([pageWidth, pageHeight]);

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const marginX = 48;
  let cursorY = pageHeight - 72;

  /* -----------------------------
     Header bar
     ----------------------------- */
  page.drawRectangle({
    x: 0,
    y: pageHeight - 80,
    width: pageWidth,
    height: 80,
    color: rgb(5 / 255, 8 / 255, 22 / 255),
  });

  page.drawText("FuelFlow", {
    x: marginX,
    y: pageHeight - 52,
    size: 20,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  const headerTitle = "REFINERY ORDER CONFIRMATION";
  const headerTitleWidth = fontBold.widthOfTextAtSize(headerTitle, 12);
  page.drawText(headerTitle, {
    x: pageWidth - marginX - headerTitleWidth,
    y: pageHeight - 50,
    size: 12,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  /* -----------------------------
     Top summary row (3 columns)
     ----------------------------- */

  cursorY = pageHeight - 120;

  const infoLabelSize = 9;
  const infoValueSize = 11;
  const colCount = 3;
  const colWidth = (pageWidth - marginX * 2) / colCount;

const infoCols: { label: string; value: string }[] = [
  { label: "Order ref", value: order.orderId },
  { label: "Refinery ref", value: order.refineryRef },
  { label: "Delivery date", value: fmtDate(order.deliveryDate) || "Not set" },
];

  infoCols.forEach((col, index) => {
    const x = marginX + colWidth * index;
    const labelY = cursorY;
    const valueY = cursorY - 13;

    page.drawText(col.label, {
      x,
      y: labelY,
      size: infoLabelSize,
      font: fontBold,
      color: rgb(0.32, 0.37, 0.45),
    });

    page.drawText(col.value, {
      x,
      y: valueY,
      size: infoValueSize,
      font: fontRegular,
      color: rgb(0.09, 0.1, 0.12),
    });
  });

  /* -----------------------------
     Customer + address
     ----------------------------- */

  cursorY -= 40;

  const fieldLabelSize = 9;
  const fieldValueSize = 11;
  const lineGap = 15;

  function drawField(label: string, value: string) {
    page.drawText(label, {
      x: marginX,
      y: cursorY,
      size: fieldLabelSize,
      font: fontBold,
      color: rgb(0.32, 0.37, 0.45),
    });
    cursorY -= 12;

    const wrapped = wrapText(value || "—", pageWidth - marginX * 2, fontRegular, fieldValueSize);
    wrapped.forEach((line) => {
      page.drawText(line, {
        x: marginX,
        y: cursorY,
        size: fieldValueSize,
        font: fontRegular,
        color: rgb(0.09, 0.1, 0.12),
      });
      cursorY -= 12;
    });

    cursorY -= 8;
  }

  const customerLine =
    (order.customerName || "—") +
    (order.customerEmail ? ` (${order.customerEmail})` : "");

  drawField("Customer", customerLine);
  drawField("Delivery address", order.deliveryAddress);

  /* -----------------------------
     Product table (centered)
     ----------------------------- */

  cursorY -= 6;

  const tableTop = cursorY;
  const rowHeight = 22;
  const headerHeight = 24;
  const tableWidth = pageWidth - marginX * 2;

  const colProductW = tableWidth * 0.5;
  const colLitresW = tableWidth * 0.15;
  const colTotalW = tableWidth - colProductW - colLitresW;

  const tableLeft = marginX;

  // Header background
  page.drawRectangle({
    x: tableLeft,
    y: tableTop - headerHeight,
    width: tableWidth,
    height: headerHeight,
    color: rgb(248 / 255, 249 / 255, 255 / 255),
  });

  page.setLineWidth(0.5);
  page.setDashPattern([], 0);
  page.drawRectangle({
    x: tableLeft,
    y: tableTop - headerHeight - rowHeight,
    width: tableWidth,
    height: headerHeight + rowHeight,
    borderWidth: 0.5,
    borderColor: rgb(226 / 255, 228 / 255, 240 / 255),
  });

  // Column verticals
  const colXProduct = tableLeft;
  const colXLitres = tableLeft + colProductW;
  const colXTotal = tableLeft + colProductW + colLitresW;

  page.drawLine({
    start: { x: colXLitres, y: tableTop - headerHeight - rowHeight },
    end: { x: colXLitres, y: tableTop },
    color: rgb(226 / 255, 228 / 255, 240 / 255),
  });
  page.drawLine({
    start: { x: colXTotal, y: tableTop - headerHeight - rowHeight },
    end: { x: colXTotal, y: tableTop },
    color: rgb(226 / 255, 228 / 255, 240 / 255),
  });

  const headerTextY = tableTop - 8;
  const cellLabelSize = 9;
  const cellValueSize = 11;

  // Header texts
  page.drawText("Product", {
    x: colXProduct + 8,
    y: headerTextY,
    size: cellLabelSize,
    font: fontBold,
    color: rgb(0.29, 0.34, 0.4),
  });

  page.drawText("Litres", {
    x: colXLitres + 8,
    y: headerTextY,
    size: cellLabelSize,
    font: fontBold,
    color: rgb(0.29, 0.34, 0.4),
  });

  const totalHeader = "Total payable to refinery";
  const totalHeaderWidth = fontBold.widthOfTextAtSize(totalHeader, cellLabelSize);
  page.drawText(totalHeader, {
    x: colXTotal + colTotalW - 8 - totalHeaderWidth,
    y: headerTextY,
    size: cellLabelSize,
    font: fontBold,
    color: rgb(0.29, 0.34, 0.4),
  });

  // Data row
  const dataY = tableTop - headerHeight - rowHeight + 7;

  page.drawText(order.product || "Fuel", {
    x: colXProduct + 8,
    y: dataY,
    size: cellValueSize,
    font: fontRegular,
    color: rgb(0.09, 0.1, 0.12),
  });

  page.drawText(String(order.litres ?? 0), {
    x: colXLitres + 8,
    y: dataY,
    size: cellValueSize,
    font: fontRegular,
    color: rgb(0.09, 0.1, 0.12),
  });

  const totalText = fmtMoney(order.totalForRefineryGbp);
  const totalWidth = fontRegular.widthOfTextAtSize(totalText, cellValueSize);
  page.drawText(totalText, {
    x: colXTotal + colTotalW - 8 - totalWidth,
    y: dataY,
    size: cellValueSize,
    font: fontRegular,
    color: rgb(0.09, 0.1, 0.12),
  });

  /* -----------------------------
     Total + note
     ----------------------------- */

  cursorY = tableTop - headerHeight - rowHeight - 40;

  page.drawText("Total payable to refinery", {
    x: marginX,
    y: cursorY,
    size: 10,
    font: fontBold,
    color: rgb(0.09, 0.1, 0.12),
  });

  const sumText = fmtMoney(order.totalForRefineryGbp);
  const sumWidth = fontBold.widthOfTextAtSize(sumText, 10);
  page.drawText(sumText, {
    x: marginX + 200 - sumWidth,
    y: cursorY,
    size: 10,
    font: fontBold,
    color: rgb(0.09, 0.1, 0.12),
  });

  cursorY -= 26;

  const note =
    "This order has already been paid in full by the customer via FuelFlow. " +
    'Please arrange delivery and invoice FuelFlow for the "Total payable to refinery" amount only.';

  const noteLines = wrapText(note, pageWidth - marginX * 2, fontRegular, 9);
  noteLines.forEach((line) => {
    page.drawText(line, {
      x: marginX,
      y: cursorY,
      size: 9,
      font: fontRegular,
      color: rgb(0.25, 0.27, 0.33),
    });
    cursorY -= 11;
  });

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);
  const filename = `refinery-order-${order.orderId}.pdf`;

  return { pdfBuffer, filename };
}

/**
 * Very small word-wrap helper for the PDF.
 */
function wrapText(
  text: string,
  maxWidth: number,
  font: any,
  size: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const testLine = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(testLine, size);
    if (width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = testLine;
    }
  }
  if (current) lines.push(current);
  return lines;
}
