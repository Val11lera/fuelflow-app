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
  if (!dateIso) return "Not set";
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return "Not set";
  return d.toLocaleDateString("en-GB");
}

export async function buildRefineryOrderPdf(order: RefineryOrderForPdf) {
  const pdfDoc = await PDFDocument.create();

  // A4 dimensions in points
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const page = pdfDoc.addPage([pageWidth, pageHeight]);

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const marginX = 48;
  let cursorY = pageHeight - 72;

  /* -----------------------------
     Header bar + logo
     ----------------------------- */
    /* -----------------------------
     Header bar + logo
     ----------------------------- */
  const headerHeight = 80;

  page.drawRectangle({
    x: 0,
    y: pageHeight - headerHeight,
    width: pageWidth,
    height: headerHeight,
    color: rgb(5 / 255, 8 / 255, 22 / 255),
  });

  // Try to draw the logo image. If it fails, we just show the title on the right.
  const logoUrl =
    process.env.REFINERY_PDF_LOGO_URL ||
    "https://dashboard.fuelflow.co.uk/logo-email.png";

  try {
    const resp = await fetch(logoUrl);
    const logoBytes = await resp.arrayBuffer();
    const logoImage = await pdfDoc.embedPng(logoBytes);

    // Bigger logo
    const targetHeight = 45; // <– increase this if you want it even larger
    const scale = targetHeight / logoImage.height;
    const logoWidth = logoImage.width * scale;

    // Centre vertically inside the header bar
    const headerCenterY = pageHeight - headerHeight / 2;
    const logoY = headerCenterY - targetHeight / 2;
    const logoX = marginX;

    page.drawImage(logoImage, {
      x: logoX,
      y: logoY,
      width: logoWidth,
      height: targetHeight,
    });
  } catch (e) {
    console.error("Failed to load refinery PDF logo:", e);
  }

  const headerTitle = "REFINERY ORDER CONFIRMATION";
  const headerTitleWidth = fontBold.widthOfTextAtSize(headerTitle, 12);

  page.drawText(headerTitle, {
    x: pageWidth - marginX - headerTitleWidth,
    y: pageHeight - headerHeight / 2 - 6, // vertically centred-ish
    size: 12,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  /* -----------------------------
     Title + intro (like the email)
     ----------------------------- */

  cursorY = pageHeight - 120;

  page.drawText("New FuelFlow order", {
    x: marginX,
    y: cursorY,
    size: 18,
    font: fontBold,
    color: rgb(0.09, 0.1, 0.12),
  });

  cursorY -= 24;

  const intro =
    "Please find the order details below. Commission amounts are excluded – " +
    "all totals shown are the amounts payable to the refinery.";
  const introLines = wrapText(intro, pageWidth - marginX * 2, fontRegular, 11);
  introLines.forEach((line) => {
    page.drawText(line, {
      x: marginX,
      y: cursorY,
      size: 11,
      font: fontRegular,
      color: rgb(0.16, 0.17, 0.2),
    });
    cursorY -= 14;
  });

  cursorY -= 18;

  /* -----------------------------
     Summary table (4 columns)
     PRODUCT | LITRES | DELIVERY DATE | TOTAL PAYABLE TO REFINERY
     ----------------------------- */

  const tableTop = cursorY;
  const headerHeight = 26;
  const rowHeight = 26;
  const tableWidth = pageWidth - marginX * 2;
  const tableLeft = marginX;

  const colProductW = tableWidth * 0.3;
  const colLitresW = tableWidth * 0.15;
  const colDateW = tableWidth * 0.25;
  const colTotalW = tableWidth - colProductW - colLitresW - colDateW;

  const colXProduct = tableLeft;
  const colXLitres = colXProduct + colProductW;
  const colXDate = colXLitres + colLitresW;
  const colXTotal = colXDate + colDateW;

  // Outer border (header + one data row)
  page.drawRectangle({
    x: tableLeft,
    y: tableTop - headerHeight - rowHeight,
    width: tableWidth,
    height: headerHeight + rowHeight,
    borderWidth: 0.5,
    borderColor: rgb(226 / 255, 228 / 255, 240 / 255),
  });

  // Header background
  page.drawRectangle({
    x: tableLeft,
    y: tableTop - headerHeight,
    width: tableWidth,
    height: headerHeight,
    color: rgb(248 / 255, 249 / 255, 255 / 255),
  });

  // Vertical column lines
  const colLineYBottom = tableTop - headerHeight - rowHeight;
  const colLineYTop = tableTop;
  [colXLitres, colXDate, colXTotal].forEach((x) => {
    page.drawLine({
      start: { x, y: colLineYBottom },
      end: { x, y: colLineYTop },
      color: rgb(226 / 255, 228 / 255, 240 / 255),
    });
  });

  const cellLabelSize = 9;
  const cellValueSize = 11;
  const headerTextY = tableTop - 9;

  // Header labels
  page.drawText("PRODUCT", {
    x: colXProduct + 10,
    y: headerTextY,
    size: cellLabelSize,
    font: fontBold,
    color: rgb(0.29, 0.34, 0.4),
  });

  page.drawText("LITRES", {
    x: colXLitres + 10,
    y: headerTextY,
    size: cellLabelSize,
    font: fontBold,
    color: rgb(0.29, 0.34, 0.4),
  });

  page.drawText("DELIVERY DATE", {
    x: colXDate + 10,
    y: headerTextY,
    size: cellLabelSize,
    font: fontBold,
    color: rgb(0.29, 0.34, 0.4),
  });

  const totalHeader = "TOTAL PAYABLE TO REFINERY";
  const totalHeaderWidth = fontBold.widthOfTextAtSize(totalHeader, cellLabelSize);
  page.drawText(totalHeader, {
    x: colXTotal + colTotalW - 10 - totalHeaderWidth,
    y: headerTextY,
    size: cellLabelSize,
    font: fontBold,
    color: rgb(0.29, 0.34, 0.4),
  });

  // Data row
  const dataY = tableTop - headerHeight - rowHeight + 9;

  page.drawText(order.product || "Fuel", {
    x: colXProduct + 10,
    y: dataY,
    size: cellValueSize,
    font: fontRegular,
    color: rgb(0.09, 0.1, 0.12),
  });

  page.drawText(String(order.litres ?? 0), {
    x: colXLitres + 10,
    y: dataY,
    size: cellValueSize,
    font: fontRegular,
    color: rgb(0.09, 0.1, 0.12),
  });

  page.drawText(fmtDate(order.deliveryDate), {
    x: colXDate + 10,
    y: dataY,
    size: cellValueSize,
    font: fontRegular,
    color: rgb(0.09, 0.1, 0.12),
  });

  const totalText = fmtMoney(order.totalForRefineryGbp);
  const totalWidth = fontRegular.widthOfTextAtSize(totalText, cellValueSize);
  page.drawText(totalText, {
    x: colXTotal + colTotalW - 10 - totalWidth,
    y: dataY,
    size: cellValueSize,
    font: fontRegular,
    color: rgb(0.09, 0.1, 0.12),
  });

  /* -----------------------------
     Order details (under table)
     ----------------------------- */

  cursorY = tableTop - headerHeight - rowHeight - 32;

  const fieldLabelSize = 9;
  const fieldValueSize = 11;

  function drawField(label: string, value: string) {
    page.drawText(label, {
      x: marginX,
      y: cursorY,
      size: fieldLabelSize,
      font: fontBold,
      color: rgb(0.32, 0.37, 0.45),
    });
    cursorY -= 12;

    const raw = value || "—";
    const paragraphs = raw.split(/\n+/);

    paragraphs.forEach((para, idx) => {
      const wrapped = wrapText(
        para,
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
        cursorY -= 13;
      });

      // Extra gap between address lines groups
      if (idx < paragraphs.length - 1) {
        cursorY -= 2;
      }
    });

    cursorY -= 6;
  }

  const customerLine =
    (order.customerName || "—") +
    (order.customerEmail ? ` (${order.customerEmail})` : "");

  const formattedAddress = formatAddress(order.deliveryAddress);

  drawField("Order reference", order.orderId);
  drawField("Refinery reference", order.refineryRef);
  drawField("Customer", customerLine);
  drawField("Delivery address", formattedAddress);

  /* -----------------------------
     Total + note
     ----------------------------- */

  cursorY -= 8;

  page.drawText("Total payable to refinery", {
    x: marginX,
    y: cursorY,
    size: 11,
    font: fontBold,
    color: rgb(0.09, 0.1, 0.12),
  });

  const sumText = fmtMoney(order.totalForRefineryGbp);
  const sumWidth = fontBold.widthOfTextAtSize(sumText, 11);
  page.drawText(sumText, {
    x: marginX + 210 - sumWidth,
    y: cursorY,
    size: 11,
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
 * Format address into neat lines:
 *  - split on commas
 *  - uppercase the last part (postcode line)
 *  - join with newlines
 */
function formatAddress(raw: string | null): string {
  if (!raw) return "—";
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return "—";

  const lastIndex = parts.length - 1;
  parts[lastIndex] = parts[lastIndex].toUpperCase(); // postcode line

  // Join with newlines so drawField shows one line per part
  return parts.join("\n");
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
