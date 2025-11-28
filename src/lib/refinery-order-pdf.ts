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

// Default logo URL – you can override with an env var if you want
const REFINERY_PDF_LOGO_URL =
  process.env.REFINERY_PDF_LOGO_URL ||
  "https://dashboard.fuelflow.co.uk/logo-email.png";

export async function buildRefineryOrderPdf(order: RefineryOrderForPdf) {
  const pdfDoc = await PDFDocument.create();

  // A4
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const page = pdfDoc.addPage([pageWidth, pageHeight]);

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const marginX = 48;
  const headerHeight = 80;
  let cursorY = pageHeight - headerHeight - 32;

  /* -----------------------------
     Header bar + logo + title
     ----------------------------- */

  page.drawRectangle({
    x: 0,
    y: pageHeight - headerHeight,
    width: pageWidth,
    height: headerHeight,
    color: rgb(5 / 255, 8 / 255, 22 / 255), // dark navy
  });

  // Try to draw the logo on the left
  let logoRightEdge = marginX;
  try {
    const res = await fetch(REFINERY_PDF_LOGO_URL);
    if (res.ok) {
      const logoBytes = await res.arrayBuffer();
      const logoImage = await pdfDoc.embedPng(logoBytes);

      // Scale logo to ~28px height
      const targetHeight = 28;
      const scale = targetHeight / logoImage.height;
      const logoWidth = logoImage.width * scale;

      const x = marginX;
      const y = pageHeight - headerHeight / 2 - targetHeight / 2;

      page.drawImage(logoImage, {
        x,
        y,
        width: logoWidth,
        height: targetHeight,
      });

      logoRightEdge = x + logoWidth + 8; // for potential future use
    }
  } catch (e) {
    console.error("Failed to load refinery PDF logo:", e);
  }

  // Title on the right
  const headerTitle = "REFINERY ORDER CONFIRMATION";
  const headerTitleSize = 12;
  const headerTitleWidth = fontBold.widthOfTextAtSize(
    headerTitle,
    headerTitleSize
  );

  page.drawText(headerTitle, {
    x: pageWidth - marginX - headerTitleWidth,
    y: pageHeight - headerHeight / 2 - headerTitleSize / 2,
    size: headerTitleSize,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  /* -----------------------------
     Top summary row (3 columns)
     ----------------------------- */

  const infoLabelSize = 9;
  const infoValueSize = 10;

  const infoCols: { label: string; value: string }[] = [
    { label: "Order ref", value: order.orderId },
    { label: "Refinery ref", value: order.refineryRef },
    {
      label: "Delivery date",
      value: fmtDate(order.deliveryDate) || "Not set",
    },
  ];

  const colCount = infoCols.length;
  const colWidth = (pageWidth - marginX * 2) / colCount;

  infoCols.forEach((col, index) => {
    const x = marginX + colWidth * index;
    const labelY = cursorY;
    const valueStartY = cursorY - 12;

    // Label
    page.drawText(col.label, {
      x,
      y: labelY,
      size: infoLabelSize,
      font: fontBold,
      color: rgb(0.32, 0.37, 0.45),
    });

    // Value – wrap if long so it doesn't overwrite other columns
    const wrapped = wrapText(
      col.value,
      colWidth - 4,
      fontRegular,
      infoValueSize
    );

    wrapped.slice(0, 2).forEach((line, i) => {
      page.drawText(line, {
        x,
        y: valueStartY - i * 11,
        size: infoValueSize,
        font: fontRegular,
        color: rgb(0.09, 0.1, 0.12),
      });
    });
  });

  cursorY -= 40;

  /* -----------------------------
     Customer + address
     ----------------------------- */

  const fieldLabelSize = 9;
  const fieldValueSize = 11;

  function drawField(label: string, value: string) {
    // Label
    page.drawText(label, {
      x: marginX,
      y: cursorY,
      size: fieldLabelSize,
      font: fontBold,
      color: rgb(0.32, 0.37, 0.45),
    });
    cursorY -= 12;

    const wrapped = wrapText(
      value || "—",
      pageWidth - marginX * 2,
      fontRegular,
      fieldValueSize
    );
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
     Product table
     ----------------------------- */

  cursorY -= 6;

  const tableTop = cursorY;
  const rowHeight = 24;
  const headerHeightRow = 24;
  const tableWidth = pageWidth - marginX * 2;
  const tableLeft = marginX;

  const colProductW = tableWidth * 0.5;
  const colLitresW = tableWidth * 0.15;
  const colTotalW = tableWidth - colProductW - colLitresW;

  // Header background
  page.drawRectangle({
    x: tableLeft,
    y: tableTop - headerHeightRow,
    width: tableWidth,
    height: headerHeightRow,
    color: rgb(248 / 255, 249 / 255, 255 / 255),
  });

  // Outer border (header + one row)
  page.drawRectangle({
    x: tableLeft,
    y: tableTop - headerHeightRow - rowHeight,
    width: tableWidth,
    height: headerHeightRow + rowHeight,
    borderWidth: 0.5,
    borderColor: rgb(226 / 255, 228 / 255, 240 / 255),
  });

  // Column x positions
  const colXProduct = tableLeft;
  const colXLitres = tableLeft + colProductW;
  const colXTotal = tableLeft + colProductW + colLitresW;

  // Vertical lines between columns
  page.drawLine({
    start: { x: colXLitres, y: tableTop - headerHeightRow - rowHeight },
    end: { x: colXLitres, y: tableTop },
    thickness: 0.5,
    color: rgb(226 / 255, 228 / 255, 240 / 255),
  });

  page.drawLine({
    start: { x: colXTotal, y: tableTop - headerHeightRow - rowHeight },
    end: { x: colXTotal, y: tableTop },
    thickness: 0.5,
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
  const totalHeaderWidth = fontBold.widthOfTextAtSize(
    totalHeader,
    cellLabelSize
  );
  page.drawText(totalHeader, {
    x: colXTotal + colTotalW - 8 - totalHeaderWidth,
    y: headerTextY,
    size: cellLabelSize,
    font: fontBold,
    color: rgb(0.29, 0.34, 0.4),
  });

  // Data row
  const dataY = tableTop - headerHeightRow - rowHeight + 7;

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

  cursorY = tableTop - headerHeightRow - rowHeight - 40;

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

  const noteLines = wrapText(
    note,
    pageWidth - marginX * 2,
    fontRegular,
    9
  );
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
