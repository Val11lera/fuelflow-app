// src/lib/refinery-order-pdf.ts
// src/lib/refinery-order-pdf.ts
// Nicely formatted refinery order confirmation PDF – no commission info shown.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type RefineryOrderForPdf = {
  orderId: string;
  refineryRef: string;
  customerName: string | null;
  customerEmail: string | null;
  deliveryAddress: string; // already nicely formatted, we'll still wrap it
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
  if (!dateIso) return "Not set";
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return "Not set";
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

  const marginX = 60;

  /* -----------------------------
     Header bar with logo + title
     ----------------------------- */

  const headerHeight = 80;
  const headerY = pageHeight - headerHeight;

  // Dark bar
  page.drawRectangle({
    x: 0,
    y: headerY,
    width: pageWidth,
    height: headerHeight,
    color: rgb(5 / 255, 8 / 255, 22 / 255),
  });

  // Logo image (from your email logo asset)
  const logoUrl = "https://dashboard.fuelflow.co.uk/logo-email.png";
  const logoBytes = await fetch(logoUrl).then((r) => r.arrayBuffer());
  const logoImage = await pdfDoc.embedPng(logoBytes);
  const logoDims = logoImage.scale(0.18); // scale down to a nice size

  const logoX = marginX;
  const logoY = headerY + (headerHeight - logoDims.height) / 2;

  page.drawImage(logoImage, {
    x: logoX,
    y: logoY,
    width: logoDims.width,
    height: logoDims.height,
  });

  // Header title on the right, vertically centred with the bar
  const headerTitle = "REFINERY ORDER CONFIRMATION";
  const headerFontSize = 14;
  const headerTitleWidth = fontBold.widthOfTextAtSize(
    headerTitle,
    headerFontSize
  );
  const headerTitleX = pageWidth - marginX - headerTitleWidth;
  const headerTitleY =
    headerY + (headerHeight - headerFontSize) / 2 + 2; // +2 for optical centring

  page.drawText(headerTitle, {
    x: headerTitleX,
    y: headerTitleY,
    size: headerFontSize,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  /* -----------------------------
     Intro heading + paragraph
     ----------------------------- */

  let cursorY = headerY - 40;

  const titleSize = 18;
  page.drawText("New FuelFlow order", {
    x: marginX,
    y: cursorY,
    size: titleSize,
    font: fontBold,
    color: rgb(0.09, 0.1, 0.12),
  });

  cursorY -= 26;

  // IMPORTANT: no mention of commission here
  const intro =
    "Please find the order details below. All totals shown are the amounts payable to the refinery.";

  const introLines = wrapText(intro, pageWidth - marginX * 2, fontRegular, 11);
  introLines.forEach((line) => {
    page.drawText(line, {
      x: marginX,
      y: cursorY,
      size: 11,
      font: fontRegular,
      color: rgb(0.18, 0.2, 0.25),
    });
    cursorY -= 14;
  });

  /* -----------------------------
     Product summary table
     ----------------------------- */

  cursorY -= 24;

  const tableTop = cursorY;
  const headerHeightTable = 24;
  const rowHeight = 24;
  const tableWidth = pageWidth - marginX * 2;
  const tableLeft = marginX;

  const colProductW = tableWidth * 0.35;
  const colLitresW = tableWidth * 0.15;
  const colDeliveryW = tableWidth * 0.25;
  const colTotalW =
    tableWidth - colProductW - colLitresW - colDeliveryW;

  const colXProduct = tableLeft;
  const colXLitres = colXProduct + colProductW;
  const colXDelivery = colXLitres + colLitresW;
  const colXTotal = colXDelivery + colDeliveryW;

  // Header background
  page.drawRectangle({
    x: tableLeft,
    y: tableTop - headerHeightTable,
    width: tableWidth,
    height: headerHeightTable,
    color: rgb(248 / 255, 249 / 255, 255 / 255),
  });

  // Outer border
  page.drawRectangle({
    x: tableLeft,
    y: tableTop - headerHeightTable - rowHeight,
    width: tableWidth,
    height: headerHeightTable + rowHeight,
    borderWidth: 0.5,
    borderColor: rgb(226 / 255, 228 / 255, 240 / 255),
  });

  // Column lines
  page.drawLine({
    start: { x: colXLitres, y: tableTop - headerHeightTable - rowHeight },
    end: { x: colXLitres, y: tableTop },
    color: rgb(226 / 255, 228 / 255, 240 / 255),
  });
  page.drawLine({
    start: { x: colXDelivery, y: tableTop - headerHeightTable - rowHeight },
    end: { x: colXDelivery, y: tableTop },
    color: rgb(226 / 255, 228 / 255, 240 / 255),
  });
  page.drawLine({
    start: { x: colXTotal, y: tableTop - headerHeightTable - rowHeight },
    end: { x: colXTotal, y: tableTop },
    color: rgb(226 / 255, 228 / 255, 240 / 255),
  });

  const cellLabelSize = 9;
  const cellValueSize = 11;
  const headerTextY = tableTop - 8;

  // Header labels
  page.drawText("PRODUCT", {
    x: colXProduct + 8,
    y: headerTextY,
    size: cellLabelSize,
    font: fontBold,
    color: rgb(0.29, 0.34, 0.4),
  });
  page.drawText("LITRES", {
    x: colXLitres + 8,
    y: headerTextY,
    size: cellLabelSize,
    font: fontBold,
    color: rgb(0.29, 0.34, 0.4),
  });
  page.drawText("DELIVERY DATE", {
    x: colXDelivery + 8,
    y: headerTextY,
    size: cellLabelSize,
    font: fontBold,
    color: rgb(0.29, 0.34, 0.4),
  });

  const totalHeader = "TOTAL PAYABLE TO REFINERY";
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
  const dataY = tableTop - headerHeightTable - rowHeight + 7;

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

  page.drawText(fmtDate(order.deliveryDate), {
    x: colXDelivery + 8,
    y: dataY,
    size: cellValueSize,
    font: fontRegular,
    color: rgb(0.09, 0.1, 0.12),
  });

  const totalText = fmtMoney(order.totalForRefineryGbp);
  const totalWidth = fontRegular.widthOfTextAtSize(
    totalText,
    cellValueSize
  );
  page.drawText(totalText, {
    x: colXTotal + colTotalW - 8 - totalWidth,
    y: dataY,
    size: cellValueSize,
    font: fontRegular,
    color: rgb(0.09, 0.1, 0.12),
  });

  /* -----------------------------
     Order meta + customer block
     ----------------------------- */

  cursorY = tableTop - headerHeightTable - rowHeight - 32;

  const metaLabelSize = 9;
  const metaValueSize = 11;

  const drawMetaField = (label: string, value: string) => {
    page.drawText(label, {
      x: marginX,
      y: cursorY,
      size: metaLabelSize,
      font: fontBold,
      color: rgb(0.32, 0.37, 0.45),
    });
    cursorY -= 12;

    const lines = wrapText(
      value || "—",
      pageWidth - marginX * 2,
      fontRegular,
      metaValueSize
    );
    lines.forEach((line) => {
      page.drawText(line, {
        x: marginX,
        y: cursorY,
        size: metaValueSize,
        font: fontRegular,
        color: rgb(0.09, 0.1, 0.12),
      });
      cursorY -= 13;
    });

    cursorY -= 6;
  };

  drawMetaField("Order reference", order.orderId);
  drawMetaField("Refinery reference", order.refineryRef);

  const customerLine =
    (order.customerName || "—") +
    (order.customerEmail ? ` (${order.customerEmail})` : "");
  drawMetaField("Customer", customerLine);
  drawMetaField("Delivery address", order.deliveryAddress);

  /* -----------------------------
     Total + note
     ----------------------------- */

  cursorY -= 6;

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
